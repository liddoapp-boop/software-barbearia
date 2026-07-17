import { z } from "zod";

const finiteMoneySchema = z.number().finite().nonnegative();
const positiveQuantitySchema = z.number().int().positive().max(99_999);

export const productSaleCommandSchema = z.object({
  intent: z.literal("PRODUCT_SALE"),
  items: z.array(z.object({
    productReference: z.string().trim().min(1).max(160),
    quantity: positiveQuantitySchema,
    unitPrice: finiteMoneySchema.optional(),
    totalPrice: finiteMoneySchema.optional(),
  }).strict()).min(1).max(20),
  paymentMethod: z.string().trim().min(1).max(80).nullable(),
  uncertainFields: z.array(z.string().trim().min(1).max(80)).max(20),
}).strict();

export const stockEntryCommandSchema = z.object({
  intent: z.literal("STOCK_ENTRY"),
  items: z.array(z.object({
    productReference: z.string().trim().min(1).max(160),
    quantity: positiveQuantitySchema,
    unitCost: finiteMoneySchema.optional(),
    totalCost: finiteMoneySchema.optional(),
  }).strict()).min(1).max(20),
  uncertainFields: z.array(z.string().trim().min(1).max(80)).max(20),
}).strict();

const scheduleCommandSchema = z.object({
  intent: z.literal("SCHEDULE_APPOINTMENT"),
  clientReference: z.string().trim().min(1).max(160),
  serviceReferences: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  professionalReference: z.string().trim().min(1).max(160).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  uncertainFields: z.array(z.string().trim().min(1).max(80)).max(20),
}).strict();

const correctionCommandSchema = z.object({
  intent: z.literal("CORRECT_PENDING_PREVIEW"),
  changes: z.record(z.string().min(1).max(80), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  uncertainFields: z.array(z.string().trim().min(1).max(80)).max(20),
}).strict();

const decisionCommandSchema = z.object({
  intent: z.enum(["CONFIRM_PENDING", "CANCEL_PENDING"]),
  uncertainFields: z.tuple([]),
}).strict();

export const canonicalCommercialCommandSchema = z.discriminatedUnion("intent", [
  productSaleCommandSchema,
  stockEntryCommandSchema,
  scheduleCommandSchema,
  correctionCommandSchema,
  decisionCommandSchema,
]);

const sanitizedEvidenceSchema = z.object({
  reasonCodes: z.array(z.string().regex(/^[A-Z0-9_]+$/)).max(30),
  matchedCatalogIds: z.array(z.string().min(1).max(120)).max(20).optional(),
}).strict();

export const commercialUnderstandingResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("RESOLVED"),
    command: canonicalCommercialCommandSchema,
    source: z.enum(["DETERMINISTIC", "LOCAL_SEMANTIC"]),
    evidence: sanitizedEvidenceSchema,
  }).strict(),
  z.object({
    kind: z.literal("NEEDS_CLARIFICATION"),
    intent: z.enum(["PRODUCT_SALE", "STOCK_ENTRY", "SCHEDULE_APPOINTMENT", "CORRECT_PENDING_PREVIEW"]),
    knownFields: z.record(z.string().max(80), z.unknown()),
    missingFields: z.array(z.string().min(1).max(80)),
    ambiguousFields: z.array(z.string().min(1).max(80)),
    questionCode: z.string().regex(/^[A-Z0-9_]+$/),
  }).strict(),
  z.object({
    kind: z.literal("UNSUPPORTED"),
    reasonCode: z.string().regex(/^[A-Z0-9_]+$/),
  }).strict(),
  z.object({
    kind: z.literal("TRANSCRIPTION_FAILURE"),
    reasonCode: z.enum(["TRANSCRIPTION_EMPTY", "TRANSCRIPTION_UNUSABLE"]),
  }).strict(),
]);

export type CanonicalCommercialCommand = z.infer<typeof canonicalCommercialCommandSchema>;
export type CommercialUnderstandingResult = z.infer<typeof commercialUnderstandingResultSchema>;

