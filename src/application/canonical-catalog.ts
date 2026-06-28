export type CanonicalServiceRecord = {
  id: string;
  businessId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  durationMin: number;
  defaultCommissionRate: number;
  costEstimate: number;
  notes: string;
  active: boolean;
};

export type CanonicalProductRecord = {
  id: string;
  businessId: string;
  name: string;
  category: string;
  salePrice: number;
  costPrice: number;
  stockQty: number;
  minStockAlert: number;
  notes: string;
  active: boolean;
};

export type ExistingCanonicalService = Partial<CanonicalServiceRecord> & {
  id: string;
};

export type ExistingCanonicalProduct = Partial<CanonicalProductRecord> & {
  id: string;
};

export type CanonicalProvisionPlan = {
  servicesToCreate: CanonicalServiceRecord[];
  productsToCreate: CanonicalProductRecord[];
  matchingServiceIds: string[];
  matchingProductIds: string[];
  errors: string[];
};

const UNIT_ID = "unit-01";
const CANONICAL_NOTES = "canonico-real-sprint-227-2-230-1";

export const CANONICAL_REAL_SERVICES: CanonicalServiceRecord[] = [
  {
    id: "canon-svc-corte",
    businessId: UNIT_ID,
    name: "Corte",
    description: "Servico canonico real validado para provisionamento local/teste.",
    category: "CORTE",
    price: 30,
    durationMin: 30,
    defaultCommissionRate: 0,
    costEstimate: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-svc-barba",
    businessId: UNIT_ID,
    name: "Barba",
    description: "Servico canonico real validado para provisionamento local/teste.",
    category: "BARBA",
    price: 20,
    durationMin: 30,
    defaultCommissionRate: 0,
    costEstimate: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-svc-hidratacao",
    businessId: UNIT_ID,
    name: "Hidratacao",
    description: "Servico canonico real validado para provisionamento local/teste.",
    category: "TRATAMENTO",
    price: 20,
    durationMin: 30,
    defaultCommissionRate: 0,
    costEstimate: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-svc-luzes",
    businessId: UNIT_ID,
    name: "Luzes",
    description: "Servico canonico real validado para provisionamento local/teste.",
    category: "TECNICO",
    price: 50,
    durationMin: 60,
    defaultCommissionRate: 0,
    costEstimate: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-svc-pigmentacao",
    businessId: UNIT_ID,
    name: "Pigmentacao",
    description: "Servico canonico real validado para provisionamento local/teste.",
    category: "TECNICO",
    price: 45,
    durationMin: 60,
    defaultCommissionRate: 0,
    costEstimate: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
];

export const CANONICAL_REAL_PRODUCTS: CanonicalProductRecord[] = [
  {
    id: "canon-prd-gel",
    businessId: UNIT_ID,
    name: "Gel",
    category: "Finalizacao",
    salePrice: 10,
    costPrice: 5.5,
    stockQty: 30,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-prd-pomada",
    businessId: UNIT_ID,
    name: "Pomada",
    category: "Finalizacao",
    salePrice: 25,
    costPrice: 7.5,
    stockQty: 10,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-prd-bucha-nudread",
    businessId: UNIT_ID,
    name: "Bucha Nudread",
    category: "Dread",
    salePrice: 25,
    costPrice: 12.5,
    stockQty: 3,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-prd-oleo-barba",
    businessId: UNIT_ID,
    name: "Oleo para Barba",
    category: "Barba",
    salePrice: 35,
    costPrice: 13,
    stockQty: 4,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-prd-shampoo",
    businessId: UNIT_ID,
    name: "Shampoo",
    category: "Cabelo",
    salePrice: 25,
    costPrice: 7.5,
    stockQty: 10,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-prd-condicionador",
    businessId: UNIT_ID,
    name: "Condicionador",
    category: "Cabelo",
    salePrice: 25,
    costPrice: 7.5,
    stockQty: 10,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
  {
    id: "canon-prd-mascara-hidratacao",
    businessId: UNIT_ID,
    name: "Mascara de Hidratacao",
    category: "Tratamento",
    salePrice: 30,
    costPrice: 7.5,
    stockQty: 10,
    minStockAlert: 0,
    notes: CANONICAL_NOTES,
    active: true,
  },
];

const SERVICE_FIELDS: Array<keyof CanonicalServiceRecord> = [
  "businessId",
  "name",
  "description",
  "category",
  "price",
  "durationMin",
  "defaultCommissionRate",
  "costEstimate",
  "notes",
  "active",
];

const PRODUCT_FIELDS: Array<keyof CanonicalProductRecord> = [
  "businessId",
  "name",
  "category",
  "salePrice",
  "costPrice",
  "stockQty",
  "minStockAlert",
  "notes",
  "active",
];

function normalize(value: unknown) {
  if (typeof value === "number") return Number(value.toFixed(4));
  if (typeof value === "boolean") return value;
  if (value == null) return "";
  const maybeNumber = Number(value);
  if (typeof value !== "string" && Number.isFinite(maybeNumber)) {
    return Number(maybeNumber.toFixed(4));
  }
  return String(value).trim();
}

function findDivergences<T extends { id: string }>(
  expected: T,
  existing: Partial<T>,
  fields: Array<keyof T>,
) {
  return fields
    .filter((field) => normalize(existing[field]) !== normalize(expected[field]))
    .map((field) => {
      const expectedValue = normalize(expected[field]);
      const existingValue = normalize(existing[field]);
      return `${expected.id}.${String(field)} esperado=${expectedValue} encontrado=${existingValue}`;
    });
}

export function buildCanonicalProvisionPlan(input: {
  existingServices: ExistingCanonicalService[];
  existingProducts: ExistingCanonicalProduct[];
}): CanonicalProvisionPlan {
  const servicesById = new Map(input.existingServices.map((item) => [item.id, item]));
  const productsById = new Map(input.existingProducts.map((item) => [item.id, item]));
  const plan: CanonicalProvisionPlan = {
    servicesToCreate: [],
    productsToCreate: [],
    matchingServiceIds: [],
    matchingProductIds: [],
    errors: [],
  };

  for (const service of CANONICAL_REAL_SERVICES) {
    const existing = servicesById.get(service.id);
    if (!existing) {
      plan.servicesToCreate.push(service);
      continue;
    }
    const divergences = findDivergences(service, existing, SERVICE_FIELDS);
    if (divergences.length) plan.errors.push(...divergences);
    else plan.matchingServiceIds.push(service.id);
  }

  for (const product of CANONICAL_REAL_PRODUCTS) {
    const existing = productsById.get(product.id);
    if (!existing) {
      plan.productsToCreate.push(product);
      continue;
    }
    const divergences = findDivergences(product, existing, PRODUCT_FIELDS);
    if (divergences.length) plan.errors.push(...divergences);
    else plan.matchingProductIds.push(product.id);
  }

  return plan;
}

export function canonicalServiceIds() {
  return CANONICAL_REAL_SERVICES.map((item) => item.id);
}

export function canonicalProductIds() {
  return CANONICAL_REAL_PRODUCTS.map((item) => item.id);
}
