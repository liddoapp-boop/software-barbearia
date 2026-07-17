import { describe, expect, it } from "vitest";
import {
  canonicalCommercialCommandSchema,
  commercialUnderstandingResultSchema,
  interpretCommercialCommandDeterministic,
  parseBrazilianNumber,
  resolveCommercialProduct,
} from "../src/application/commercial-understanding";
import {
  commercialCorpusTransforms,
  productSaleCorpus,
  safetyCorpus,
} from "./fixtures/commercial-semantic-corpus";

const products = [
  { id: "matte", name: "Pomada Matte", salePrice: 59, stockQty: 15 },
  { id: "wet", name: "Pomada Efeito Molhado", salePrice: 55, stockQty: 9 },
  { id: "gel", name: "Gel Fixador", salePrice: 30, stockQty: 8 },
];

describe("contrato canônico comercial", () => {
  it("rejeita intenção inexistente, propriedades extras e comando falsamente resolvido", () => {
    expect(canonicalCommercialCommandSchema.safeParse({ intent: "DROP_DATABASE" }).success).toBe(false);
    expect(canonicalCommercialCommandSchema.safeParse({
      intent: "PRODUCT_SALE",
      items: [{ productReference: "Pomada Matte", quantity: 1 }],
      paymentMethod: null,
      uncertainFields: [],
      execute: true,
    }).success).toBe(false);
    expect(commercialUnderstandingResultSchema.safeParse({
      kind: "RESOLVED",
      source: "LOCAL_SEMANTIC",
      evidence: { reasonCodes: [] },
      command: { intent: "PRODUCT_SALE", items: [], paymentMethod: null, uncertainFields: [] },
    }).success).toBe(false);
  });
});

describe("números e resolução de produto em português brasileiro", () => {
  it.each([
    ["11", 11],
    ["onze", 11],
    ["cinquenta e nove", 59],
    ["seiscentos e quarenta e nove", 649],
    ["mil duzentos e trinta", 1230],
  ])("interpreta %s", (text, expected) => {
    expect(parseBrazilianNumber(text)).toBe(expected);
  });

  it.each([
    "Pomada Matte",
    "pomadas matte",
    "as pomadas Matte",
    "pomada mat",
    "pomadas da linha Matte",
  ])("resolve variação segura: %s", (reference) => {
    expect(resolveCommercialProduct(reference, products)).toMatchObject({
      status: "RESOLVED",
      product: { name: "Pomada Matte" },
    });
  });

  it("não escolhe silenciosamente entre produtos próximos", () => {
    expect(resolveCommercialProduct("pomada", products)).toMatchObject({
      status: "AMBIGUOUS",
      candidates: expect.arrayContaining([
        expect.objectContaining({ name: "Pomada Matte" }),
        expect.objectContaining({ name: "Pomada Efeito Molhado" }),
      ]),
    });
  });
});

describe("corpus semântico de venda", () => {
  it.each(productSaleCorpus)("$id", ({ text, expected }) => {
    const result = interpretCommercialCommandDeterministic({ message: text, products });
    expect(result).toMatchObject({
      kind: "RESOLVED",
      command: {
        intent: expected.intent,
        items: [{
          productReference: expected.product,
          quantity: expected.quantity,
          unitPrice: expected.unitPrice,
          totalPrice: expected.totalPrice,
        }],
      },
    });
  });

  it.each(productSaleCorpus.flatMap((entry) =>
    commercialCorpusTransforms(entry.text).map((text) => ({ ...entry, text })),
  ))("transformação $id: $text", ({ text, expected }) => {
    expect(interpretCommercialCommandDeterministic({ message: text, products })).toMatchObject({
      kind: "RESOLVED",
      command: { intent: expected.intent },
    });
  });

  it.each(safetyCorpus)("classifica com segurança: $id", ({ text, expected }) => {
    const result = interpretCommercialCommandDeterministic({ message: text, products });
    if (expected.clarificationCode) {
      expect(result).toMatchObject({ kind: "NEEDS_CLARIFICATION", questionCode: expected.clarificationCode });
    } else {
      expect(result).toMatchObject({ kind: "UNSUPPORTED" });
    }
  });
});