export type CommercialProduct = {
  id?: string;
  name: string;
  category?: string | null;
  salePrice?: number;
  stockQty?: number;
};

const unitNumbers: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezassete: 17, dezessete: 17, dezoito: 18, dezenove: 19,
};
const tensNumbers: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};
const hundredNumbers: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300,
  trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500,
  quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700,
  setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900,
  novecentas: 900,
};

export function normalizeCommercialText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9,.$%\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberTokens(tokens: string[]) {
  let total = 0;
  let current = 0;
  let recognized = false;
  for (const token of tokens) {
    if (token === "e") continue;
    if (unitNumbers[token] !== undefined) {
      current += unitNumbers[token];
      recognized = true;
    } else if (tensNumbers[token] !== undefined) {
      current += tensNumbers[token];
      recognized = true;
    } else if (hundredNumbers[token] !== undefined) {
      current += hundredNumbers[token];
      recognized = true;
    } else if (token === "mil") {
      total += (current || 1) * 1_000;
      current = 0;
      recognized = true;
    } else {
      return null;
    }
  }
  return recognized ? total + current : null;
}

export function parseBrazilianNumber(value: string) {
  const normalized = normalizeCommercialText(value).replace(/\s+reais?$/, "").trim();
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    const parsed = Number(normalized.replace(".", "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return parseNumberTokens(normalized.split(" ").filter(Boolean));
}

type NumberOccurrence = { value: number; start: number; end: number; text: string };

function extractNumberOccurrences(message: string) {
  const normalized = normalizeCommercialText(message);
  const tokens = Array.from(normalized.matchAll(/\d+(?:[.,]\d+)?|[a-z]+/g)).map((match) => ({
    text: match[0],
    start: match.index,
    end: (match.index ?? 0) + match[0].length,
  }));
  const occurrences: NumberOccurrence[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const numeric = parseBrazilianNumber(token.text);
    if (/^\d/.test(token.text) && numeric !== null) {
      occurrences.push({ value: numeric, start: token.start ?? 0, end: token.end, text: token.text });
      continue;
    }
    if (numeric === null) continue;
    const parts = [token.text];
    let end = token.end;
    let cursor = index + 1;
    while (cursor < tokens.length) {
      const next = tokens[cursor];
      if (next.text === "e" && cursor + 1 < tokens.length && parseBrazilianNumber(tokens[cursor + 1].text) !== null) {
        parts.push(next.text, tokens[cursor + 1].text);
        end = tokens[cursor + 1].end;
        cursor += 2;
        continue;
      }
      if (next.text === "mil") {
        parts.push(next.text);
        end = next.end;
        cursor += 1;
        continue;
      }
      break;
    }
    const combined = parseBrazilianNumber(parts.join(" "));
    if (combined !== null) occurrences.push({ value: combined, start: token.start ?? 0, end, text: parts.join(" ") });
    index = cursor - 1;
  }
  return occurrences;
}

function singularizeToken(token: string) {
  if (token.endsWith("oes") && token.length > 5) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("ais") && token.length > 5) return `${token.slice(0, -3)}al`;
  if (token.endsWith("as") && token.length > 4) return token.slice(0, -1);
  if (token.endsWith("os") && token.length > 4) return token.slice(0, -1);
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length >= 3 && right.startsWith(left)) return Math.min(0.96, left.length / right.length + 0.22);
  if (right.length >= 3 && left.startsWith(right)) return Math.min(0.96, right.length / left.length + 0.22);
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length, 1);
}

const referenceStopWords = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas", "da", "das", "de", "do", "dos",
  "linha", "produto", "produtos", "unidade", "unidades", "aquela", "daquela", "cliente",
  "vendi", "venda", "vendidas", "vendidos", "foram", "sairam", "saiu", "passei", "levou",
  "registra", "registrar", "acabei", "por", "deu", "ficou", "total", "tudo", "reais", "cada",
]);

