import { describe, expect, it, vi } from "vitest";
import {
  GeminiOwnerCommandParser,
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
    vi.unstubAllGlobals();
  });
});
