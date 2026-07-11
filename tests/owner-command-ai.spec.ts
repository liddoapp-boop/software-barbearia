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

function mockGeminiResponse(intent = "checkout_service") {
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
                  summary: "Atendimento de Corte para Joao com pagamento Pix.",
                  draft: {
                    clientName: "Joao",
                    services: ["Corte"],
                    products: [],
                    paymentMethod: "Pix",
                    total: 50,
                  },
                  missingFields: [],
                  warnings: [],
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

async function countState(app: FastifyInstance, token: string) {
  const [appointments, inventory, financial] = await Promise.all([
    app.inject({
      method: "GET",
      url: "/appointments?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: "/inventory?unitId=unit-01",
      headers: { authorization: `Bearer ${token}` },
    }),
    app.inject({
      method: "GET",
      url: "/financial/entries?unitId=unit-01&start=2026-04-01T00:00:00.000Z&end=2026-04-30T23:59:59.999Z",
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

describe("Atendente IA owner-only", () => {
  beforeEach(() => {
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.GEMINI_API_KEY = "fake-gemini-key-for-test";
    process.env.GEMINI_MODEL = "gemini-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    });
    expect(response.json().allowedNextActions).toEqual(["confirm_later"]);
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

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(init.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = requestBody.contents[0].parts[0].text;
    expect(prompt).not.toContain("fake-gemini-key-for-test");
    expect(prompt).not.toContain("DATABASE_URL");
    expect(prompt).not.toContain("AUTH_SECRET");
    expect(prompt).not.toContain("EVOLUTION_API_KEY");
    expect(prompt).not.toContain("cli-01");
    expect(prompt).not.toContain("pro-01");
    expect(prompt).not.toContain("prd-pomada");
  });
});