function searchableTokens(value: string) {
  return normalizeCommercialText(value)
    .split(" ")
    .map(singularizeToken)
    .filter((token) => token.length >= 3 && !referenceStopWords.has(token) && !/^\d/.test(token));
}

export type ProductResolution =
  | { status: "RESOLVED"; product: CommercialProduct; candidates: CommercialProduct[]; score: number }
  | { status: "AMBIGUOUS"; product: null; candidates: CommercialProduct[]; score: number }
  | { status: "NOT_FOUND"; product: null; candidates: []; score: number };

export function resolveCommercialProduct(reference: string, products: CommercialProduct[]): ProductResolution {
  const queryTokens = searchableTokens(reference);
  if (!queryTokens.length) return { status: "NOT_FOUND", product: null, candidates: [], score: 0 };
  const genericMatches = products.filter((product) => {
    const productTokens = searchableTokens(`${product.name} ${product.category ?? ""}`);
    return queryTokens.every((queryToken) =>
      productTokens.some((productToken) => tokenSimilarity(queryToken, productToken) >= 0.9),
    );
  });
  if (genericMatches.length > 1) {
    return { status: "AMBIGUOUS", product: null, candidates: genericMatches, score: 1 };
  }
  const ranked = products.map((product) => {
    const productTokens = searchableTokens(`${product.name} ${product.category ?? ""}`);
    const tokenScores = productTokens.map((productToken) =>
      Math.max(0, ...queryTokens.map((queryToken) => tokenSimilarity(queryToken, productToken))),
    );
    const matched = tokenScores.filter((score) => score >= 0.72);
    const coverage = matched.length / Math.max(productTokens.length, 1);
    const strength = matched.reduce((sum, score) => sum + score, 0) / Math.max(productTokens.length, 1);
    return { product, score: Number((coverage * 0.55 + strength * 0.45).toFixed(4)) };
  }).sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, "pt-BR"));
  const best = ranked[0];
  if (!best || best.score < 0.43) return { status: "NOT_FOUND", product: null, candidates: [], score: best?.score ?? 0 };
  const competitive = ranked.filter((candidate) => candidate.score >= 0.43 && best.score - candidate.score < 0.16);
  if (competitive.length > 1) {
    return { status: "AMBIGUOUS", product: null, candidates: competitive.map((item) => item.product), score: best.score };
  }
  return { status: "RESOLVED", product: best.product, candidates: [best.product], score: best.score };
}

function uniqueProductByPrice(products: CommercialProduct[], unitPrice: number, candidates?: CommercialProduct[]) {
  const source = candidates?.length ? candidates : products;
  const matches = source.filter((product) =>
    Number.isFinite(product.salePrice) && Math.abs(Number(product.salePrice) - unitPrice) < 0.01,
  );
  return matches.length === 1 ? matches[0] : null;
}

function clarification(input: {
  intent: "PRODUCT_SALE" | "STOCK_ENTRY" | "SCHEDULE_APPOINTMENT" | "CORRECT_PENDING_PREVIEW";
  knownFields?: Record<string, unknown>;
  missingFields?: string[];
  ambiguousFields?: string[];
  questionCode: string;
}): CommercialUnderstandingResult {
  return {
    kind: "NEEDS_CLARIFICATION",
    intent: input.intent,
    knownFields: input.knownFields ?? {},
    missingFields: input.missingFields ?? [],
    ambiguousFields: input.ambiguousFields ?? [],
    questionCode: input.questionCode,
  };
}

