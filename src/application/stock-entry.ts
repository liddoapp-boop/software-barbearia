import crypto from "node:crypto";
import { z } from "zod";
import type { TransactionalAuditContext } from "./audit-service";

export const STOCK_ENTRY_PREVIEW_VERSION = 1 as const;
export const STOCK_ENTRY_PREVIEW_ACTIVE_KEY = "active";

export type StockEntryProductCandidate = {
  id: string;
  name: string;
  salePrice: number;
};

export const stockEntryDraftSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1).max(200),
  salePrice: z.number().nonnegative().max(1_000_000),
  quantity: z.number().int().min(1).max(100_000),
  unitCost: z.number().positive().max(1_000_000),
  totalCost: z.number().positive().max(10_000_000),
  occurredAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().min(1).max(500).optional(),
});

export type StockEntryDraft = z.infer<typeof stockEntryDraftSchema>;

export const stockEntryPreviewSchema = z.object({
  version: z.literal(STOCK_ENTRY_PREVIEW_VERSION),
  id: z.string().uuid(),
  unitId: z.string().min(1),
  actorId: z.string().min(1),
  phoneFingerprint: z.string().min(8).max(128),
  draft: stockEntryDraftSchema,
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
});

export type StockEntryPreview = z.infer<typeof stockEntryPreviewSchema>;

export type StockEntryPreviewStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "CANCELLED" | "EXPIRED";

export type StockEntryPreviewRecord = {
  action: string;
  key: typeof STOCK_ENTRY_PREVIEW_ACTIVE_KEY;
  payloadHash: string;
  status: StockEntryPreviewStatus;
  preview: StockEntryPreview;
  response?: StockEntryConfirmationResult;
};

export const stockEntryConfirmationResultSchema = z.object({
  operationId: z.string().min(1),
  previewId: z.string().uuid(),
  movement: z.object({
    id: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    unitCost: z.number().positive(),
    totalCost: z.number().positive(),
    occurredAt: z.string().datetime({ offset: true }),
  }),
  product: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    stockQty: z.number().int(),
  }),
  replay: z.boolean(),
});

export type StockEntryConfirmationResult = z.infer<typeof stockEntryConfirmationResultSchema>;

export type StockEntryFailureStage = "after_claim" | "after_stock";

export type ConfirmStockEntryInput = {
  unitId: string;
  actorId: string;
  previewId: string;
  previewAction: string;
  previewPayloadHash: string;
  draft: StockEntryDraft;
  audit: TransactionalAuditContext;
};

export function buildStockEntryPreviewStorageKey(unitId: string, action: string) {
  return `${unitId}:${action}:${STOCK_ENTRY_PREVIEW_ACTIVE_KEY}`;
}

export type StockEntryInterpretation =
  | { recognized: false }
  | {
      recognized: true;
      status: "clarification";
      reason:
        | "product_not_found"
        | "product_ambiguous"
        | "quantity_missing"
        | "quantity_ambiguous"
        | "cost_missing"
        | "cost_ambiguous"
        | "cost_inconsistent"
        | "date_invalid";
      message: string;
      candidateNames?: string[];
    }
  | { recognized: true; status: "ready"; draft: StockEntryDraft };

export type StockEntryCorrectionField = "product" | "quantity" | "unitCost" | "totalCost" | "date";

export type StockEntryCorrectionClarification =
  | { kind: "cost_kind"; amount: number }
  | { kind: "product" };

export type StockEntryCorrectionInterpretation =
  | { status: "not_correction" }
  | {
      status: "clarification";
      reason: "cost_kind_ambiguous" | "field_ambiguous" | "product_ambiguous";
      message: string;
      clarification?: StockEntryCorrectionClarification;
      candidateNames?: string[];
    }
  | {
      status: "invalid";
      reason: "quantity_invalid" | "cost_invalid" | "cost_inconsistent" | "date_invalid" | "product_not_found";
      message: string;
    }
  | {
      status: "valid";
      draft: StockEntryDraft;
      changedFields: StockEntryCorrectionField[];
    };

