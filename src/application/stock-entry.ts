import crypto from "node:crypto";
import { z } from "zod";
import type { TransactionalAuditContext } from "./audit-service";

export const STOCK_ENTRY_PREVIEW_VERSION = 1 as const;
export const STOCK_ENTRY_PREVIEW_ACTIVE_KEY = "active";

export type StockEntryProductCandidate = {
  id: string;
  name: string;
};

export const stockEntryDraftSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(100_000),
  unitCost: z.number().positive().max(1_000_000),
  totalCost: z.number().positive().max(10_000_000),
  occurredAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().min(1).max(500).optional(),
  registerExpense: z.boolean(),
});

export type StockEntryDraft = z.infer<typeof stockEntryDraftSchema>;
export const stockEntryDraftWithoutExpenseSchema = stockEntryDraftSchema.omit({ registerExpense: true });
export type StockEntryDraftWithoutExpense = z.infer<typeof stockEntryDraftWithoutExpenseSchema>;

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
  financialEntry: z.object({
    id: z.string().min(1),
    amount: z.number().positive(),
  }).nullable(),
  replay: z.boolean(),
});

export type StockEntryConfirmationResult = z.infer<typeof stockEntryConfirmationResultSchema>;

export type StockEntryFailureStage = "after_claim" | "after_stock" | "after_financial";

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
        | "date_invalid"
        | "financial_ambiguous";
      message: string;
      candidateNames?: string[];
      draftWithoutExpense?: StockEntryDraftWithoutExpense;
    }
  | { recognized: true; status: "ready"; draft: StockEntryDraft };

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
  const hasEntryVerb = /\b(?:comprei|compramos|adiciona|adicionar|adicione|entrada|inclui|incluir|recebi|recebemos|repor|reposicao)\b/.test(text);
  const hasStockCue = /\bestoque\b/.test(text);
  const hasSaleCue = /\b(?:vendi|venda|cliente|pagamento)\b/.test(text);
  return hasEntryVerb && (!hasSaleCue || hasStockCue || /\b(?:comprei|compramos|recebi|recebemos|reposicao)\b/.test(text));
}

function extractProductDescriptor(text: string) {
  const normalized = normalizeText(text);
  const patterns = [
    new RegExp(`\\b(?:comprei|compramos|recebi|recebemos|adiciona|adicionar|adicione|inclui|incluir|repor)\\s+(?:no\\s+estoque\\s+)?(${QUANTITY_TOKEN})\\s+(.+?)(?=\\s+(?:por|a\\s+|no\\s+estoque|ao\\s+estoque|com\\s+custo|custando|paguei|pagamos|cada|total|obs(?:ervacao)?\\s*:)|[.!?,;]|$)`, "i"),
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
  if (candidates.some((candidate) => candidate.kind === "unknown")) return { reason: "cost_ambiguous" as const };
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

export function parseStockEntryExpenseDecision(message: string) {
  const text = normalizedWords(message);
  const negativePattern = /\b(?:sem despesa|nao registrar (?:a )?despesa|nao gerar (?:a )?despesa|nao criar (?:a )?despesa|fora do financeiro|registrar despesa nao)\b/;
  const negative = negativePattern.test(text);
  const positiveText = text.replace(new RegExp(negativePattern.source, "g"), " ");
  const positive = /\b(?:com despesa|registrar (?:a )?despesa|gerar (?:a )?despesa|criar (?:a )?despesa|lancar no financeiro|registrar despesa sim)\b/.test(positiveText);
  if (negative && positive) return "ambiguous" as const;
  if (negative) return false as const;
  if (positive) return true as const;
  return null;
}

export function parseStockEntryPreviewDecision(message: string) {
  const normalized = message.trim().toLocaleLowerCase("pt-BR");
  if (normalized === "confirmar") return "confirm" as const;
  if (normalized === "cancelar") return "cancel" as const;
  return null;
}

export function parseStockEntryFinancialClarificationAnswer(message: string) {
  const normalized = normalizeText(message);
  if (normalized === "sim") return true as const;
  if (normalized === "nao") return false as const;
  return null;
}

function resolveExpenseFlag(message: string) {
  const explicit = parseStockEntryExpenseDecision(message);
  if (explicit === "ambiguous") return { ambiguous: true, value: false };
  if (explicit !== null) return { ambiguous: false, value: explicit };
  const text = normalizedWords(message);
  return { ambiguous: false, value: /\b(?:comprei|compramos|paguei|pagamos|compra)\b/.test(text) };
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
  const expense = resolveExpenseFlag(input.message);
  const draftWithoutExpense = stockEntryDraftWithoutExpenseSchema.parse({
    productId: product.match.id,
    productName: product.match.name,
    quantity: quantity.quantity,
    unitCost: costs.unitCost,
    totalCost: costs.totalCost,
    occurredAt,
    notes: extractNotes(input.message),
  });
  if (expense.ambiguous) {
    return {
      recognized: true,
      status: "clarification",
      reason: "financial_ambiguous",
      message: "Devo registrar a despesa financeira: Sim ou Não?",
      draftWithoutExpense,
    };
  }
  const draft = stockEntryDraftSchema.parse({
    ...draftWithoutExpense,
    registerExpense: expense.value,
  });
  return { recognized: true, status: "ready", draft };
}

function currencyBR(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatStockEntryPreview(preview: StockEntryPreview) {
  const draft = preview.draft;
  const lines = [
    "Entrada de estoque",
    `Produto: ${draft.productName}`,
    `Quantidade: ${draft.quantity}`,
    `Custo unitário: ${currencyBR(draft.unitCost)}`,
    `Custo total: ${currencyBR(draft.totalCost)}`,
    `Data: ${draft.occurredAt.slice(8, 10)}/${draft.occurredAt.slice(5, 7)}/${draft.occurredAt.slice(0, 4)}`,
    `Registrar despesa financeira: ${draft.registerExpense ? "Sim" : "Não"}`,
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
