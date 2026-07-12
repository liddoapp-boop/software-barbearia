export type AiWhatsappEntityKind = "product" | "service" | "payment" | "client" | "professional";

export type AiWhatsappEntityResolutionStatus =
  | "EXACT_MATCH"
  | "UNIQUE_NORMALIZED_MATCH"
  | "EXPLICIT_ALIAS_MATCH"
  | "PARTIAL_MATCH"
  | "AMBIGUOUS"
  | "NOT_FOUND";

export type AiWhatsappEntityAlias = {
  entity: AiWhatsappEntityKind;
  alias: string;
  canonicalName: string;
};

// This list is deliberately small and versioned. It is not a fuzzy dictionary:
// every alias names one canonical catalog value and is revalidated at runtime.
export const AI_WHATSAPP_ENTITY_ALIASES: readonly AiWhatsappEntityAlias[] = [
  { entity: "product", alias: "Pomada", canonicalName: "Pomada Matte" },
  { entity: "service", alias: "Corte", canonicalName: "Corte Premium" },
  { entity: "service", alias: "Corte masculino", canonicalName: "Corte Premium" },
  { entity: "payment", alias: "pix", canonicalName: "Pix" },
  { entity: "payment", alias: "credito", canonicalName: "Cartao de credito" },
  { entity: "payment", alias: "cartao credito", canonicalName: "Cartao de credito" },
  { entity: "payment", alias: "debito", canonicalName: "Cartao de debito" },
  { entity: "payment", alias: "cartao debito", canonicalName: "Cartao de debito" },
];

export function normalizeAiWhatsappEntityText(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveAiWhatsappEntity<T>(input: {
  entity: AiWhatsappEntityKind;
  name: unknown;
  rows: readonly T[];
  getName: (item: T) => unknown;
  aliases?: readonly AiWhatsappEntityAlias[];
}) {
  const raw = typeof input.name === "string" ? input.name.trim() : "";
  const normalized = normalizeAiWhatsappEntityText(raw);
  const aliases = input.aliases ?? AI_WHATSAPP_ENTITY_ALIASES;
  const empty = { status: "NOT_FOUND" as const, match: null, candidates: [] as T[] };
  if (!normalized) return empty;

  const exact = input.rows.filter((item) => String(input.getName(item) ?? "").trim() === raw);
  if (exact.length === 1) return { status: "EXACT_MATCH" as const, match: exact[0], candidates: exact };
  if (exact.length > 1) return { status: "AMBIGUOUS" as const, match: null, candidates: exact };

  const normalizedMatches = input.rows.filter(
    (item) => normalizeAiWhatsappEntityText(input.getName(item)) === normalized,
  );
  if (normalizedMatches.length === 1) {
    return { status: "UNIQUE_NORMALIZED_MATCH" as const, match: normalizedMatches[0], candidates: normalizedMatches };
  }
  if (normalizedMatches.length > 1) {
    return { status: "AMBIGUOUS" as const, match: null, candidates: normalizedMatches };
  }

  const aliasMatches = aliases.filter(
    (alias) => alias.entity === input.entity && normalizeAiWhatsappEntityText(alias.alias) === normalized,
  );
  // A duplicate alias is a configuration error and must never pick either target.
  if (aliasMatches.length > 1) {
    return { status: "AMBIGUOUS" as const, match: null, candidates: [] as T[] };
  }
  if (aliasMatches.length === 1) {
    const canonical = normalizeAiWhatsappEntityText(aliasMatches[0].canonicalName);
    const canonicalMatches = input.rows.filter(
      (item) => normalizeAiWhatsappEntityText(input.getName(item)) === canonical,
    );
    if (canonicalMatches.length === 1) {
      return { status: "EXPLICIT_ALIAS_MATCH" as const, match: canonicalMatches[0], candidates: canonicalMatches };
    }
    return { status: canonicalMatches.length > 1 ? "AMBIGUOUS" as const : "NOT_FOUND" as const, match: null, candidates: canonicalMatches };
  }

  const partial = input.rows.filter((item) => {
    const candidate = normalizeAiWhatsappEntityText(input.getName(item));
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
  if (partial.length === 1) return { status: "PARTIAL_MATCH" as const, match: null, candidates: partial };
  if (partial.length > 1) return { status: "AMBIGUOUS" as const, match: null, candidates: partial };
  return empty;
}

export function isAiWhatsappResolvedEntityStatus(status: AiWhatsappEntityResolutionStatus) {
  return status === "EXACT_MATCH" || status === "UNIQUE_NORMALIZED_MATCH" || status === "EXPLICIT_ALIAS_MATCH";
}