export function interpretCommercialCommandDeterministic(input: {
  message: string;
  products: CommercialProduct[];
}): CommercialUnderstandingResult {
  const text = normalizeCommercialText(input.message);
  if (!text) return { kind: "TRANSCRIPTION_FAILURE", reasonCode: "TRANSCRIPTION_EMPTY" };
  if (/\b(?:ignore|ignora)\b.*\b(?:regras|instrucoes|sistema)\b|\b(?:apague|delete|drop)\b.*\b(?:banco|database|tabela)\b/.test(text)) {
    return { kind: "UNSUPPORTED", reasonCode: "PROMPT_INJECTION" };
  }
  if (/^(?:confirmar|confirmo|confirmado|sim pode confirmar)$/.test(text)) {
    return { kind: "RESOLVED", source: "DETERMINISTIC", evidence: { reasonCodes: ["EXACT_PENDING_CONFIRMATION"] }, command: { intent: "CONFIRM_PENDING", uncertainFields: [] } };
  }
  if (/^(?:cancelar|cancela|cancele|nao confirmar|não confirmar)(?: essa| esta)?(?: previa)?$/.test(text)) {
    return { kind: "RESOLVED", source: "DETERMINISTIC", evidence: { reasonCodes: ["EXACT_PENDING_CANCELLATION"] }, command: { intent: "CANCEL_PENDING", uncertainFields: [] } };
  }

  const stockCue = /\b(?:entrada|entraram|chegaram|recebi|recebemos|adiciona|adicionar|repor|reposicao)\b/.test(text);
  const saleCue = /\b(?:vendi|vendeu|vendemos|vendendo|venda|vendidas?|vendidos?|sairam|saiu|passei|levou)\b/.test(text);
  const occurrences = extractNumberOccurrences(text);
  const resolution = resolveCommercialProduct(text, input.products);
  if (stockCue && !saleCue) {
    const quantity = occurrences[0]?.value;
    if (!quantity || !Number.isInteger(quantity) || quantity <= 0) {
      return clarification({ intent: "STOCK_ENTRY", missingFields: ["quantity"], questionCode: "STOCK_ENTRY_MISSING_QUANTITY" });
    }
    if (resolution.status !== "RESOLVED") {
      return clarification({
        intent: "STOCK_ENTRY",
        knownFields: { quantity },
        ambiguousFields: resolution.status === "AMBIGUOUS" ? ["productReference"] : [],
        missingFields: resolution.status === "NOT_FOUND" ? ["productReference"] : [],
        questionCode: resolution.status === "AMBIGUOUS" ? "PRODUCT_ENTITY_AMBIGUOUS" : "PRODUCT_ENTITY_NOT_FOUND",
      });
    }
    return {
      kind: "RESOLVED",
      source: "DETERMINISTIC",
      evidence: { reasonCodes: ["STOCK_CUE", "CATALOG_ENTITY_RESOLVED"], matchedCatalogIds: resolution.product.id ? [resolution.product.id] : undefined },
      command: { intent: "STOCK_ENTRY", items: [{ productReference: resolution.product.name, quantity }], uncertainFields: [] },
    };
  }

  const commercialSaleShape = saleCue || (
    occurrences.length >= 1
    && (resolution.status !== "NOT_FOUND" || occurrences.length >= 2)
    && /\b(?:foram|total|deu|ficou|cada|unidades?)\b/.test(text)
  );
  if (!commercialSaleShape) return { kind: "UNSUPPORTED", reasonCode: "INTENT_UNSUPPORTED" };

  const quantity = occurrences[0]?.value;
  if (!quantity || !Number.isInteger(quantity) || quantity <= 0) {
    return clarification({
      intent: "PRODUCT_SALE",
      knownFields: resolution.status === "RESOLVED" ? { productReference: resolution.product.name } : {},
      missingFields: ["quantity"],
      questionCode: "PRODUCT_SALE_MISSING_QUANTITY",
    });
  }
  const explicitAmbiguousValue = /\b(?:cada|unidade)\b.*\btotal\b|\btotal\b.*\b(?:cada|unidade)\b/.test(text);
  const valueOccurrence = occurrences[1];
  if (explicitAmbiguousValue && valueOccurrence) {
    return clarification({
      intent: "PRODUCT_SALE",
      knownFields: { quantity, ...(resolution.status === "RESOLVED" ? { productReference: resolution.product.name } : {}), monetaryValue: valueOccurrence.value },
      ambiguousFields: ["valueRole"],
      questionCode: "PRODUCT_SALE_AMBIGUOUS_VALUE_ROLE",
    });
  }
  const unitMarker = /\b(?:cada|por unidade)\b/.test(text) || /\bunidades?\s+a\s+/.test(text);
  const totalMarker = /\b(?:total|deu|ficou|tudo)\b/.test(text) || /\bpor\s+(?:r\$\s*)?(?:\d|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzent|trezent|quatrocent|quinhent|seiscent|setecent|oitocent|novecent)/.test(text);
  let unitPrice: number | undefined;
  let totalPrice: number | undefined;
  if (valueOccurrence) {
    if (unitMarker && !totalMarker) {
      unitPrice = valueOccurrence.value;
      totalPrice = Number((quantity * unitPrice).toFixed(2));
    } else {
      totalPrice = valueOccurrence.value;
      unitPrice = Number((totalPrice / quantity).toFixed(2));
    }
  }

  let product = resolution.status === "RESOLVED" ? resolution.product : null;
  if (!product && unitPrice !== undefined) {
    product = uniqueProductByPrice(input.products, unitPrice, resolution.status === "AMBIGUOUS" ? resolution.candidates : undefined);
  }
  if (!product) {
    return clarification({
      intent: "PRODUCT_SALE",
      knownFields: { quantity, ...(unitPrice !== undefined ? { unitPrice } : {}), ...(totalPrice !== undefined ? { totalPrice } : {}) },
      missingFields: resolution.status === "NOT_FOUND" ? ["productReference"] : [],
      ambiguousFields: resolution.status === "AMBIGUOUS" ? ["productReference"] : [],
      questionCode: resolution.status === "AMBIGUOUS" ? "PRODUCT_ENTITY_AMBIGUOUS" : "PRODUCT_ENTITY_NOT_FOUND",
    });
  }
  const officialUnitPrice = Number(product.salePrice);
  if (unitPrice === undefined && Number.isFinite(officialUnitPrice) && officialUnitPrice >= 0) {
    unitPrice = officialUnitPrice;
    totalPrice = Number((quantity * officialUnitPrice).toFixed(2));
  }
  if (unitPrice === undefined || totalPrice === undefined) {
    return clarification({
      intent: "PRODUCT_SALE",
      knownFields: { quantity, productReference: product.name },
      missingFields: ["monetaryValue"],
      questionCode: "PRODUCT_SALE_MISSING_VALUE",
    });
  }
  if (Number.isFinite(officialUnitPrice) && Math.abs(officialUnitPrice - unitPrice) >= 0.01) {
    return clarification({
      intent: "PRODUCT_SALE",
      knownFields: { quantity, productReference: product.name, unitPrice, totalPrice, officialUnitPrice },
      ambiguousFields: ["monetaryValue"],
      questionCode: "PRODUCT_SALE_VALUE_INCONSISTENT",
    });
  }
  if (Math.abs(quantity * unitPrice - totalPrice) >= 0.01) {
    return clarification({
      intent: "PRODUCT_SALE",
      knownFields: { quantity, productReference: product.name, unitPrice, totalPrice },
      ambiguousFields: ["monetaryValue"],
      questionCode: "PRODUCT_SALE_VALUE_INCONSISTENT",
    });
  }
  return {
    kind: "RESOLVED",
    source: "DETERMINISTIC",
    evidence: {
      reasonCodes: ["PRODUCT_SALE_CUE", "CATALOG_ENTITY_RESOLVED", "COMMERCIAL_VALUES_VALIDATED"],
      matchedCatalogIds: product.id ? [product.id] : undefined,
    },
    command: {
      intent: "PRODUCT_SALE",
      items: [{ productReference: product.name, quantity, unitPrice, totalPrice }],
      paymentMethod: null,
      uncertainFields: [],
    },
  };
}
