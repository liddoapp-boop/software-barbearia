import { describe, expect, it, vi } from "vitest";
import {
  GeminiOwnerCommandParser,
  getDeterministicDateRecognitionType,
  getGeminiOwnerCommandTimeoutMsFromEnv,
  OwnerCommandContext,
  parseDeterministicOwnerCommand,
} from "../src/application/owner-command-ai";

const context: OwnerCommandContext = {
  unitId: "unit-01",
  now: new Date("2026-07-12T12:00:00.000Z"),
  timezone: "America/Sao_Paulo",
  services: [{ name: "Corte Premium", category: "CORTE" }],
  products: [{ name: "Pomada Matte", category: "Finalizacao" }],
  paymentMethods: [{ name: "Pix" }, { name: "Cartao de debito" }, { name: "Dinheiro" }],
  professionals: [{ name: "Geovane Borges" }],
};

function parser(timeoutMs = 20) {
  return new GeminiOwnerCommandParser("test-key", "test-model", timeoutMs);
}

function mockSemanticSchedule(fields: Partial<{
  clientName: string;
  serviceNames: string[];
  professionalName: string;
  date: string;
  time: string;
  confidence: number;
  missingFields: string[];
}> = {}) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        intent: "schedule_appointment",
        clientName: "",
        serviceNames: [],
        professionalName: "",
        date: "",
        time: "",
        confidence: 0.9,
        missingFields: [],
        ...fields,
      }) }] } }],
    }),
  }));
}

function semanticV2(input: Partial<{
  intent: "schedule_appointment" | "unknown";
  intentConfidence: number;
  clientName: string;
  clientEvidence: string;
  clientConfidence: number;
  serviceName: string;
  serviceEvidence: string;
  serviceConfidence: number;
  date: string;
  dateEvidence: string;
  dateConfidence: number;
  time: string;
  timeEvidence: string;
  timeConfidence: number;
  period: "morning" | "afternoon" | "night" | "unspecified";
  timeAmbiguous: boolean;
  timePrecision: "exact" | "approximate" | "unspecified";
}> = {}) {
  return {
    schemaVersion: "1.0",
    intent: input.intent ?? "schedule_appointment",
    intentConfidence: input.intentConfidence ?? 0.96,
    fields: {
      clientName: { value: input.clientName ?? "João Victor", evidence: input.clientEvidence ?? "João Victor", confidence: input.clientConfidence ?? 0.96 },
      serviceNames: { values: input.serviceName ? [input.serviceName] : ["Corte"], evidence: input.serviceEvidence ?? "corte", confidence: input.serviceConfidence ?? 0.95 },
      professionalName: { value: "", evidence: "", confidence: 0 },
      date: { expression: input.dateEvidence ?? "amanhã", canonical: input.date ?? "2026-07-14", evidence: input.dateEvidence ?? "amanhã", confidence: input.dateConfidence ?? 0.96 },
      time: { expression: input.timeEvidence ?? "5 da tarde", canonical: input.time ?? "17:00", period: input.period ?? "afternoon", ambiguous: input.timeAmbiguous ?? false, precision: input.timePrecision ?? "exact", evidence: input.timeEvidence ?? "5 da tarde", confidence: input.timeConfidence ?? 0.96 },
    },
    ambiguities: input.timeAmbiguous ? [{ field: "time", reason: "Periodo nao informado." }] : [],
    missingFields: [],
  };
}

function mockSemanticV2(response: ReturnType<typeof semanticV2>) {
  return vi.fn(async (_url?: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }),
  }));
}

