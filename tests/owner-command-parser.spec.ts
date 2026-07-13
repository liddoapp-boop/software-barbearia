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
