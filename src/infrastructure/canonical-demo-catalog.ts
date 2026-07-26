import {
  CANONICAL_REAL_PRODUCTS,
  CANONICAL_REAL_SERVICES,
  CANONICAL_SERVICE_COMBINATION_RULES,
} from "../application/canonical-catalog";
import type {
  Product,
  Service,
  ServiceCombinationRule,
  ServiceProfessionalAssignment,
} from "../domain/types";
import { buildServiceSetKey } from "../domain/appointment-services";

/*
 * Catalogo usado exclusivamente pelo InMemoryStore de dev:isolated e testes.
 * O conteudo vem do catalogo canonico real; somente os IDs de Corte e Barba
 * permanecem estaveis por compatibilidade com contratos de teste existentes.
 */
export const CANONICAL_DEMO_SERVICE_IDS = {
  corte: "svc-corte",
  barba: "svc-barba",
  hidratacao: "canon-svc-hidratacao",
  luzes: "canon-svc-luzes",
  pigmentacao: "canon-svc-pigmentacao",
  corteBarba: "canon-svc-corte-barba",
} as const;

export const LEGACY_MANUAL_CUT_SERVICE_ID = "legacy-svc-corte-manual-232a";

const stableIdByCanonicalId: Record<string, string> = {
  "canon-svc-corte": CANONICAL_DEMO_SERVICE_IDS.corte,
  "canon-svc-barba": CANONICAL_DEMO_SERVICE_IDS.barba,
};

export const CANONICAL_DEMO_PRODUCT_IDS = {
  pomada: "prd-pomada",
  oleoBarba: "prd-oleo-barba",
} as const;

const stableProductIdByCanonicalId: Record<string, string> = {
  "canon-prd-pomada": CANONICAL_DEMO_PRODUCT_IDS.pomada,
  "canon-prd-oleo-barba": CANONICAL_DEMO_PRODUCT_IDS.oleoBarba,
};

const demoTimestamp = new Date("2026-07-06T00:00:00.000Z");

function demoServiceId(canonicalId: string) {
  return stableIdByCanonicalId[canonicalId] ?? canonicalId;
}

function demoProductId(canonicalId: string) {
  return stableProductIdByCanonicalId[canonicalId] ?? canonicalId;
}

export const CANONICAL_DEMO_SERVICES: Service[] = [
  ...CANONICAL_REAL_SERVICES.map((service) => ({
    ...service,
    id: demoServiceId(service.id),
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
  })),
  {
    ...CANONICAL_REAL_SERVICES[0],
    id: LEGACY_MANUAL_CUT_SERVICE_ID,
    name: "Corte Manual 232A",
    price: 60,
    active: false,
    createdAt: demoTimestamp,
    updatedAt: demoTimestamp,
  },
];

export const CANONICAL_DEMO_SERVICE_PROFESSIONAL_ASSIGNMENTS: ServiceProfessionalAssignment[] =
  CANONICAL_DEMO_SERVICES.filter((service) => service.active).map((service) => ({
    serviceId: service.id,
    professionalId: "pro-01",
  }));

export const CANONICAL_DEMO_SERVICE_COMBINATION_RULES: ServiceCombinationRule[] =
  CANONICAL_SERVICE_COMBINATION_RULES.map((rule) => {
    const ruleId = rule.id === "canon-rule-corte-barba-45" ? "rule-unit-01-corte-barba-45" : rule.id;
    return {
      ...rule,
      id: ruleId,
      serviceSetKey: buildServiceSetKey([
        CANONICAL_DEMO_SERVICE_IDS.corte,
        CANONICAL_DEMO_SERVICE_IDS.barba,
      ]),
      items: rule.items.map((item) => ({
        ...item,
        id: item.id
          .replace("canon-rule-corte-barba-45-item-corte", "rule-item-unit-01-corte-barba-45-corte")
          .replace("canon-rule-corte-barba-45-item-barba", "rule-item-unit-01-corte-barba-45-barba"),
        ruleId,
        serviceId: demoServiceId(item.serviceId),
        createdAt: demoTimestamp,
      })),
      createdAt: demoTimestamp,
      updatedAt: demoTimestamp,
    };
  });

/*
 * O ambiente isolado usa os produtos confirmados na base local barbearia/unit-01.
 * Somente os dois IDs legados continuam traduzidos para preservar vendas,
 * movimentacoes e contratos de testes historicos.
 */
export const CANONICAL_DEMO_PRODUCTS: Product[] = CANONICAL_REAL_PRODUCTS.map((product) => ({
  ...product,
  id: demoProductId(product.id),
}));
