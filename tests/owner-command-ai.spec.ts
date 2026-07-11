import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";

const originalEnv = { ...process.env };

async function loginAs(
  app: FastifyInstance,
  input: {
    email: string;
    password: string;
    activeUnitId?: string;
  },
) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: input,
  });
  expect(login.statusCode).toBe(200);
  return login.json().accessToken as string;
}

function mockGeminiResponse(
  intent = "checkout_service",
  overrides: Partial<{
    summary: string;
    draft: Record<string, unknown>;
    missingFields: string[];
    warnings: string[];
  }> = {},
) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ok: true,
                  mode: "preview_only",
                  intent,
                  confidence: 0.85,
                  summary: overrides.summary ?? "Atendimento de Corte para Joao com pagamento Pix.",
                  draft: overrides.draft ?? {
                    clientName: "Joao",
                    services: ["Corte"],
                    products: [],
                    paymentMethod: "Pix",
                    total: 50,
                  },
                  missingFields: overrides.missingFields ?? [],
                  warnings: overrides.warnings ?? [],
                  allowedNextActions: ["confirm_later"],
                  executed: false,
                }),
              },
            ],
          },
        },
      ],
    }),
  }));
}

function mockGeminiInvalidJsonResponse() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: "{" }],
          },
        },
      ],
    }),
  }));
}

function mockGeminiDateTimeResponse() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ok: true,
                  mode: "preview_only",
                  intent: "schedule_appointment",
                  confidence: 0.95,
                  summary: "Agendamento de Corte para CLIENTE TESTE IA AGENDAMENTO.",
                  draft: {
                    clientName: "CLIENTE TESTE IA AGENDAMENTO",
                    serviceName: "Corte",
                    dateTime: "2026-07-12T10:00:00-03:00",
                    professionalName: "Geovane Borges",
                  },
                  missingFields: [],
                  warnings: [],
                  allowedNextActions: ["Confirmar Agendamento"],
                  executed: false,
                }),
              },
            ],
          },
        },
      ],
    }),
  }));
}

async function countState(app: FastifyInstance, token: string, unitId = "unit-01") {
  const [appointments, inventory, financial] = await Promise.all([
    app.inject({
      method: "GET",
      url: `/appointments?unitId=${unitId}`,
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: `/inventory?unitId=${unitId}`,
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: `/financial/entries?unitId=${unitId}&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z`,
      headers: { authorization: `Bearer ${token}` },
    }),
  ]);
  expect(appointments.statusCode).toBe(200);
  expect(inventory.statusCode).toBe(200);
  expect(financial.statusCode).toBe(200);
  return {
    appointments: appointments.json().appointments.length,
    stockTotal: inventory
      .json()
      .products.reduce((acc: number, item: { quantity?: number; stockQty?: number }) => acc + Number(item.quantity ?? item.stockQty ?? 0), 0),
    financialEntries: financial.json().entries.length,
  };
}

function getOwnerCommandPrompt(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const requestBody = JSON.parse(String(init.body)) as {
    contents: Array<{ parts: Array<{ text: string }> }>;
  };
  return requestBody.contents[0].parts[0].text;
}

function getSaoPauloDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get("year") ?? 0),
    month: Number(map.get("month") ?? 0),
    day: Number(map.get("day") ?? 0),
  };
}

function formatDateParts(parts: { year: number; month: number; day: number }) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function nextWeekdayDate(target: number) {
  const today = getSaoPauloDateParts();
  const todayDay = new Date(Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0)).getUTCDay();
  const diff = (target - todayDay + 7) % 7 || 7;
  return formatDateParts(addDays(today, diff));
}

function tomorrowDate() {
  return formatDateParts(addDays(getSaoPauloDateParts(), 1));
}

