import crypto from "node:crypto";
import type { OwnerCommandContext } from "./owner-command-ai";

export type AudioVocabularyCategory =
  | "professional"
  | "service"
  | "product"
  | "payment"
  | "agenda"
  | "sale"
  | "datetime"
  | "hesitation";

export type AudioFieldValidationStatus =
  | "EXACT"
  | "GROUNDED"
  | "NEEDS_CONFIRMATION"
  | "MISSING"
  | "AMBIGUOUS"
  | "UNSAFE";

export type AudioVocabularyTerm = {
  category: AudioVocabularyCategory;
  canonical: string;
  aliases: string[];
  priority: number;
};

export type BarbershopAudioVocabulary = {
  unitId: string;
  fingerprint: string;
  prompt: string;
  terms: AudioVocabularyTerm[];
};

export type AudioCanonicalization = {
  transcript: string;
  fields: Array<{
    category: Extract<AudioVocabularyCategory, "professional" | "service" | "product" | "payment">;
    status: AudioFieldValidationStatus;
    canonical?: string;
    score?: number;
  }>;
  correctedCategories: AudioVocabularyCategory[];
  correctionFingerprints: string[];
  focusedCandidates: string[];
  needsSecondPass: boolean;
};

const MAX_PROMPT_TERMS = 120;
const MAX_PROMPT_CHARS = 1_500;
const cache = new Map<string, { sourceFingerprint: string; vocabulary: BarbershopAudioVocabulary }>();

const agendaTerms = [
  "agendar", "marcar", "encaixar", "colocar", "remarcar", "cancelar", "confirmar", "atender",
  "corte", "horario", "cliente", "profissional",
];
const saleTerms = ["vender", "registrar venda", "passou", "levou", "comprou", "unidade", "quantidade", "valor", "pagamento"];
const datetimeTerms = [
  "hoje", "amanha", "depois de amanha", "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo",
  "manha", "tarde", "noite", "meio-dia", "meia-noite", "umas quatro", "quatro da tarde", "dez e meia",
];
const hesitationTerms = ["e", "ah", "hum", "tipo", "entao", "deixa eu ver", "por favor"];

export function normalizeAudioVocabularyText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function portuguesePhoneticKey(value: unknown) {
  return normalizeAudioVocabularyText(value)
    .replace(/\b(h)/g, "")
    .replace(/ph/g, "f")
    .replace(/(?:ge|gi|j)/g, "j")
    .replace(/(?:ce|ci|ss|sc|sç|xc|ç|z)/g, "s")
    .replace(/(?:ch|sh|x)/g, "x")
    .replace(/(?:qu|c|k)/g, "k")
    .replace(/lh/g, "li")
    .replace(/nh/g, "ni")
    .replace(/rr/g, "r")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, "");
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(left: string, right: string) {
  const max = Math.max(left.length, right.length);
  return max ? 1 - levenshtein(left, right) / max : 1;
}

function singularPluralAliases(value: string) {
  const normalized = normalizeAudioVocabularyText(value);
  if (!normalized || normalized.includes(" ")) return [];
  if (normalized.endsWith("s") && normalized.length > 4) return [normalized.slice(0, -1)];
  if (normalized.endsWith("m")) return [`${normalized.slice(0, -1)}ns`];
  return [`${normalized}s`];
}

function nameParts(value: string) {
  const parts = value.trim().split(/\s+/).filter((part) => normalizeAudioVocabularyText(part).length >= 3);
  return parts.length > 1 ? parts : [];
}

function paymentAliases(canonical: string) {
  const normalized = normalizeAudioVocabularyText(canonical);
  if (normalized.includes("pix")) return ["pics", "piks", "pique"];
  if (normalized.includes("dinheiro")) return ["grana", "especie", "em dinheiro"];
  if (normalized.includes("debito")) return ["cartao de debito", "no debito"];
  if (normalized.includes("credito")) return ["cartao de credito", "no credito"];
  if (normalized.includes("cartao")) return ["cartao", "no cartao"];
  return [];
}

function sourceFingerprint(context: OwnerCommandContext) {
  const safe = {
    unitName: context.unitName ?? "",
    professionals: context.professionals.map((item) => item.name).sort(),
    services: context.services.map((item) => [item.name, item.category ?? ""]).sort(),
    products: context.products.map((item) => [item.name, item.category ?? ""]).sort(),
    payments: context.paymentMethods.map((item) => item.name).sort(),
  };
  return crypto.createHash("sha256").update(JSON.stringify(safe)).digest("hex");
}