describe("parser textual Gemini tipado", () => {
  it("usa timeout textual padrao de 15 segundos e respeita configuracao valida", () => {
    const previous = process.env.GEMINI_TIMEOUT_MS;
    try {
      delete process.env.GEMINI_TIMEOUT_MS;
      expect(getGeminiOwnerCommandTimeoutMsFromEnv()).toBe(15_000);
      process.env.GEMINI_TIMEOUT_MS = "12000";
      expect(getGeminiOwnerCommandTimeoutMsFromEnv()).toBe(12_000);
      process.env.GEMINI_TIMEOUT_MS = "invalido";
      expect(getGeminiOwnerCommandTimeoutMsFromEnv()).toBe(15_000);
    } finally {
      if (previous === undefined) delete process.env.GEMINI_TIMEOUT_MS;
      else process.env.GEMINI_TIMEOUT_MS = previous;
    }
  });

  it("reconhece venda e agendamento completos deterministicamente", () => {
    expect(parseDeterministicOwnerCommand({ context, message: "Vendi uma pomada para Cliente Teste, ele pagou no Pix." })).toMatchObject({
      intent: "sell_product",
      missingFields: [],
    });
    expect(parseDeterministicOwnerCommand({ context, message: "Agendar Corte para Cliente Teste amanha as 10h" })).toMatchObject({
      intent: "schedule_appointment",
      missingFields: [],
    });
  });

  it.each([
    ["Agendar Corte Premium para Cliente Teste dia 14/07/2026 as 11:00", "numeric_slash"],
    ["Agendar Corte Premium para Cliente Teste 14 de julho de 2026 as 11:00", "month_name"],
    ["Agendar Corte Premium para Cliente Teste dia 14 de julho de 2026 as 11:00", "month_name"],
    ["Agendar Corte Premium para Cliente Teste quatorze de julho de dois mil e vinte e seis as 11:00", "fully_spoken"],
    ["Agendar Corte Premium para Cliente Teste dia quatorze do sete de dois mil e vinte e seis as 11:00", "spoken_numeric_month"],
    ["Agendar Corte Premium para Cliente Teste quatorze do sete de vinte e seis as 11:00", "spoken_numeric_month"],
  ])("normaliza data falada sem depender do Gemini: %s", (message, recognitionType) => {
    expect(parseDeterministicOwnerCommand({ context, message })).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName: "Cliente Teste",
        date: "2026-07-14",
        time: "11:00",
      },
      missingFields: [],
    });
    expect(getDeterministicDateRecognitionType(message, context.now, context.timezone)).toBe(recognitionType);
  });

  it.each([
    "Agendar Corte Premium para Cliente Teste dia 31/02/2026 as 11:00",
    "Agendar Corte Premium para Cliente Teste dia trinta e um de fevereiro de dois mil e vinte e seis as 11:00",
  ])("rejeita data de calendario invalida: %s", (message) => {
    expect(parseDeterministicOwnerCommand({ context, message })).toMatchObject({
      intent: "schedule_appointment",
      draft: { date: "", time: "11:00" },
      missingFields: expect.arrayContaining(["date"]),
    });
    expect(getDeterministicDateRecognitionType(message, context.now, context.timezone)).toBeUndefined();
  });

  it.each([
    ["11:30", "11:30"],
    ["11h30", "11:30"],
    ["onze e trinta", "11:30"],
    ["onze horas e trinta", "11:30"],
    ["onze e meia", "11:30"],
    ["às onze e meia", "11:30"],
    ["às nove", "09:00"],
    ["nove da manha", "09:00"],
    ["duas da tarde", "14:00"],
    ["às duas da tarde", "14:00"],
    ["sete da noite", "19:00"],
    ["meio-dia", "12:00"],
    ["meia-noite", "00:00"],
    ["quinze para as quatorze", "13:45"],
    ["dez para as onze", "10:50"],
  ])("normaliza horario cotidiano sem depender do Gemini: %s", (spokenTime, expectedTime) => {
    expect(parseDeterministicOwnerCommand({
      context,
      message: `Agendar Corte Premium para Cliente Teste dia 14/07/2026 ${spokenTime}`,
    })).toMatchObject({
      intent: "schedule_appointment",
      draft: { date: "2026-07-14", time: expectedTime },
      missingFields: [],
    });
  });

  it("reconhece a frase real completa com data e horario totalmente falados", () => {
    const message = "Agendar corte para cliente teste confirmar agenda dia quatorze de julho de dois mil e vinte e seis às onze e trinta";
    expect(parseDeterministicOwnerCommand({ context, message })).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName: "cliente teste confirmar agenda",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "2026-07-14",
        time: "11:30",
      },
      missingFields: [],
    });
    expect(getDeterministicDateRecognitionType(message, context.now, context.timezone)).toBe("fully_spoken");
  });

  it.each([
    "Agendar um corte para o cliente João Vittor no dia 13/7/2026 às 17h00",
    "Agendar corte para o cliente João Vittor no dia 13/7/2026 às 17h00",
    "Agendar o corte para o cliente João Vittor dia 13/7/2026 às 17h00",
    "Agendar um corte para João Vittor no dia 13/7/2026 às 17h00",
  ])("interpreta deterministicamente a variacao real de agendamento: %s", (message) => {
    expect(parseDeterministicOwnerCommand({ context, message })).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName: "João Vittor",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "2026-07-13",
        time: "17:00",
      },
      missingFields: [],
    });
    expect(getDeterministicDateRecognitionType(message, context.now, context.timezone)).toBe("numeric_slash");
  });

  it("normaliza deterministicamente a transcricao real com hesitacao e periodo", () => {
    const realContext = { ...context, now: new Date("2026-07-13T15:00:00.000Z") };
    const message = "Marque um corte para o cliente João Vítor, é, amanhã, às 5 da tarde.";

    expect(parseDeterministicOwnerCommand({ context: realContext, message })).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName: "João Vítor",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "2026-07-14",
        time: "17:00",
      },
      missingFields: [],
      executed: false,
    });
  });

  it.each(["é", "eh", "hum", "ahn"])("remove somente a hesitacao terminal '%s' do nome capturado", (hesitation) => {
    const realContext = { ...context, now: new Date("2026-07-13T15:00:00.000Z") };
    expect(parseDeterministicOwnerCommand({
      context: realContext,
      message: `Marque um corte para o cliente João É Vítor, ${hesitation}, amanhã, às 5 da tarde.`,
    })).toMatchObject({
      draft: { clientName: "João É Vítor", date: "2026-07-14", time: "17:00" },
      missingFields: [],
    });
  });

  it("mantem horario sem periodo ambiguo", () => {
    const realContext = { ...context, now: new Date("2026-07-13T15:00:00.000Z") };
    expect(parseDeterministicOwnerCommand({
      context: realContext,
      message: "Marque um corte para o cliente João Vítor amanhã às cinco.",
    })).toMatchObject({
      draft: { clientName: "João Vítor", date: "2026-07-14", time: "" },
      missingFields: expect.arrayContaining(["time"]),
      warnings: [expect.stringMatching(/ambiguo/i)],
    });
  });

  it("pede esclarecimento para quinze para as duas sem regra segura de expediente", () => {
    expect(parseDeterministicOwnerCommand({
      context,
      message: "Agendar Corte Premium para Cliente Teste dia 14/07/2026 quinze para as duas",
    })).toMatchObject({
      intent: "schedule_appointment",
      draft: { date: "2026-07-14", time: "" },
      missingFields: expect.arrayContaining(["time"]),
      warnings: [expect.stringMatching(/ambiguo/i)],
    });
  });

  it.each([
    "Agendar Corte Premium para Cliente Teste dia 14/07/2026 as 24:00",
    "Agendar Corte Premium para Cliente Teste dia 14/07/2026 as onze e sessenta",
  ])("rejeita horario invalido: %s", (message) => {
    expect(parseDeterministicOwnerCommand({ context, message })).toMatchObject({
      intent: "schedule_appointment",
      draft: { date: "2026-07-14", time: "" },
      missingFields: expect.arrayContaining(["time"]),
      warnings: [expect.stringMatching(/invalido/i)],
    });
  });

  it("mantem data ausente como campo faltante", () => {
    expect(parseDeterministicOwnerCommand({ context, message: "Agendar Corte Premium para Cliente Teste as 11:00" })).toMatchObject({
      intent: "schedule_appointment",
      draft: { date: "", time: "11:00" },
      missingFields: expect.arrayContaining(["date"]),
    });
  });

  it.each([
    {
      message: "Agende um corte para o João dia 13 às 17.",
      semantic: { clientName: "João", serviceNames: ["Corte"], date: "2026-07-13", time: "17:00" },
      expected: { clientName: "João", serviceNames: ["Corte"], date: "2026-07-13", time: "17:00" },
      missingFields: [],
    },
    {
      message: "Marca o João para cortar o cabelo amanhã às cinco.",
      semantic: { clientName: "João", serviceNames: ["Corte"], date: "2026-07-13", time: "17:00" },
      expected: { clientName: "João", serviceNames: ["Corte Premium"], date: "2026-07-13", time: "" },
      missingFields: ["time"],
    },
    {
      message: "Coloca o João na agenda dia treze às cinco da tarde.",
      semantic: { clientName: "João", serviceNames: [], date: "2026-07-13", time: "17:00" },
      expected: { clientName: "João", serviceNames: [], date: "2026-07-13", time: "17:00" },
      missingFields: ["serviceNames"],
    },
    {
      message: "Reserva um horário de corte pro João.",
      semantic: { clientName: "João", serviceNames: ["Corte"] },
      expected: { clientName: "João", serviceNames: ["Corte"], date: "", time: "" },
      missingFields: ["date", "time"],
    },
    {
      message: "Tem como encaixar o João amanhã às 17?",
      semantic: { clientName: "João", date: "2026-07-13", time: "17:00" },
      expected: { clientName: "João", serviceNames: [], date: "2026-07-13", time: "17:00" },
      missingFields: ["serviceNames"],
    },
    {
      message: "Deixa marcado um corte para João Vittor dia 13/7 às 17h.",
      semantic: { clientName: "João Vittor", serviceNames: ["Corte"], date: "2026-07-13", time: "17:00" },
      expected: { clientName: "João Vittor", serviceNames: ["Corte"], date: "2026-07-13", time: "17:00" },
      missingFields: [],
    },
    {
      message: "João vai cortar com o Geovane às cinco.",
      semantic: { clientName: "João", serviceNames: ["Corte"], professionalName: "Geovane" },
      expected: { clientName: "João", serviceNames: ["Corte Premium"], professionalName: "Geovane Borges", date: "", time: "" },
      missingFields: ["date", "time"],
    },
    {
      message: "Quero marcar um horário para o João.",
      semantic: { clientName: "João" },
      expected: { clientName: "João", serviceNames: [], date: "", time: "" },
      missingFields: ["serviceNames", "date", "time"],
    },
  ])("interpreta linguagem natural com grounding: $message", async ({ message, semantic, expected, missingFields }) => {
    vi.stubGlobal("fetch", mockSemanticSchedule(semantic));
    const attempt = await parser().parseGemini({ context, message });
    expect(attempt.result).toMatchObject({
      intent: "schedule_appointment",
      draft: expected,
      missingFields,
      allowedNextActions: [],
      executed: false,
    });
    vi.unstubAllGlobals();
  });

  it("descarta entidades, data e horario que nao estejam ancorados na mensagem", async () => {
    vi.stubGlobal("fetch", mockSemanticSchedule({
      clientName: "João Santos",
      serviceNames: ["Barba"],
      professionalName: "Profissional Inventado",
      date: "2026-07-13",
      time: "17:00",
    }));
    const attempt = await parser().parseGemini({ context, message: "Marca um corte para o João." });
    expect(attempt.result).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName: "João",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "",
        time: "",
      },
      missingFields: ["date", "time"],
      allowedNextActions: [],
      executed: false,
    });
    vi.unstubAllGlobals();
  });

  it("nao transforma mencao passiva de agenda em acao", async () => {
    vi.stubGlobal("fetch", mockSemanticSchedule({ clientName: "João", date: "2026-07-13", time: "17:00" }));
    await expect(parser().parseGemini({ context, message: "A agenda do João está cheia amanhã às 17." })).resolves.toMatchObject({
      status: "UNSUPPORTED",
      result: { intent: "unknown", draft: {}, executed: false },
    });
    vi.unstubAllGlobals();
  });

  it("aceita pedido sem verbo decorado quando a semantica e os dados estao ancorados", async () => {
    vi.stubGlobal("fetch", mockSemanticSchedule({
      clientName: "João",
      serviceNames: ["Corte"],
      date: "2026-07-13",
      time: "17:00",
    }));
    await expect(parser().parseGemini({
      context,
      message: "Dá para deixar o João com um corte amanhã às 17?",
    })).resolves.toMatchObject({
      status: "PARSED_COMPLETE",
      result: {
        intent: "schedule_appointment",
        draft: { clientName: "João", serviceNames: ["Corte"], date: "2026-07-13", time: "17:00" },
        missingFields: [],
        executed: false,
      },
    });
    vi.unstubAllGlobals();
  });

  it("valida a primeira transcricao real com confianca e origem por campo", async () => {
    const message = "Marque um corte para o cliente João Victor. É amanhã, às 5 da tarde.";
    const realContext = { ...context, now: new Date("2026-07-13T15:00:00.000Z") };
    const fetchMock = mockSemanticV2(semanticV2({ clientEvidence: "cliente João Victor" }));
    vi.stubGlobal("fetch", fetchMock);

    const attempt = await parser().parseGemini({ context: realContext, message });

    expect(attempt).toMatchObject({
      status: "PARSED_COMPLETE",
      result: {
        intent: "schedule_appointment",
        draft: {
          clientName: "João Victor",
          serviceNames: ["Corte Premium"],
          professionalName: "Geovane Borges",
          date: "2026-07-14",
          time: "17:00",
        },
        missingFields: [],
        fieldDiagnostics: {
          clientName: { confidence: 0.96, source: "gemini_validated", status: "accepted" },
          serviceNames: { confidence: 0.95, source: "gemini_validated", status: "accepted" },
          professionalName: { confidence: 1, source: "context_default", status: "accepted" },
          date: { confidence: 0.96, source: "gemini_validated", status: "accepted" },
          time: { confidence: 0.96, source: "gemini_validated", status: "accepted" },
        },
      },
    });
    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(request.generationConfig).toMatchObject({ responseMimeType: "application/json" });
    expect(request.generationConfig.responseJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        canonicalTime: { anyOf: [{ type: "string" }, { type: "null" }] },
        confidence: { type: "object" },
      },
    });
    vi.unstubAllGlobals();
  });

  it.each([
    {
      name: "cliente com introdutor e fragmento",
      response: semanticV2({ clientName: "cliente João Victor. É", clientEvidence: "cliente João Victor. É" }),
      field: "clientName",
      reason: "contains_introducer",
    },
    {
      name: "cliente abaixo do limiar",
      response: semanticV2({ clientConfidence: 0.62 }),
      field: "clientName",
      reason: "low_confidence",
    },
    {
      name: "periodo da tarde perdido",
      response: semanticV2({ time: "05:00" }),
      field: "time",
      reason: "deterministic_semantic_divergence",
    },
    {
      name: "data divergente do texto",
      response: semanticV2({ date: "2026-07-15" }),
      field: "date",
      reason: "deterministic_semantic_divergence",
    },
  ])("rejeita campo preenchido mas semanticamente suspeito: $name", async ({ response, field, reason }) => {
    const message = "Marque um corte para o cliente João Victor. É amanhã, às 5 da tarde.";
    const realContext = { ...context, now: new Date("2026-07-13T15:00:00.000Z") };
    vi.stubGlobal("fetch", mockSemanticV2(response));

    const attempt = await parser().parseGemini({ context: realContext, message });

    expect(attempt.result?.missingFields).toContain(field);
    expect(attempt.result?.allowedNextActions).toEqual([]);
    expect(attempt.result?.fieldDiagnostics?.[field]).toMatchObject({ status: "rejected", reason });
    vi.unstubAllGlobals();
  });

  it.each([
    ["Vendi uma pomada para Joao e ele pagou no Pix.", "Joao", "Pix"],
    ["Vendi uma pomada para Joao, ele pagou no Pix.", "Joao", "Pix"],
    ["Vendi uma pomada para Joao. Pagou no Pix.", "Joao", "Pix"],
    ["Vendi uma pomada para Joao ai ele pagou no Pix", "Joao", "Pix"],
    ["Vendi uma pomada para Joao e foi no debito.", "Joao", "Cartao de debito"],
    ["Vendi uma pomada para Joao com pagamento em dinheiro.", "Joao", "Dinheiro"],
    ["Vendi uma pomada para Joao e Maria Barbearia e ele pagou no Pix.", "Joao e Maria Barbearia", "Pix"],
    ["Vendi uma pomada para Antonio de Almeida e ele pagou no Pix.", "Antonio de Almeida", "Pix"],
    ["Vendi uma pomada para Joao do Carmo e ele pagou no Pix.", "Joao do Carmo", "Pix"],
    ["Vendi uma pomada para cliente teste IA WhatsApp real e ele pagou no Pix.", "cliente teste IA WhatsApp real", "Pix"],
    ["Vendi uma pomada para cliente teste ao WhatsApp real. Ele pagou no Pix.", "cliente teste ao WhatsApp real", "Pix"],
  ])("delimita cliente em fala natural: %s", (message, clientName, paymentMethod) => {
    expect(parseDeterministicOwnerCommand({ context, message })).toMatchObject({
      intent: "sell_product",
      draft: { clientName, paymentMethod },
      missingFields: [],
    });
  });

  it("mantem comando sem pagamento incompleto, sem inventar campo", () => {
    expect(parseDeterministicOwnerCommand({ context, message: "Vendi uma pomada para Joao da Silva." })).toMatchObject({
      draft: { clientName: "Joao da Silva", paymentMethod: undefined },
      missingFields: ["paymentMethod"],
    });
  });

  it.each([
    [429, "gemini_429"],
    [503, "gemini_5xx"],
    [400, "gemini_http_error"],
  ])("classifica HTTP %i sem expor resposta", async (httpStatus, failureCode) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: httpStatus })));
    await expect(parser().parseGemini({ context, message: "comando incompleto" })).resolves.toMatchObject({
      status: "PROVIDER_ERROR",
      httpStatus,
      failureCode,
    });
    vi.unstubAllGlobals();
  });

  it("classifica JSON invalido e resposta vazia", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "{" }] } }] }) })));
    await expect(parser().parseGemini({ context, message: "comando" })).resolves.toMatchObject({ status: "INVALID_RESPONSE", failureCode: "gemini_invalid_json" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) })));
    await expect(parser().parseGemini({ context, message: "comando" })).resolves.toMatchObject({ status: "INVALID_RESPONSE", failureCode: "gemini_empty_response" });
    vi.unstubAllGlobals();
  });

  it("classifica timeout e o parse legado preserva o deterministico", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn(async () => { throw abort; }));
    await expect(parser().parseGemini({ context, message: "comando" })).resolves.toMatchObject({ status: "TIMEOUT", failureCode: "gemini_timeout" });
    await expect(parser().parse({ context, message: "Vendi uma pomada para Cliente Teste, ele pagou no Pix." })).resolves.toMatchObject({
      intent: "sell_product",
      fallbackReason: "gemini_timeout",
    });
    await expect(parser().parse({ context, message: "Agendar Corte Premium para Cliente Teste as 11:00" })).resolves.toMatchObject({
      intent: "schedule_appointment",
      draft: { date: "", time: "11:00" },
      missingFields: expect.arrayContaining(["date"]),
      fallbackReason: "gemini_timeout",
      executed: false,
    });
    vi.unstubAllGlobals();
  });
});