const NUMBER_WORD_VALUES = new Map<string, number>([
  ["um", 1], ["uma", 1], ["dois", 2], ["duas", 2], ["tres", 3], ["quatro", 4],
  ["cinco", 5], ["seis", 6], ["sete", 7], ["oito", 8], ["nove", 9], ["dez", 10],
  ["onze", 11], ["doze", 12], ["treze", 13], ["catorze", 14], ["quatorze", 14],
  ["quinze", 15], ["dezesseis", 16], ["dezessete", 17], ["dezoito", 18], ["dezenove", 19],
  ["vinte", 20], ["trinta", 30], ["quarenta", 40], ["cinquenta", 50], ["sessenta", 60],
  ["setenta", 70], ["oitenta", 80], ["noventa", 90], ["cem", 100], ["cento", 100],
  ["duzentos", 200], ["trezentos", 300], ["quatrocentos", 400], ["quinhentos", 500],
  ["seiscentos", 600], ["setecentos", 700], ["oitocentos", 800], ["novecentos", 900],
  ["mil", 1000],
]);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizedWords(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function singularizeToken(token: string) {
  if (token.length > 4 && token.endsWith("oes")) return `${token.slice(0, -3)}ao`;
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -1);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function normalizeProductName(value: unknown) {
  return normalizedWords(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

function parseNumberWords(value: string) {
  const normalized = normalizedWords(value);
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const words = normalized.split(" ").filter((word) => word !== "e");
  if (!words.length || words.some((word) => !NUMBER_WORD_VALUES.has(word))) return undefined;
  let total = 0;
  let current = 0;
  for (const word of words) {
    const amount = NUMBER_WORD_VALUES.get(word)!;
    if (amount === 1000) {
      total += Math.max(current, 1) * 1000;
      current = 0;
    } else {
      current += amount;
    }
  }
  return total + current;
}

function parseLocalizedNumber(value: string) {
  const normalized = value.trim();
  if (/^\d{1,7}(?:[.,]\d{1,2})?$/.test(normalized)) {
    return Number(normalized.replace(",", "."));
  }
  return parseNumberWords(normalized);
}

const QUANTITY_TOKEN = "(?:\\d{1,6}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa))?";

export function looksLikeStockEntryCommand(message: string) {
  const text = normalizedWords(message);
  const hasEntryVerb = /\b(?:comprei|compramos|adiciona|adiciono|adicionar|adicione|coloca|coloco|colocar|coloque|entrada|entraram|entrou|chegaram|chegou|inclui|incluir|recebi|recebemos|repor|reposicao)\b/.test(text);
  const hasStockCue = /\bestoque\b/.test(text);
  const hasAmbiguousPlacementVerb = /\b(?:coloca|coloco|colocar|coloque)\b/.test(text);
  const hasSaleCue = /\b(?:vendi|venda|cliente|pagamento)\b/.test(text);
  if (hasAmbiguousPlacementVerb && !hasStockCue) return false;
  return hasEntryVerb && (!hasSaleCue || hasStockCue || /\b(?:comprei|compramos|recebi|recebemos|entraram|entrou|chegaram|chegou|reposicao)\b/.test(text));
}

function extractProductDescriptor(text: string) {
  const normalized = normalizeText(text);
  const patterns = [
    new RegExp(`\\b(?:comprei|compramos|recebi|recebemos|adiciona|adiciono|adicionar|adicione|coloca|coloco|colocar|coloque|inclui|incluir|repor)\\s+(?:no\\s+estoque\\s+)?(${QUANTITY_TOKEN})\\s+(.+?)(?=\\s+(?:por|a\\s+|no\\s+estoque|ao\\s+estoque|com\\s+custo|custando|paguei|pagamos|cada|total|obs(?:ervacao)?\\s*:)|[.!?,;]|$)`, "i"),
    new RegExp(`\\b(?:entraram|entrou|chegaram|chegou)\\s+(?:no\\s+estoque\\s+)?(${QUANTITY_TOKEN})\\s+(.+?)(?=\\s+(?:por|a\\s+|no\\s+estoque|ao\\s+estoque|com\\s+custo|custando|paguei|pagamos|cada|total|obs(?:ervacao)?\\s*:)|[.!?,;]|$)`, "i"),
    new RegExp(`\\b(?:da|dar|de)\\s+entrada\\s+(?:em|de)?\\s*(${QUANTITY_TOKEN})\\s+(.+?)(?=\\s+(?:por|a\\s+|no\\s+estoque|com\\s+custo|custando|paguei|pagamos|cada|total|obs(?:ervacao)?\\s*:)|[.!?,;]|$)`, "i"),
    new RegExp(`\\bentrada\\s+(?:de\\s+)?(${QUANTITY_TOKEN})\\s+(.+?)(?=\\s+(?:por|a\\s+|no\\s+estoque|com\\s+custo|custando|paguei|pagamos|cada|total|obs(?:ervacao)?\\s*:)|[.!?,;]|$)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return { quantityToken: match[1], productText: match[2].replace(/\b(?:unidades?|itens?)\b/g, "").trim() };
  }
  return null;
}

function resolveProduct(message: string, descriptor: string | undefined, products: StockEntryProductCandidate[]) {
  const messageName = normalizeProductName(message);
  const mentioned = products.filter((product) => {
    const name = normalizeProductName(product.name);
    return name && new RegExp(`(?:^| )${name.replace(/ /g, " ")}(?: |$)`).test(messageName);
  });
  if (mentioned.length === 1) return { match: mentioned[0], candidates: mentioned };
  if (mentioned.length > 1) return { match: null, candidates: mentioned };

  const query = normalizeProductName(descriptor);
  if (!query) return { match: null, candidates: [] as StockEntryProductCandidate[] };
  const exact = products.filter((product) => normalizeProductName(product.name) === query);
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  if (exact.length > 1) return { match: null, candidates: exact };
  const partial = products.filter((product) => {
    const candidate = normalizeProductName(product.name);
    return candidate.includes(query) || query.includes(candidate);
  });
  return partial.length === 1 ? { match: partial[0], candidates: partial } : { match: null, candidates: partial };
}

function parseQuantity(message: string, descriptorToken?: string) {
  const values: number[] = [];
  const primary = descriptorToken ? parseNumberWords(descriptorToken) : undefined;
  if (primary !== undefined) values.push(primary);
  const normalized = normalizeText(message);
  const explicitPatterns = [
    new RegExp(`\\bquantidade\\s*(?:e|:|de)?\\s*(${QUANTITY_TOKEN})\\b`, "gi"),
    new RegExp(`\\b(${QUANTITY_TOKEN})\\s+(?:unidades?|itens?)\\b`, "gi"),
  ];
  for (const pattern of explicitPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const parsed = parseNumberWords(match[1]);
      if (parsed !== undefined) values.push(parsed);
    }
  }
  const unique = [...new Set(values)];
  if (unique.length > 1) return { ambiguous: true, quantity: undefined };
  const quantity = unique[0];
  return {
    ambiguous: false,
    quantity: Number.isInteger(quantity) && Number(quantity) > 0 && Number(quantity) <= 100_000 ? quantity : undefined,
  };
}

type MoneyCandidate = { amount: number; kind: "unit" | "total" | "unknown" };

function extractMoneyCandidates(message: string): MoneyCandidate[] {
  const text = normalizeText(message);
  const word = "(?:um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)(?:\\s+e\\s+(?:um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa))?";
  const amountPattern = `\\d{1,7}(?:[.,]\\d{1,2})?|${word}`;
  const pattern = new RegExp(`(?:r\\$\\s*(${amountPattern})(?:\\s*(?:reais|real))?|(${amountPattern})\\s*(?:reais|real)\\b)`, "gi");
  const candidates: MoneyCandidate[] = [];
  for (const match of text.matchAll(pattern)) {
    const amount = parseLocalizedNumber(match[1] ?? match[2]);
    if (!Number.isFinite(amount) || Number(amount) <= 0) continue;
    const matchIndex = Number(match.index ?? 0);
    const before = text.slice(Math.max(0, matchIndex - 35), matchIndex);
    const after = text.slice(matchIndex + match[0].length, Math.min(text.length, matchIndex + match[0].length + 35));
    const qualifierDistance = (pattern: RegExp) => {
      const beforeMatches = [...before.matchAll(new RegExp(pattern.source, "gi"))];
      const beforeDistance = beforeMatches.length ? before.length - Number(beforeMatches.at(-1)?.index ?? 0) : Number.POSITIVE_INFINITY;
      const afterMatch = after.match(new RegExp(pattern.source, "i"));
      const afterDistance = afterMatch ? Number(afterMatch.index ?? 0) + 1 : Number.POSITIVE_INFINITY;
      return Math.min(beforeDistance, afterDistance);
    };
    const unitDistance = qualifierDistance(/\b(?:cada|unitari[oa]|por\s+unidade)\b/);
    const totalDistance = qualifierDistance(/\b(?:total|ao\s+todo|paguei|pagamos|valor\s+da\s+compra)\b/);
    const kind = unitDistance === totalDistance
      ? "unknown"
      : unitDistance < totalDistance ? "unit" : totalDistance < Number.POSITIVE_INFINITY ? "total" : "unknown";
    candidates.push({ amount: Math.round(Number(amount) * 100) / 100, kind });
  }
  return candidates;
}

function resolveCosts(message: string, quantity: number) {
  const normalized = normalizeText(message);
  if (/(?:r\$\s*)?-\s*\d+(?:[.,]\d+)?\s*(?:reais|real)?\b/.test(normalized)) {
    return { reason: "cost_inconsistent" as const };
  }
  const candidates = extractMoneyCandidates(message);
  if (!candidates.length) return { reason: "cost_missing" as const };
  const unknownCandidates = candidates.filter((candidate) => candidate.kind === "unknown");
  if (unknownCandidates.length) {
    if (quantity === 1 && candidates.length === 1) {
      return { unitCost: unknownCandidates[0].amount, totalCost: unknownCandidates[0].amount };
    }
    return { reason: "cost_ambiguous" as const };
  }
  const unitValues = [...new Set(candidates.filter((candidate) => candidate.kind === "unit").map((candidate) => candidate.amount))];
  const totalValues = [...new Set(candidates.filter((candidate) => candidate.kind === "total").map((candidate) => candidate.amount))];
  if (unitValues.length > 1 || totalValues.length > 1) return { reason: "cost_inconsistent" as const };
  let unitCost = unitValues[0];
  let totalCost = totalValues[0];
  if (unitCost !== undefined && totalCost !== undefined) {
    if (Math.round(unitCost * quantity * 100) !== Math.round(totalCost * 100)) return { reason: "cost_inconsistent" as const };
  } else if (unitCost !== undefined) {
    totalCost = Math.round(unitCost * quantity * 100) / 100;
  } else if (totalCost !== undefined) {
    const totalCents = Math.round(totalCost * 100);
    if (totalCents % quantity !== 0) return { reason: "cost_inconsistent" as const };
    unitCost = totalCents / quantity / 100;
  }
  if (!unitCost || !totalCost) return { reason: "cost_missing" as const };
  return { unitCost, totalCost };
}

function saoPauloDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

function resolveOccurredAt(message: string, now: Date) {
  const text = normalizeText(message);
  let date = saoPauloDate(now);
  if (/\bontem\b/.test(text)) date = saoPauloDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const explicit = text.match(/\b(?:dia|data)?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (explicit) {
    const day = Number(explicit[1]);
    const month = Number(explicit[2]);
    const year = Number(explicit[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
    date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return `${date}T12:00:00.000-03:00`;
}

function extractNotes(message: string) {
  const match = String(message).match(/\b(?:obs|observa[cç][aã]o|observa[cç][oõ]es)\s*[:=-]\s*(.+)$/iu);
  return match?.[1]?.trim().slice(0, 500) || undefined;
}

const CORRECTION_NUMBER_TOKEN = "(?:-?\\d{1,7}(?:[.,]\\d{1,2})?|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)";

function parseCorrectionNumber(value: string) {
  const normalized = normalizedWords(value);
  if (normalized === "zero") return 0;
  if (/^-?\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim())) return Number(value.trim().replace(",", "."));
  return parseNumberWords(value);
}

function firstCorrectionNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = parseCorrectionNumber(match[1]);
    if (value !== undefined && Number.isFinite(value)) return value;
  }
  return undefined;
}

function correctionMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

function correctionProductTarget(text: string) {
  const patterns = [
    /\btroca(?:r)?(?:\s+o\s+produto)?\s+para\s+(.+?)(?=\s*,|[.;]|\s+(?:foram|sao|quantidade|custou|custo|total)\b|$)/i,
    /\b(?:o\s+)?produto\s+(?:correto\s+)?(?:e|era|foi)\s+(.+?)(?=\s*,|[.;]|$)/i,
    /\b(?:me\s+enganei\s*,?\s*)?era\s+(?:o|a)?\s*(.+?)(?=\s*,|[.;]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/^(?:o|a|os|as)\s+/i, "").trim();
  }
  return undefined;
}

export function interpretStockEntryCorrection(input: {
  message: string;
  currentDraft: StockEntryDraft;
  products: StockEntryProductCandidate[];
  now?: Date;
  clarification?: StockEntryCorrectionClarification;
}): StockEntryCorrectionInterpretation {
  const text = normalizeText(input.message);
  const correctionMarker = /\b(?:me enganei|na verdade|corret[oa]|corrigir|corrige|troca|trocar)\b/.test(text);
  if (looksLikeStockEntryCommand(text) && !correctionMarker) return { status: "not_correction" };

  const changedFields: StockEntryCorrectionField[] = [];
  let product = input.products.find((candidate) => candidate.id === input.currentDraft.productId);
  let quantity: number | undefined;
  let unitCost: number | undefined;
  let totalCost: number | undefined;
  let occurredAt: string | undefined;

  if (input.clarification?.kind === "cost_kind") {
    if (/\b(?:total|compra\s+inteira|ao\s+todo)\b/.test(text)) {
      totalCost = input.clarification.amount;
      changedFields.push("totalCost");
    } else if (/\b(?:unitari[oa]|por\s+unidade|cada|unidade)\b/.test(text)) {
      unitCost = input.clarification.amount;
      changedFields.push("unitCost");
    } else {
      return {
        status: "clarification",
        reason: "cost_kind_ambiguous",
        message: `Os ${correctionMoney(input.clarification.amount)} correspondem ao custo unitário ou ao custo total?`,
        clarification: input.clarification,
      };
    }
  }

  const productTarget = input.clarification?.kind === "product" ? text : correctionProductTarget(text);
  if (productTarget) {
    const resolution = resolveProduct(text, productTarget, input.products);
    if (!resolution.match) {
      if (resolution.candidates.length > 1) {
        return {
          status: "clarification",
          reason: "product_ambiguous",
          message: `Encontrei mais de um produto parecido: ${resolution.candidates.map((item) => item.name).join(", ")}. Qual é o produto exato?`,
          clarification: { kind: "product" },
          candidateNames: resolution.candidates.map((item) => item.name),
        };
      }
      return { status: "invalid", reason: "product_not_found", message: "Não encontrei esse produto cadastrado nesta unidade." };
    }
    product = resolution.match;
    changedFields.push("product");
  }

  const quantityCue = /\b(?:sao|foram)\s+|\bquantidade\b|\bcoloca\b/.test(text);
  quantity = firstCorrectionNumber(text, [
    new RegExp(`\\b(?:sao|foram)\\s+(${CORRECTION_NUMBER_TOKEN})\\s+(?:unidades?|itens?)\\b`, "i"),
    new RegExp(`\\bquantidade(?:\\s+correta)?\\s*(?:e|era|foi|:)?\\s*(${CORRECTION_NUMBER_TOKEN})\\b`, "i"),
    new RegExp(`\\bcoloca\\s+(${CORRECTION_NUMBER_TOKEN})\\b`, "i"),
  ]);
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100_000) {
      return { status: "invalid", reason: "quantity_invalid", message: "A quantidade deve ser um número inteiro positivo." };
    }
    changedFields.push("quantity");
  } else if (quantityCue) {
    return { status: "invalid", reason: "quantity_invalid", message: "A quantidade informada não é válida." };
  }

  if (!input.clarification) {
    unitCost = firstCorrectionNumber(text, [
      new RegExp(`\\b(?:custo|valor)\\s+(?:unitari[oa]|por\\s+unidade)(?:\\s+corret[oa])?\\s*(?:e|era|foi|:)?\\s*(${CORRECTION_NUMBER_TOKEN})(?:\\s*reais?)?`, "i"),
      new RegExp(`\\b(?:foi|custou)?\\s*(${CORRECTION_NUMBER_TOKEN})\\s*(?:reais?)?\\s*(?:cada|por\\s+unidade)\\b`, "i"),
    ]);
    totalCost = firstCorrectionNumber(text, [
      new RegExp(`\\b(?:o\\s+)?total(?:\\s+correto)?(?:\\s*,?\\s+na\\s+verdade\\s*,?)?\\s*(?:e|era|foi|deu|:)?\\s*(${CORRECTION_NUMBER_TOKEN})(?:\\s*reais?)?`, "i"),
      new RegExp(`\\bpaguei\\s+(${CORRECTION_NUMBER_TOKEN})(?:\\s*reais?)?\\s*(?:no\\s+total|ao\\s+todo)\\b`, "i"),
      new RegExp(`\\b(?:a\\s+)?compra\\s+inteira\\s+(?:deu|foi)\\s+(${CORRECTION_NUMBER_TOKEN})(?:\\s*reais?)?`, "i"),
    ]);
    if (unitCost !== undefined) changedFields.push("unitCost");
    if (totalCost !== undefined) changedFields.push("totalCost");

    const unknownCost = firstCorrectionNumber(text, [
      new RegExp(`\\b(?:o\\s+)?valor\\s+correto\\s*(?:e|era|foi|:)?\\s*(${CORRECTION_NUMBER_TOKEN})(?:\\s*reais?)?`, "i"),
    ]);
    if (unknownCost !== undefined && unitCost === undefined && totalCost === undefined) {
      if (unknownCost <= 0) return { status: "invalid", reason: "cost_invalid", message: "O custo deve ser maior que zero." };
      return {
        status: "clarification",
        reason: "cost_kind_ambiguous",
        message: `Os ${correctionMoney(unknownCost)} correspondem ao custo unitário ou ao custo total?`,
        clarification: { kind: "cost_kind", amount: unknownCost },
      };
    }
  }

  if ((unitCost !== undefined && unitCost <= 0) || (totalCost !== undefined && totalCost <= 0)) {
    return { status: "invalid", reason: "cost_invalid", message: "O custo deve ser maior que zero." };
  }
  if (/\b(?:custo\s+unitario|valor\s+por\s+unidade|total(?:\s+correto(?:\s*,?\s+na\s+verdade)?|\s*,?\s+na\s+verdade))\b/.test(text)
    && unitCost === undefined && totalCost === undefined && !input.clarification) {
    return { status: "invalid", reason: "cost_invalid", message: "O custo informado não é válido." };
  }

  const hasDateCue = /\b(?:ontem|hoje|data|dia\s+\d{1,2}[/-]|comprei\s+hoje)\b/.test(text);
  if (hasDateCue) {
    occurredAt = resolveOccurredAt(text, input.now ?? new Date()) ?? undefined;
    if (!occurredAt) return { status: "invalid", reason: "date_invalid", message: "A data informada não é válida. Use dia/mês/ano." };
    changedFields.push("date");
  }

  if (!changedFields.length) {
    const genericNumber = firstCorrectionNumber(text, [
      new RegExp(`\\b(?:na\\s+verdade\\s+)?foi\\s+(${CORRECTION_NUMBER_TOKEN})\\b`, "i"),
    ]);
    if (genericNumber !== undefined || correctionMarker) {
      return {
        status: "clarification",
        reason: "field_ambiguous",
        message: "Você quer corrigir o produto, a quantidade, o custo unitário, o custo total ou a data?",
      };
    }
    return { status: "not_correction" };
  }

  const nextQuantity = quantity ?? input.currentDraft.quantity;
  let nextUnitCost = unitCost ?? input.currentDraft.unitCost;
  let nextTotalCost = totalCost ?? input.currentDraft.totalCost;
  const unitChanged = unitCost !== undefined;
  const totalChanged = totalCost !== undefined;
  const quantityChanged = quantity !== undefined;

  if (unitChanged && totalChanged) {
    if (Math.round(nextUnitCost * nextQuantity * 100) !== Math.round(nextTotalCost * 100)) {
      return { status: "invalid", reason: "cost_inconsistent", message: "Os valores de custo não fecham com a quantidade; a prévia anterior foi preservada." };
    }
  } else if (totalChanged) {
    const totalCents = Math.round(nextTotalCost * 100);
    if (totalCents % nextQuantity !== 0) {
      return { status: "invalid", reason: "cost_inconsistent", message: "O total não permite calcular um custo unitário com precisão de centavos." };
    }
    nextUnitCost = totalCents / nextQuantity / 100;
  } else if (unitChanged || quantityChanged) {
    nextTotalCost = Math.round(nextUnitCost * nextQuantity * 100) / 100;
  }

  const parsed = stockEntryDraftSchema.safeParse({
    ...input.currentDraft,
    productId: product?.id ?? input.currentDraft.productId,
    productName: product?.name ?? input.currentDraft.productName,
    salePrice: product?.salePrice ?? input.currentDraft.salePrice,
    quantity: nextQuantity,
    unitCost: nextUnitCost,
    totalCost: nextTotalCost,
    occurredAt: occurredAt ?? input.currentDraft.occurredAt,
  });
  if (!parsed.success) {
    return { status: "invalid", reason: "cost_invalid", message: "A correção informada não é válida; a prévia anterior foi preservada." };
  }
  return { status: "valid", draft: parsed.data, changedFields: [...new Set(changedFields)] };
}

export function parseStockEntryPreviewDecision(message: string) {
  const normalized = message.trim().toLocaleLowerCase("pt-BR");
  if (normalized === "confirmar") return "confirm" as const;
  if (normalized === "cancelar") return "cancel" as const;
  return null;
}

export function interpretStockEntryCommand(input: {
  message: string;
  products: StockEntryProductCandidate[];
  now?: Date;
}): StockEntryInterpretation {
  if (!looksLikeStockEntryCommand(input.message)) return { recognized: false };
  const descriptor = extractProductDescriptor(input.message);
  const product = resolveProduct(input.message, descriptor?.productText, input.products);
  if (!product.match) {
    if (product.candidates.length > 1) {
      return {
        recognized: true,
        status: "clarification",
        reason: "product_ambiguous",
        message: `Encontrei mais de um produto parecido: ${product.candidates.map((item) => item.name).join(", ")}. Qual é o produto exato?`,
        candidateNames: product.candidates.map((item) => item.name),
      };
    }
    return {
      recognized: true,
      status: "clarification",
      reason: "product_not_found",
      message: "Não encontrei esse produto cadastrado nesta unidade. Informe o nome exato de um produto existente.",
    };
  }

  const quantity = parseQuantity(input.message, descriptor?.quantityToken);
  if (quantity.ambiguous) {
    return { recognized: true, status: "clarification", reason: "quantity_ambiguous", message: "Encontrei quantidades diferentes. Qual é a quantidade correta?" };
  }
  if (!quantity.quantity) {
    return { recognized: true, status: "clarification", reason: "quantity_missing", message: "Qual é a quantidade inteira que entrou no estoque?" };
  }

  const costs = resolveCosts(input.message, quantity.quantity);
  const costFailure = "reason" in costs ? costs.reason : undefined;
  if (costFailure) {
    const messages = {
      cost_missing: "Qual foi o custo da compra? Informe também se o valor é unitário ou total.",
      cost_ambiguous: "Esse valor é o custo unitário ou o custo total da compra?",
      cost_inconsistent: "Os valores de custo não fecham com a quantidade. Informe o custo unitário ou um total consistente.",
    } as const;
    return { recognized: true, status: "clarification", reason: costFailure, message: messages[costFailure] };
  }

  const occurredAt = resolveOccurredAt(input.message, input.now ?? new Date());
  if (!occurredAt) {
    return { recognized: true, status: "clarification", reason: "date_invalid", message: "A data informada não é válida. Use dia/mês/ano." };
  }
  const draft = stockEntryDraftSchema.parse({
    productId: product.match.id,
    productName: product.match.name,
    salePrice: product.match.salePrice,
    quantity: quantity.quantity,
    unitCost: costs.unitCost,
    totalCost: costs.totalCost,
    occurredAt,
    notes: extractNotes(input.message),
  });
  return { recognized: true, status: "ready", draft };
}

function currencyBR(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatStockEntryPreview(preview: StockEntryPreview, options: { updated?: boolean } = {}) {
  const draft = preview.draft;
  const lines = [
    options.updated ? "Entrada de estoque atualizada" : "Entrada de estoque",
    `Produto: ${draft.productName}`,
    `Quantidade: ${draft.quantity}`,
    `Custo unitário de compra: ${currencyBR(draft.unitCost)}`,
    `Custo total: ${currencyBR(draft.totalCost)}`,
    `Preço de venda atual: ${currencyBR(draft.salePrice)}`,
    `Data: ${draft.occurredAt.slice(8, 10)}/${draft.occurredAt.slice(5, 7)}/${draft.occurredAt.slice(0, 4)}`,
  ];
  if (draft.notes) lines.push(`Observação: ${draft.notes}`);
  lines.push("", "CONFIRMAR ou CANCELAR");
  return lines.join("\n");
}

export function buildStockEntryPreviewAction(input: { actorId: string; phoneFingerprint: string }) {
  const scope = crypto.createHash("sha256")
    .update(`${input.actorId}:${input.phoneFingerprint}`)
    .digest("hex")
    .slice(0, 24);
  return `AI_WHATSAPP_STOCK_ENTRY_PREVIEW_V1:${scope}`;
}