function buildTerms(context: OwnerCommandContext) {
  const byKey = new Map<string, AudioVocabularyTerm>();
  const add = (category: AudioVocabularyCategory, canonical: unknown, aliases: unknown[] = [], priority = 50) => {
    const display = String(canonical ?? "").trim();
    const normalized = normalizeAudioVocabularyText(display);
    if (!normalized) return;
    const key = `${category}:${normalized}`;
    const safeAliases = [...new Set(aliases.map(normalizeAudioVocabularyText).filter(Boolean))].sort();
    const current = byKey.get(key);
    byKey.set(key, {
      category,
      canonical: current?.canonical ?? display,
      aliases: [...new Set([...(current?.aliases ?? []), ...safeAliases])].sort(),
      priority: Math.max(current?.priority ?? 0, priority),
    });
  };

  context.professionals.forEach((item) => {
    add("professional", item.name, nameParts(item.name), 100);
  });
  context.services.forEach((item) => {
    add("service", item.name, [item.category, ...singularPluralAliases(item.name)], 95);
    if (item.category) add("service", item.category, [], 70);
  });
  context.products.forEach((item) => {
    add("product", item.name, [item.category, ...singularPluralAliases(item.name)], 95);
    if (item.category) add("product", item.category, [], 65);
  });
  context.paymentMethods.forEach((item) => add("payment", item.name, paymentAliases(item.name), 90));
  agendaTerms.forEach((term) => add("agenda", term, [], 45));
  saleTerms.forEach((term) => add("sale", term, [], 45));
  datetimeTerms.forEach((term) => add("datetime", term, [], 40));
  hesitationTerms.forEach((term) => add("hesitation", term, [], 10));

  return [...byKey.values()].sort((left, right) =>
    right.priority - left.priority
    || left.category.localeCompare(right.category, "pt-BR")
    || left.canonical.localeCompare(right.canonical, "pt-BR"));
}

function buildPrompt(context: OwnerCommandContext, terms: AudioVocabularyTerm[]) {
  const allowed = new Set<AudioVocabularyCategory>(["professional", "service", "product", "payment", "agenda", "sale", "datetime"]);
  const entries = [String(context.unitName ?? "Barbearia").trim() || "Barbearia"];
  for (const term of terms) {
    if (!allowed.has(term.category)) continue;
    const candidate = term.canonical.replace(/[\r\n\t]+/g, " ").trim();
    if (!candidate || entries.some((entry) => normalizeAudioVocabularyText(entry) === normalizeAudioVocabularyText(candidate))) continue;
    if (entries.length >= MAX_PROMPT_TERMS) break;
    const next = `${entries.join(", ")}, ${candidate}`;
    if (next.length > MAX_PROMPT_CHARS) break;
    entries.push(candidate);
  }
  return entries.join(", ").slice(0, MAX_PROMPT_CHARS);
}

export function buildBarbershopAudioVocabulary(context: OwnerCommandContext) {
  const fingerprint = sourceFingerprint(context);
  const cached = cache.get(context.unitId);
  if (cached?.sourceFingerprint === fingerprint) return cached.vocabulary;
  const terms = buildTerms(context);
  const vocabulary: BarbershopAudioVocabulary = {
    unitId: context.unitId,
    fingerprint,
    terms,
    prompt: buildPrompt(context, terms),
  };
  cache.set(context.unitId, { sourceFingerprint: fingerprint, vocabulary });
  return vocabulary;
}

type Candidate = { term: AudioVocabularyTerm; score: number; exact: boolean; alias: boolean; tokenLength: number };

function scoreCandidate(phrase: string, term: AudioVocabularyTerm): Candidate {
  const canonical = normalizeAudioVocabularyText(term.canonical);
  const aliases = term.aliases.map(normalizeAudioVocabularyText);
  const exact = phrase === canonical;
  const alias = aliases.includes(phrase);
  const editScore = Math.max(similarity(phrase, canonical), ...aliases.map((item) => similarity(phrase, item)), 0);
  const phonetic = portuguesePhoneticKey(phrase);
  const phoneticScore = Math.max(
    similarity(phonetic, portuguesePhoneticKey(canonical)),
    ...aliases.map((item) => similarity(phonetic, portuguesePhoneticKey(item))),
    0,
  );
  return {
    term,
    score: exact ? 1 : alias ? 0.99 : Math.max(editScore, phoneticScore * 0.97),
    exact,
    alias,
    tokenLength: Math.max(1, canonical.split(" ").length),
  };
}

function threshold(category: AudioVocabularyCategory, phrase: string) {
  if (phrase.length <= 3) return category === "payment" ? 0.9 : 0.94;
  if (category === "payment") return 0.72;
  return 0.8;
}

