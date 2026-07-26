import { describe, expect, it } from "vitest";
import {
  CANONICAL_REAL_PRODUCTS,
  CANONICAL_REAL_SERVICES,
  buildCanonicalProvisionPlan,
} from "../src/application/canonical-catalog";
import {
  CANONICAL_DEMO_PRODUCTS,
  CANONICAL_DEMO_PRODUCT_IDS,
  CANONICAL_DEMO_SERVICES,
  CANONICAL_DEMO_SERVICE_IDS,
  LEGACY_MANUAL_CUT_SERVICE_ID,
} from "../src/infrastructure/canonical-demo-catalog";

describe("provisionamento de canonicos reais", () => {
  it("define somente os servicos e produtos canonicos reais aprovados", () => {
    expect(CANONICAL_REAL_SERVICES.map((item) => item.id)).toEqual([
      "canon-svc-corte",
      "canon-svc-barba",
      "canon-svc-hidratacao",
      "canon-svc-luzes",
      "canon-svc-pigmentacao",
      "canon-svc-corte-barba",
    ]);
    expect(CANONICAL_REAL_SERVICES.find((item) => item.id === "canon-svc-corte-barba")).toMatchObject({
      name: "Corte + Barba",
      price: 50,
      durationMin: 45,
    });
    for (const service of CANONICAL_REAL_SERVICES) {
      expect(`${service.description} ${service.notes}`.toLowerCase()).not.toMatch(/teste|demo|tg|db/);
    }

    expect(CANONICAL_REAL_PRODUCTS.map((item) => item.id)).toEqual([
      "canon-prd-gel",
      "canon-prd-pomada",
      "canon-prd-bucha-nudread",
      "canon-prd-oleo-barba",
      "canon-prd-shampoo",
      "canon-prd-condicionador",
      "canon-prd-mascara-hidratacao",
    ]);
    expect(CANONICAL_REAL_PRODUCTS.find((item) => item.id === "canon-prd-bucha-nudread")).toMatchObject({
      name: "Bucha Nudread",
      salePrice: 25,
      costPrice: 12.5,
      stockQty: 3,
    });
  });

  it("planeja criar canonicos ausentes sem depender de registros legados", () => {
    const plan = buildCanonicalProvisionPlan({
      existingServices: [
        { id: "svc-corte", businessId: "unit-01", name: "Corte Premium", price: 75 },
        { id: "demo-svc-hidratacao", businessId: "unit-01", name: "Hidratacao Capilar", price: 65 },
      ],
      existingProducts: [
        { id: "prd-pomada", businessId: "unit-01", name: "Pomada Matte", salePrice: 59 },
        { id: "demo-prd-shampoo", businessId: "unit-01", name: "Shampoo Anticaspa Premium", salePrice: 49 },
      ],
    });

    expect(plan.errors).toHaveLength(0);
    expect(plan.servicesToCreate).toHaveLength(6);
    expect(plan.productsToCreate).toHaveLength(7);
    expect(plan.servicesToCreate.map((item) => item.id)).not.toContain("svc-corte");
    expect(plan.productsToCreate.map((item) => item.id)).not.toContain("prd-pomada");
  });

  it("e idempotente quando canonicos existentes batem com o contrato", () => {
    const plan = buildCanonicalProvisionPlan({
      existingServices: CANONICAL_REAL_SERVICES.map((item) => ({ ...item })),
      existingProducts: CANONICAL_REAL_PRODUCTS.map((item) => ({ ...item })),
    });

    expect(plan.errors).toHaveLength(0);
    expect(plan.servicesToCreate).toHaveLength(0);
    expect(plan.servicesToUpdate).toHaveLength(0);
    expect(plan.productsToCreate).toHaveLength(0);
    expect(plan.matchingServiceIds).toHaveLength(6);
    expect(plan.matchingProductIds).toHaveLength(7);
  });

  it("planeja atualizar servico canonico divergente preservando o mesmo id", () => {
    const [corte, ...otherServices] = CANONICAL_REAL_SERVICES;
    const [gel, ...otherProducts] = CANONICAL_REAL_PRODUCTS;
    const plan = buildCanonicalProvisionPlan({
      existingServices: [{ ...corte, price: 75 }, ...otherServices],
      existingProducts: [{ ...gel, stockQty: 999 }, ...otherProducts],
    });

    expect(plan.servicesToCreate).toHaveLength(0);
    expect(plan.servicesToUpdate).toEqual([{ id: corte.id, data: corte }]);
    expect(plan.productsToCreate).toHaveLength(0);
    expect(plan.errors).toEqual(["canon-prd-gel.stockQty esperado=30 encontrado=999"]);
  });

  it("reutiliza o catalogo real no ambiente isolado sem as fixtures antigas", () => {
    const activeServices = CANONICAL_DEMO_SERVICES.filter((item) => item.active);
    expect(activeServices).toHaveLength(6);
    expect(activeServices.map((item) => item.name)).toEqual([
      "Corte",
      "Barba",
      "Hidratação",
      "Luzes",
      "Pigmentação",
      "Corte + Barba",
    ]);
    expect(activeServices.map((item) => item.id)).toContain(CANONICAL_DEMO_SERVICE_IDS.corte);
    expect(activeServices.map((item) => item.id)).toContain(CANONICAL_DEMO_SERVICE_IDS.barba);
    expect(activeServices.map((item) => item.name)).not.toEqual(
      expect.arrayContaining(["Corte Premium", "Barba Terapia"]),
    );
    expect(CANONICAL_DEMO_SERVICES.find((item) => item.id === LEGACY_MANUAL_CUT_SERVICE_ID)).toMatchObject({
      name: "Corte Manual 232A",
      active: false,
    });
    expect(CANONICAL_DEMO_PRODUCTS).toHaveLength(7);
    expect(CANONICAL_DEMO_PRODUCTS.map((item) => item.name)).toEqual(
      CANONICAL_REAL_PRODUCTS.map((item) => item.name),
    );
    expect(CANONICAL_DEMO_PRODUCTS.find((item) => item.id === CANONICAL_DEMO_PRODUCT_IDS.pomada))
      .toMatchObject({ name: "Pomada", salePrice: 25, costPrice: 7.5, stockQty: 10 });
    expect(CANONICAL_DEMO_PRODUCTS.find((item) => item.id === CANONICAL_DEMO_PRODUCT_IDS.oleoBarba))
      .toMatchObject({ name: "Oleo para Barba", salePrice: 35, costPrice: 13, stockQty: 4 });
    expect(CANONICAL_DEMO_PRODUCTS.map((item) => item.name)).not.toContain("Pomada Matte");
  });
});
