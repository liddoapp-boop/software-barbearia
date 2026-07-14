import {
  AiWhatsappEntityAlias,
  resolveAiWhatsappClient,
  resolveAiWhatsappEntity,
} from "../src/application/whatsapp-entity-resolution";
import { describe, expect, it } from "vitest";

type Entity = { id: string; name: string };

const products: Entity[] = [
  { id: "product-pomada", name: "Pomada Matte" },
  { id: "product-oleo", name: "Oleo para Barba" },
];
const services: Entity[] = [{ id: "service-corte", name: "Corte Premium" }];
const payments: Entity[] = [
  { id: "payment-pix", name: "Pix" },
  { id: "payment-credit", name: "Cartao de credito" },
  { id: "payment-debit", name: "Cartao de debito" },
];

function resolve(input: Omit<Parameters<typeof resolveAiWhatsappEntity<Entity>>[0], "getName">) {
  return resolveAiWhatsappEntity({ ...input, getName: (item) => item.name });
}

describe("resolucao explicita de entidades para WhatsApp", () => {
  it("resolve Pomada Matte pelo nome exato", () => {
    expect(resolve({ entity: "product", name: "Pomada Matte", rows: products })).toMatchObject({
      status: "EXACT_MATCH",
      match: { id: "product-pomada" },
    });
  });

  it("resolve Pomada somente pelo alias autorizado", () => {
    expect(resolve({ entity: "product", name: "Pomada", rows: products })).toMatchObject({
      status: "EXPLICIT_ALIAS_MATCH",
      match: { id: "product-pomada" },
    });
  });

  it("pede esclarecimento quando o alias nao existe", () => {
    expect(resolve({ entity: "product", name: "Finalizador", rows: products })).toMatchObject({ status: "NOT_FOUND", match: null });
  });

  it("bloqueia alias duplicado mesmo que a configuracao tente apontar para uma entidade", () => {
    const aliases: AiWhatsappEntityAlias[] = [
      { entity: "product", alias: "P", canonicalName: "Pomada Matte" },
      { entity: "product", alias: "P", canonicalName: "Oleo para Barba" },
    ];
    expect(resolve({ entity: "product", name: "P", rows: products, aliases })).toMatchObject({ status: "AMBIGUOUS", match: null });
  });

  it("nao resolve produto parcialmente parecido sem alias", () => {
    expect(resolve({ entity: "product", name: "Oleo", rows: products, aliases: [] })).toMatchObject({ status: "PARTIAL_MATCH", match: null });
  });

  it("resolve servico por alias explicito", () => {
    expect(resolve({ entity: "service", name: "Corte masculino", rows: services })).toMatchObject({
      status: "EXPLICIT_ALIAS_MATCH",
      match: { id: "service-corte" },
    });
  });

  it("nao aceita cliente ou profissional parciais", () => {
    expect(resolve({ entity: "client", name: "Joao", rows: [{ id: "client-joao", name: "Joao Santos" }], aliases: [] })).toMatchObject({ status: "PARTIAL_MATCH", match: null });
    expect(resolve({ entity: "professional", name: "Geovane", rows: [{ id: "pro-geovane", name: "Geovane Borges" }], aliases: [] })).toMatchObject({ status: "PARTIAL_MATCH", match: null });
  });

  it("separa cliente exato, cliente novo e clientes ambiguos", () => {
    const exactClient = { id: "client-exact", name: "Joao Victor" };
    expect(resolveAiWhatsappClient({ name: "Joao Victor", rows: [exactClient], getName: (item) => item.name })).toMatchObject({
      status: "EXACT_MATCH",
      match: { id: "client-exact" },
    });
    expect(resolveAiWhatsappClient<Entity>({ name: "Joao Victor", rows: [], getName: (item) => item.name })).toMatchObject({
      status: "NOT_FOUND_NEW_CLIENT",
      match: null,
      candidates: [],
    });
    expect(resolveAiWhatsappClient({
      name: "Joao Victor",
      rows: [
        { id: "client-a", name: "Joao Victor Almeida" },
        { id: "client-b", name: "Joao Victor Souza" },
      ],
      getName: (item) => item.name,
    })).toMatchObject({
      status: "AMBIGUOUS_MATCH",
      match: null,
      candidates: [{ id: "client-a" }, { id: "client-b" }],
    });
  });

  it("resolve Pix e cartoes pelos nomes conhecidos ou aliases explicitos", () => {
    expect(resolve({ entity: "payment", name: "Pix", rows: payments })).toMatchObject({ match: { id: "payment-pix" } });
    expect(resolve({ entity: "payment", name: "credito", rows: payments })).toMatchObject({
      status: "EXPLICIT_ALIAS_MATCH",
      match: { id: "payment-credit" },
    });
    expect(resolve({ entity: "payment", name: "debito", rows: payments })).toMatchObject({
      status: "EXPLICIT_ALIAS_MATCH",
      match: { id: "payment-debit" },
    });
  });
});
