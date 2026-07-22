import { describe, expect, it } from "vitest";
import type { OwnerCommandContext } from "../src/application/owner-command-ai";
import {
  buildBarbershopAudioVocabulary,
  buildFocusedWhisperPrompt,
  canonicalizeAudioTranscript,
  portuguesePhoneticKey,
} from "../src/application/barbershop-audio-vocabulary";

function context(overrides: Partial<OwnerCommandContext> = {}): OwnerCommandContext {
  return {
    unitId: "unit-audio",
    unitName: "Barbearia do Geovane",
    now: new Date("2026-07-14T12:00:00.000Z"),
    timezone: "America/Sao_Paulo",
    screenContext: "whatsapp",
    professionals: [{ name: "Geovane Borges" }, { name: "Rafael Lima" }],
    services: [
      { name: "Corte", category: "Cabelo" },
      { name: "Barba", category: "Barba" },
      { name: "Corte e Barba", category: "Combo" },
    ],
    products: [
      { name: "Pomada", category: "Finalizacao" },
      { name: "Gel", category: "Finalizacao" },
      { name: "Shampoo", category: "Cabelo" },
    ],
    paymentMethods: [
      { name: "Pix" },
      { name: "Dinheiro" },
      { name: "Débito" },
      { name: "Crédito" },
    ],
    ...overrides,
  };
}

describe("vocabulario assistido do audio por unidade", () => {
  it("gera prompt deterministico, limitado e sem clientes ou dados pessoais", () => {
    const input = context();
    const first = buildBarbershopAudioVocabulary(input);
    const second = buildBarbershopAudioVocabulary(input);

    expect(second).toBe(first);
    expect(first.prompt.length).toBeLessThanOrEqual(1_500);
    expect(first.prompt.split(", ").length).toBeLessThanOrEqual(120);
    for (const professional of input.professionals) expect(first.prompt).toContain(professional.name);
    for (const service of input.services) expect(first.prompt).toContain(service.name);
    for (const product of input.products) expect(first.prompt).toContain(product.name);
    for (const payment of input.paymentMethods) expect(first.prompt).toContain(payment.name);
    expect(first.prompt).not.toContain("5511");
    expect(first.prompt).not.toContain("cliente@exemplo");
  });

  it("invalida o cache quando profissional, servico ou produto muda", () => {
    const first = buildBarbershopAudioVocabulary(context());
    const changed = buildBarbershopAudioVocabulary(context({
      products: [...context().products, { name: "Cera", category: "Finalizacao" }],
    }));

    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changed.prompt).toContain("Cera");
  });

  it.each([
    ["Jovani", "Geovane"],
    ["Giovani", "Geovane"],
  ])("aproxima foneticamente %s de %s", (spoken, canonical) => {
    expect(portuguesePhoneticKey(spoken)).not.toBe("");
    const result = canonicalizeAudioTranscript(`marcar corte com ${spoken} amanha`, buildBarbershopAudioVocabulary(context()));
    expect(result.transcript).toContain(canonical);
    expect(result.fields.some((field) => field.category === "professional" && field.status === "GROUNDED")).toBe(true);
  });

  it.each([
    ["pumada", "Pomada", "product"],
    ["pique", "Pix", "payment"],
    ["pomadas", "Pomada", "product"],
    ["debitos", "Débito", "payment"],
  ])("canonicaliza %s somente para candidato cadastrado", (spoken, canonical, category) => {
    const result = canonicalizeAudioTranscript(`registrar venda de um ${spoken}`, buildBarbershopAudioVocabulary(context()));
    expect(result.transcript).toContain(canonical);
    expect(result.fields.some((field) => field.category === category && ["EXACT", "GROUNDED"].includes(field.status))).toBe(true);
  });

  it("preserva nome de cliente novo e nao inventa sobrenome", () => {
    const result = canonicalizeAudioTranscript(
      "agendar corte para Jovani da Silva amanha as quatro da tarde",
      buildBarbershopAudioVocabulary(context()),
    );
    expect(result.transcript).toContain("da Silva");
    expect(result.transcript).not.toContain("Geovane Borges da Silva");
  });

  it("marca dois candidatos semelhantes como ambiguos sem autocorrecao", () => {
    const vocabulary = buildBarbershopAudioVocabulary(context({
      unitId: "unit-ambiguous",
      products: [{ name: "Pomada" }, { name: "Pomade" }],
    }));
    const result = canonicalizeAudioTranscript("vender pomad", vocabulary);
    expect(result.transcript).toContain("pomad");
    expect(result.fields.some((field) => field.status === "AMBIGUOUS")).toBe(true);
    expect(result.needsSecondPass).toBe(true);
  });

  it("nao corrige termo sem candidato forte", () => {
    const result = canonicalizeAudioTranscript("vender condicionador", buildBarbershopAudioVocabulary(context()));
    expect(result.transcript).toContain("condicionador");
    expect(result.correctedCategories).not.toContain("product");
  });

  it("canonicaliza a grafia fonetica mate no contexto de entrada de estoque", () => {
    const vocabulary = buildBarbershopAudioVocabulary(context({
      unitId: "unit-stock-matte",
      products: [{ name: "Pomada Matte", category: "Finalizacao" }],
    }));
    const result = canonicalizeAudioTranscript(
      "Entraram duas pomadas mate no estoque por R$5 cada uma.",
      vocabulary,
    );

    expect(result.transcript).toContain("Pomada Matte");
    expect(result.fields).toContainEqual(expect.objectContaining({
      category: "product",
      status: "GROUNDED",
      canonical: "Pomada Matte",
    }));
    expect(result.correctedCategories).toContain("product");
  });

  it("aterra olhos para barba como produto quando o audio diz acabei de comprar", () => {
    const vocabulary = buildBarbershopAudioVocabulary(context({
      unitId: "unit-stock-oil",
      products: [
        { name: "Oleo para Barba", category: "Barba" },
        { name: "Pomada Matte", category: "Finalizacao" },
      ],
    }));
    const result = canonicalizeAudioTranscript(
      "Acabei de comprar sete olhos para barba no valor de quatro reais cada um",
      vocabulary,
    );

    expect(result.transcript).toBe("Acabei de comprar sete Oleo para Barba no valor de quatro reais cada um");
    expect(result.fields).toContainEqual(expect.objectContaining({
      category: "product",
      status: "GROUNDED",
      canonical: "Oleo para Barba",
    }));
    expect(result.fields.some((field) => field.category === "service")).toBe(false);
  });

  it("gera prompt focado curto e estavel para segunda passagem", () => {
    const vocabulary = buildBarbershopAudioVocabulary(context());
    const prompt = buildFocusedWhisperPrompt(vocabulary, ["Pomada", "Gel", "Pomada"]);
    expect(prompt).toBe("Gel, Pomada");
    expect(prompt.length).toBeLessThanOrEqual(500);
  });
});