describe("Atendente IA owner-only", () => {
  beforeEach(() => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.GEMINI_API_KEY = "fake-gemini-key-for-test";
    process.env.GEMINI_MODEL = "gemini-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("permite owner interpretar texto e sempre retorna executed false", async () => {
    const fetchMock = mockGeminiResponse();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Fiz corte no Joao e ele pagou 50 no Pix.",
        screenContext: "atendente-ia",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      mode: "preview_only",
      intent: "checkout_service",
      executed: false,
      executionMessage: "Execucao desta acao sera liberada em uma proxima etapa.",
    });
    expect(response.json().allowedNextActions).toEqual([]);
  });

  it("bloqueia sem token, recepcao e profissional", async () => {
    vi.stubGlobal("fetch", mockGeminiResponse());
    const app = createApp();
    const receptionToken = await loginAs(app, {
      email: "recepcao@barbearia.local",
      password: "recepcao123",
      activeUnitId: "unit-01",
    });
    const professionalToken = await loginAs(app, {
      email: "profissional@barbearia.local",
      password: "profissional123",
      activeUnitId: "unit-01",
    });
    const payload = { unitId: "unit-01", message: "Quanto vendi hoje?" };

    const noToken = await app.inject({ method: "POST", url: "/ai/owner-command/parse", payload });
    expect(noToken.statusCode).toBe(401);

    const reception = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${receptionToken}` },
      payload,
    });
    expect(reception.statusCode).toBe(403);

    const professional = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${professionalToken}` },
      payload,
    });
    expect(professional.statusCode).toBe(403);

    const confirmPayload = { unitId: "unit-01", intent: "product_sale", draft: {} };
    const confirmReception = await app.inject({
      method: "POST",
      url: "/ai/owner-command/confirm",
      headers: { authorization: `Bearer ${receptionToken}` },
      payload: confirmPayload,
    });
    expect(confirmReception.statusCode).toBe(403);

    const confirmProfessional = await app.inject({
      method: "POST",
      url: "/ai/owner-command/confirm",
      headers: { authorization: `Bearer ${professionalToken}` },
      payload: confirmPayload,
    });
    expect(confirmProfessional.statusCode).toBe(403);
  });

  it("retorna erro seguro sem GEMINI_API_KEY", async () => {
    delete process.env.GEMINI_API_KEY;
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Quanto vendi hoje?",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("IA indisponivel: configure GEMINI_API_KEY no ambiente local seguro.");
  });

  it("nao cria agendamento, nao altera estoque e nao cria financeiro", async () => {
    vi.stubGlobal("fetch", mockGeminiResponse("product_sale"));
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const before = await countState(app, token);

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Vendi uma pomada para o Lucas.",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().executed).toBe(false);

    await expect(countState(app, token)).resolves.toEqual(before);
  });

  it("gera token para agendamento valido e so cria apos confirmacao humana", async () => {
    vi.stubGlobal(
      "fetch",
      mockGeminiResponse("schedule_appointment", {
        summary: "Agendamento para Joao Santos.",
        draft: {
          clientName: "Joao",
          serviceNames: ["Corte"],
          professionalName: "Geovane Borges",
          date: "2026-12-15",
          time: "10:00",
        },
      }),
    );
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const before = await countState(app, token);

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda o Joao dia 15/12 as 10h para corte.",
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      intent: "schedule_appointment",
      executed: false,
      allowedNextActions: ["confirm_execute"],
      missingFields: [],
      confirmationMessage: "Confirmar criacao deste agendamento?",
    });
    expect(typeof preview.json().confirmationToken).toBe("string");
    await expect(countState(app, token)).resolves.toEqual(before);

    const confirm = await app.inject({
      method: "POST",
      url: "/ai/owner-command/confirm",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        intent: "schedule_appointment",
        draft: preview.json().draft,
        confirmationToken: preview.json().confirmationToken,
      },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({
      ok: true,
      mode: "executed_after_confirmation",
      intent: "schedule_appointment",
      executed: true,
      message: "Agendamento criado com sucesso.",
    });

    const after = await countState(app, token);
    expect(after.appointments).toBe(before.appointments + 1);
    expect(after.stockTotal).toBe(before.stockTotal);
    expect(after.financialEntries).toBe(before.financialEntries);
  });

  it("nao libera confirmacao quando faltam campos obrigatorios do agendamento", async () => {
    vi.stubGlobal(
      "fetch",
      mockGeminiResponse("schedule_appointment", {
        draft: {
          clientName: "Joao",
          serviceNames: ["Corte"],
        },
        missingFields: ["date", "time"],
      }),
    );
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const before = await countState(app, token);

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda o Joao para corte.",
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json().allowedNextActions).toEqual([]);
    expect(preview.json().confirmationToken).toBeUndefined();
    expect(preview.json().missingFields).toEqual(["date", "time"]);
    await expect(countState(app, token)).resolves.toEqual(before);
  });

  it("gera previa deterministica para comando simples com amanha as 10h quando a IA varia o JSON", async () => {
    vi.stubGlobal("fetch", mockGeminiInvalidJsonResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const before = await countState(app, token);

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda CLIENTE TESTE IA AGENDAMENTO amanhã às 10h para corte.",
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      intent: "schedule_appointment",
      executed: false,
      allowedNextActions: ["confirm_execute"],
      missingFields: [],
      draft: {
        clientName: "CLIENTE TESTE IA AGENDAMENTO",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: tomorrowDate(),
        time: "10:00",
      },
    });
    await expect(countState(app, token)).resolves.toEqual(before);
  });

  it("aceita cliente em maiusculas, serviceName singular e dateTime retornados pela IA", async () => {
    vi.stubGlobal("fetch", mockGeminiDateTimeResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda CLIENTE TESTE IA AGENDAMENTO amanhã às 10h para corte.",
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      intent: "schedule_appointment",
      executed: false,
      allowedNextActions: ["confirm_execute"],
      draft: {
        clientName: "CLIENTE TESTE IA AGENDAMENTO",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "2026-07-12",
        time: "10:00",
      },
    });
  });

  it("gera previa para marca corte para Pedro amanha as 14h", async () => {
    vi.stubGlobal("fetch", mockGeminiInvalidJsonResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Marca corte para Pedro amanhã às 14h.",
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      intent: "schedule_appointment",
      executed: false,
      allowedNextActions: ["confirm_execute"],
      draft: {
        clientName: "Pedro",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: tomorrowDate(),
        time: "14:00",
      },
    });
  });

  it("gera previa para agende barba para Carlos na terca as 9h", async () => {
    vi.stubGlobal("fetch", mockGeminiInvalidJsonResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agende barba para Carlos na terça às 9h.",
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      intent: "schedule_appointment",
      executed: false,
      allowedNextActions: ["confirm_execute"],
      draft: {
        clientName: "Carlos",
        serviceNames: ["Barba"],
        professionalName: "Geovane Borges",
        date: nextWeekdayDate(2),
        time: "09:00",
      },
    });
  });

  it("retorna missingFields para comando deterministico incompleto", async () => {
    vi.stubGlobal("fetch", mockGeminiInvalidJsonResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda o João para corte.",
      },
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json().executed).toBe(false);
    expect(preview.json().allowedNextActions).toEqual([]);
    expect(preview.json().confirmationToken).toBeUndefined();
    expect(preview.json()).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName: "João",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
      },
    });
    expect(preview.json().missingFields).toEqual(["date", "time"]);
  });

  it("cria agendamento de cliente novo somente apos confirmacao e sem financeiro ou estoque", async () => {
    vi.stubGlobal("fetch", mockGeminiInvalidJsonResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const before = await countState(app, token);

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda CLIENTE TESTE IA AGENDAMENTO amanhã às 10h para corte.",
      },
    });
    expect(preview.statusCode).toBe(200);
    await expect(countState(app, token)).resolves.toEqual(before);

    const confirm = await app.inject({
      method: "POST",
      url: "/ai/owner-command/confirm",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        intent: "schedule_appointment",
        draft: preview.json().draft,
        confirmationToken: preview.json().confirmationToken,
      },
    });

    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({
      ok: true,
      mode: "executed_after_confirmation",
      intent: "schedule_appointment",
      executed: true,
    });
    expect(confirm.json().appointment.unitId).toBe("unit-01");
    expect(confirm.json().appointment.serviceId).toBe("svc-corte");
    expect(confirm.json().appointment.professionalId).toBe("pro-01");
    const after = await countState(app, token);
    expect(after.appointments).toBe(before.appointments + 1);
    expect(after.stockTotal).toBe(before.stockTotal);
    expect(after.financialEntries).toBe(before.financialEntries);
  });

  it("mantem outras intencoes apenas como previa na confirmacao", async () => {
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const before = await countState(app, token);

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/confirm",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        intent: "product_sale",
        draft: { clientName: "Lucas", products: ["Pomada"] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      mode: "preview_only",
      intent: "product_sale",
      executed: false,
      message: "Execucao desta acao sera liberada em uma proxima etapa.",
    });
    await expect(countState(app, token)).resolves.toEqual(before);
  });

  it("usa a unidade autenticada no contexto e ignora unitId adulterado no body", async () => {
    const fetchMock = mockGeminiResponse("schedule_appointment", {
      draft: {
        clientName: "Joao",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "2026-12-16",
        time: "10:00",
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-02",
        message: "Agenda o Joao dia 16/12 as 10h para corte.",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().allowedNextActions).toEqual(["confirm_execute"]);
    const prompt = getOwnerCommandPrompt(fetchMock);
    expect(prompt).toContain("Corte");
    expect(prompt).toContain("Geovane Borges");
  });

  it("confirma agendamento na unidade autenticada mesmo com unitId adulterado no body", async () => {
    vi.stubGlobal(
      "fetch",
      mockGeminiResponse("schedule_appointment", {
        draft: {
          clientName: "Joao",
          serviceNames: ["Corte"],
          professionalName: "Geovane Borges",
          date: "2026-12-17",
          time: "10:00",
        },
      }),
    );
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });
    const beforeUnit01 = await countState(app, token, "unit-01");

    const preview = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-02",
        message: "Agenda o Joao dia 17/12 as 10h para corte.",
      },
    });
    expect(preview.statusCode).toBe(200);

    const confirm = await app.inject({
      method: "POST",
      url: "/ai/owner-command/confirm",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-02",
        intent: "schedule_appointment",
        draft: preview.json().draft,
        confirmationToken: preview.json().confirmationToken,
      },
    });

    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().appointment.unitId).toBe("unit-01");
    const afterUnit01 = await countState(app, token, "unit-01");
    expect(afterUnit01.appointments).toBe(beforeUnit01.appointments + 1);
    expect(afterUnit01.stockTotal).toBe(beforeUnit01.stockTotal);
    expect(afterUnit01.financialEntries).toBe(beforeUnit01.financialEntries);
  });

  it("retorna erro seguro quando a unidade ativa autenticada nao existe", async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        id: "usr-owner-missing-unit",
        email: "owner-missing-unit@barbearia.local",
        password: "owner123",
        role: "owner",
        unitIds: ["unit-inexistente"],
      },
    ]);
    vi.stubGlobal("fetch", mockGeminiResponse());
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner-missing-unit@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-inexistente",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Quanto vendi hoje?",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Unidade ativa nao encontrada para o usuario autenticado.");
  });

  it("prompt e contexto minimo nao contem segredo nem IDs internos", async () => {
    const fetchMock = mockGeminiResponse();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginAs(app, {
      email: "owner@barbearia.local",
      password: "owner123",
      activeUnitId: "unit-01",
    });

    const response = await app.inject({
      method: "POST",
      url: "/ai/owner-command/parse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        unitId: "unit-01",
        message: "Agenda o Pedro amanha as 10h para corte.",
      },
    });
    expect(response.statusCode).toBe(200);

    const prompt = getOwnerCommandPrompt(fetchMock);
    expect(prompt).not.toContain("fake-gemini-key-for-test");
    expect(prompt).not.toContain("DATABASE_URL");
    expect(prompt).not.toContain("AUTH_SECRET");
    expect(prompt).not.toContain("EVOLUTION_API_KEY");
    expect(prompt).not.toContain("cli-01");
    expect(prompt).not.toContain("pro-01");
    expect(prompt).not.toContain("prd-pomada");
  });
});