export function canonicalizeAudioTranscript(transcript: string, vocabulary: BarbershopAudioVocabulary): AudioCanonicalization {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const normalizedTranscript = normalizeAudioVocabularyText(transcript);
  const entityTerms = vocabulary.terms.filter((term) => ["professional", "service", "product", "payment"].includes(term.category));
  const output: string[] = [];
  const fields: AudioCanonicalization["fields"] = [];
  const correctedCategories = new Set<AudioVocabularyCategory>();
  const fingerprints: string[] = [];
  const focused = new Set<string>();
  let needsSecondPass = false;

  for (let index = 0; index < words.length;) {
    let accepted: Candidate | undefined;
    let acceptedPhrase = "";
    let ambiguous: Candidate | undefined;
    for (let size = Math.min(4, words.length - index); size >= 1; size -= 1) {
      const phrase = normalizeAudioVocabularyText(words.slice(index, index + size).join(" "));
      if (!phrase || /\d/.test(phrase)) continue;
      const prefix = normalizeAudioVocabularyText(words.slice(Math.max(0, index - 2), index).join(" "));
      const ranked = entityTerms
        .filter((term) => {
          if (term.category === "professional") return /(?:^| )(?:com|profissional)$/.test(prefix);
          if (term.category === "product") return /\b(?:vender|venda|vendi|levou|comprou|produto|unidade)\b/.test(normalizedTranscript);
          if (term.category === "payment") return /\b(?:pagamento|pagou|pix|dinheiro|cartao|debito|credito|venda|vender|vendi)\b/.test(normalizedTranscript);
          return /\b(?:agendar|agenda|marcar|encaixar|remarcar|servico|corte|barba)\b/.test(normalizedTranscript);
        })
        .map((term) => scoreCandidate(phrase, term))
        .filter((candidate) => candidate.tokenLength === size || size === 1)
        .sort((left, right) => right.score - left.score || right.term.priority - left.term.priority);
      const first = ranked[0];
      const second = ranked.find((candidate) => normalizeAudioVocabularyText(candidate.term.canonical) !== normalizeAudioVocabularyText(first?.term.canonical));
      if (!first) continue;
      const margin = first.score - (second?.score ?? 0);
      if (first.score >= threshold(first.term.category, phrase) && (first.exact || first.alias || margin >= 0.12)) {
        accepted = { ...first, tokenLength: size };
        acceptedPhrase = phrase;
        break;
      }
      if (first.score >= 0.65 && (!ambiguous || first.score > ambiguous.score)) ambiguous = { ...first, tokenLength: size };
    }

    if (accepted) {
      const category = accepted.term.category as AudioCanonicalization["fields"][number]["category"];
      output.push(accepted.term.canonical);
      const changed = normalizeAudioVocabularyText(accepted.term.canonical) !== acceptedPhrase;
      fields.push({
        category,
        status: accepted.exact ? "EXACT" : "GROUNDED",
        canonical: accepted.term.canonical,
        score: Number(accepted.score.toFixed(3)),
      });
      if (changed) {
        correctedCategories.add(category);
        fingerprints.push(crypto.createHash("sha256").update(`${category}:${acceptedPhrase}:${normalizeAudioVocabularyText(accepted.term.canonical)}`).digest("hex").slice(0, 12));
      }
      index += accepted.tokenLength;
      continue;
    }

    if (ambiguous) {
      const category = ambiguous.term.category as AudioCanonicalization["fields"][number]["category"];
      fields.push({ category, status: "AMBIGUOUS", score: Number(ambiguous.score.toFixed(3)) });
      focused.add(ambiguous.term.canonical);
      needsSecondPass = true;
    }
    output.push(words[index]);
    index += 1;
  }

  return {
    transcript: output.join(" ").slice(0, 1_000),
    fields,
    correctedCategories: [...correctedCategories].sort(),
    correctionFingerprints: [...new Set(fingerprints)].sort(),
    focusedCandidates: [...focused].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 20),
    needsSecondPass,
  };
}

export function buildFocusedWhisperPrompt(vocabulary: BarbershopAudioVocabulary, candidates: string[]) {
  const values = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .slice(0, 20);
  if (!values.length) return "";
  return values.join(", ").slice(0, 500);
}

export function getAudioCriticalMissingFields(preview: { intent?: string; missingFields?: string[] }) {
  const critical = preview.intent === "sell_product" || preview.intent === "product_sale"
    ? new Set(["productName", "quantity", "paymentMethod"])
    : preview.intent === "schedule_appointment"
      ? new Set(["serviceNames", "professionalName", "date", "time"])
      : new Set<string>();
  return (preview.missingFields ?? []).filter((field) => critical.has(field));
}
