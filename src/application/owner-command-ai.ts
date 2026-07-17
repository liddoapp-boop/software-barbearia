import { z } from "zod";
import {
  AI_WHATSAPP_ENTITY_ALIASES,
  normalizeAiWhatsappEntityText,
} from "./whatsapp-entity-resolution";
import {
  executeResilientProviderRequest,
  ProviderAttemptDiagnostic,
  ResilientProviderError,
} from "./resilient-provider";
import { interpretCommercialCommandDeterministic } from "./commercial-understanding";

export type OwnerCommandContext = {
  unitId: string;
  unitName?: string;
  screenContext?: string;
  now: Date;
  timezone: string;
  services: Array<{
    id?: string;
    name: string;
    category?: string | null;
    price?: number;
    durationMin?: number;
    enabledProfessionalIds?: string[];
  }>;
  products: Array<{ name: string; category?: string | null; salePrice?: number; stockQty?: number }>;
  paymentMethods: Array<{ name: string; isDefault?: boolean }>;
  professionals: Array<{ id?: string; name: string }>;
};

export type OwnerCommandParseInput = {
  message: string;
  context: OwnerCommandContext;
  correlationId?: string;
};

export type OwnerCommandParseResult = {
  ok: true;
  mode: "preview_only";
  intent:
    | "checkout_service"
    | "sell_product"
    | "product_sale"
    | "schedule_appointment"
    | "cancel_appointment"
    | "report_query"
    | "reactivation_analysis"
    | "unknown";
  confidence: number;
  summary: string;
  draft: Record<string, unknown>;
  missingFields: string[];
  warnings: string[];
  allowedNextActions: string[];
  executed: false;
  fallbackReason?: OwnerCommandFallbackReason;
  fieldDiagnostics?: Record<string, OwnerCommandFieldDiagnostic>;
  ambiguities?: Array<{ field: string; reason: string }>;
  clarificationCode?: string;
};

export type OwnerCommandFieldDiagnostic = {
  confidence: number;
  source: "deterministic" | "gemini_validated" | "local_llama_validated" | "context_default" | "conversation_context";
  status: "accepted" | "missing" | "ambiguous" | "rejected";
  reason?: string;
  expression?: string;
  proposedValue?: string;
};

export type OwnerCommandFallbackReason =
  | "gemini_429"
  | "gemini_5xx"
  | "gemini_http_error"
  | "gemini_timeout"
  | "gemini_empty_response"
  | "gemini_invalid_json"
  | "gemini_invalid_schema"
  | "gemini_circuit_open"
  | "gemini_quota_exhausted"
  | "gemini_network_error"
  | "local_llama_http_error"
  | "local_llama_timeout"
  | "local_llama_unavailable"
  | "local_llama_empty_response"
  | "local_llama_invalid_json"
  | "local_llama_invalid_schema"
  | "deterministic_no_match"
  | "deterministic_conflict"
  | "invalid_client_boundary"
  | "missing_required_fields"
  | "grounding_failure"
  | "parser_error";

export class OwnerCommandParserError extends Error {
  constructor(
    readonly reason: OwnerCommandFallbackReason,
    message: string,
    readonly httpStatus?: number,
    readonly attempts: ProviderAttemptDiagnostic[] = [],
  ) {
    super(message);
    this.name = "OwnerCommandParserError";
  }
}

export type OwnerCommandParserStatus =
  | "PARSED_COMPLETE"
  | "PARSED_INCOMPLETE"
  | "AMBIGUOUS"
  | "UNSUPPORTED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export type OwnerCommandParserAttempt = {
  status: OwnerCommandParserStatus;
  result?: OwnerCommandParseResult;
  durationMs: number;
  httpStatus?: number;
  failureCode?: OwnerCommandFallbackReason;
  attempts?: ProviderAttemptDiagnostic[];
  model?: string;
  fallbackUsed?: boolean;
};

export interface OwnerCommandParser {
  readonly modelVersion: string;
  parse(input: OwnerCommandParseInput): Promise<OwnerCommandParseResult>;
  parseGemini(input: OwnerCommandParseInput): Promise<OwnerCommandParserAttempt>;
}

const ownerCommandResponseSchema = z.object({
  ok: z.literal(true).default(true),
  mode: z.literal("preview_only").default("preview_only"),
  intent: z
    .enum([
      "checkout_service",
      "sell_product",
      "product_sale",
      "schedule_appointment",
      "cancel_appointment",
      "report_query",
      "reactivation_analysis",
      "unknown",
    ])
    .default("unknown"),
  confidence: z.number().min(0).max(1).default(0),
  summary: z.string().min(1).max(500),
  draft: z.record(z.string(), z.unknown()).default({}),
  missingFields: z.array(z.string().min(1).max(80)).default([]),
  warnings: z.array(z.string().min(1).max(180)).default([]),
  allowedNextActions: z.array(z.string().min(1).max(80)).default([]),
  executed: z.literal(false).default(false),
});

const legacySemanticScheduleResponseSchema = z.object({
  intent: z.literal("schedule_appointment"),
  clientName: z.string().max(120).default(""),
  serviceNames: z.array(z.string().min(1).max(120)).max(8).default([]),
  professionalName: z.string().max(120).default(""),
  date: z.string().max(10).default(""),
  time: z.string().max(5).default(""),
  confidence: z.number().min(0).max(1).default(0),
  missingFields: z.array(z.enum(["clientName", "serviceNames", "professionalName", "date", "time"])).default([]),
}).strict();

const semanticTextFieldSchema = z.object({
  value: z.string().max(120),
  evidence: z.string().max(180),
  confidence: z.number().min(0).max(1),
}).strict();

const semanticServiceFieldSchema = z.object({
  values: z.array(z.string().min(1).max(120)).max(8),
  evidence: z.string().max(180),
  confidence: z.number().min(0).max(1),
}).strict();

const semanticDateFieldSchema = z.object({
  expression: z.string().max(120),
  canonical: z.string().max(10),
  evidence: z.string().max(180),
  confidence: z.number().min(0).max(1),
}).strict();

const semanticTimeFieldSchema = z.object({
  expression: z.string().max(120),
  canonical: z.string().max(5),
  period: z.enum(["morning", "afternoon", "night", "unspecified"]),
  ambiguous: z.boolean(),
  precision: z.enum(["exact", "approximate", "unspecified"]),
  evidence: z.string().max(180),
  confidence: z.number().min(0).max(1),
}).strict();

const semanticScheduleV2ResponseSchema = z.object({
  schemaVersion: z.literal("1.0"),
  intent: z.enum(["schedule_appointment", "unknown"]),
  intentConfidence: z.number().min(0).max(1),
  fields: z.object({
    clientName: semanticTextFieldSchema,
    serviceNames: semanticServiceFieldSchema,
    professionalName: semanticTextFieldSchema,
    date: semanticDateFieldSchema,
    time: semanticTimeFieldSchema,
  }).strict(),
  ambiguities: z.array(z.object({
    field: z.enum(["intent", "clientName", "serviceNames", "professionalName", "date", "time"]),
    reason: z.string().min(1).max(180),
  }).strict()).max(12),
  missingFields: z.array(z.enum(["clientName", "serviceNames", "professionalName", "date", "time"])).max(5),
}).strict();

const semanticFieldNameSchema = z.enum(["clientName", "serviceNames", "professionalName", "date", "time"]);

export const semanticStructuredOutputSchema = z.object({
  intent: z.enum(["schedule_appointment", "product_sale", "unknown"]),
  clientName: z.string().min(1).max(120).nullable(),
  serviceNames: z.array(z.string().min(1).max(120)).max(8),
  professionalName: z.string().min(1).max(120).nullable(),
  dateExpression: z.string().min(1).max(120).nullable(),
  timeExpression: z.string().min(1).max(120).nullable(),
  canonicalDate: z.string().max(10).nullable(),
  canonicalTime: z.string().max(5).nullable(),
  timePrecision: z.enum(["exact", "approximate", "unspecified"]),
  missingFields: z.array(semanticFieldNameSchema).max(5),
  ambiguousFields: z.array(semanticFieldNameSchema).max(5),
  confidence: z.object({
    intent: z.number().min(0).max(1),
    clientName: z.number().min(0).max(1),
    service: z.number().min(0).max(1),
    professional: z.number().min(0).max(1),
    date: z.number().min(0).max(1),
    time: z.number().min(0).max(1),
  }).strict(),
}).strict();

export const semanticStructuredOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "clientName", "serviceNames", "professionalName", "dateExpression", "timeExpression", "canonicalDate", "canonicalTime", "timePrecision", "missingFields", "ambiguousFields", "confidence"],
  properties: {
    intent: { type: "string", enum: ["schedule_appointment", "product_sale", "unknown"] },
    clientName: { anyOf: [{ type: "string" }, { type: "null" }] },
    serviceNames: { type: "array", maxItems: 8, items: { type: "string" } },
    professionalName: { anyOf: [{ type: "string" }, { type: "null" }] },
    dateExpression: { anyOf: [{ type: "string" }, { type: "null" }] },
    timeExpression: { anyOf: [{ type: "string" }, { type: "null" }] },
    canonicalDate: { anyOf: [{ type: "string" }, { type: "null" }] },
    canonicalTime: { anyOf: [{ type: "string" }, { type: "null" }] },
    timePrecision: { type: "string", enum: ["exact", "approximate", "unspecified"] },
    missingFields: { type: "array", maxItems: 5, items: { type: "string", enum: ["clientName", "serviceNames", "professionalName", "date", "time"] } },
    ambiguousFields: { type: "array", maxItems: 5, items: { type: "string", enum: ["clientName", "serviceNames", "professionalName", "date", "time"] } },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["intent", "clientName", "service", "professional", "date", "time"],
      properties: {
        intent: { type: "number", minimum: 0, maximum: 1 },
        clientName: { type: "number", minimum: 0, maximum: 1 },
        service: { type: "number", minimum: 0, maximum: 1 },
        professional: { type: "number", minimum: 0, maximum: 1 },
        date: { type: "number", minimum: 0, maximum: 1 },
        time: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildSafeContext(context: OwnerCommandContext) {
  return {
    unitName: context.unitName,
    screenContext: context.screenContext || "unknown",
    now: context.now.toISOString(),
    timezone: context.timezone,
    services: context.services.slice(0, 80).map(({ name, category, price, durationMin }) => ({
      name,
      category,
      price,
      durationMin,
    })),
    products: context.products.slice(0, 80),
    paymentMethods: context.paymentMethods.slice(0, 20),
    professionals: context.professionals.slice(0, 40).map(({ name }) => ({ name })),
  };
}

function isSemanticScheduleCandidate(input: OwnerCommandParseInput) {
  const normalized = normalizeMatchText(input.message);
  if (/\b(agend|marc|reserv|encaix|horario|agenda)\w*\b/.test(normalized)) return true;
  if (/\b(faca|faz|coloca|deixa|poe|bota|arruma|organiza|quero|preciso|gostaria|tem como)\b/.test(normalized)
    && Boolean(findServiceName(input.message, input.context) || recognizeDeterministicDate(input.message, input.context.now, input.context.timezone))) {
    return true;
  }
  if (findServiceName(input.message, input.context)
    && recognizeDeterministicDate(input.message, input.context.now, input.context.timezone)
    && recognizeDeterministicTime(input.message)) return true;
  return Boolean(findServiceName(input.message, input.context) && /\b(vai|quer|precisa)\b/.test(normalized));
}

function buildPrompt(input: OwnerCommandParseInput) {
  if (isSemanticScheduleCandidate(input)) {
    return [
      "Voce interpreta pedidos de agendamento em portugues brasileiro falado.",
      "Analise significado, fronteiras de sentenca, pausas, pontuacao e hesitacoes; nao copie spans cegamente.",
      "Retorne exclusivamente o objeto exigido pelo JSON Schema da requisicao.",
      "Nunca execute, confirme, escolha entidade semelhante ou invente cliente, servico, profissional, data ou horario.",
      "Cada campo deve ter confianca propria; use null e confianca 0 quando ausente.",
      "clientName deve conter somente o nome: remova introdutores como cliente/o cliente/para o cliente e hesitacoes nas bordas como e/eh/hum/ahn.",
      "Nao remova palavras internas validas do nome. Nao inclua verbos, expressoes temporais nem fragmentos de outra sentenca.",
      "Normalize datas relativas usando context.now e context.timezone, mantendo a expressao original em dateExpression.",
      "Normalize 5 da tarde como 17:00, 5 da manha como 05:00 e 17 horas da tarde como 17:00.",
      "Expressoes aproximadas devem manter o candidato em canonicalTime, usar timePrecision approximate e listar time em ambiguousFields.",
      "Expressoes exatas como as quatro da tarde devem usar timePrecision exact e canonicalTime 16:00.",
      "Se a fala disser apenas as cinco sem periodo, canonicalTime deve ser null e ambiguousFields deve listar time.",
      "O contexto de catalogo serve para validar nomes mencionados, nunca para completar cliente, servico, data ou horario omitidos.",
      "Se o profissional nao for mencionado, use professionalName null; a politica deterministica decidira se ha um unico profissional.",
      "missingFields deve listar somente campos realmente ausentes; ambiguidades ficam em ambiguousFields.",
      "Use intent unknown quando a mensagem nao pedir uma acao de agendamento.",
      "",
      "Mensagem do owner:",
      input.message,
      "",
      "Contexto minimo permitido:",
      JSON.stringify(buildSafeContext(input.context)),
    ].join("\n");
  }

  return [
    "Voce e o Atendente IA do Dono de uma barbearia.",
    "Sua tarefa e interpretar uma mensagem curta do owner e montar uma previa estruturada.",
    "Voce nunca executa acoes. Sempre retorne executed:false.",
    "Nao crie, cancele, conclua, cobre, venda, altere estoque, lance financeiro, envie WhatsApp, altere senha ou apague dados.",
    "Nao invente IDs, cliente, servico, profissional, data ou horario.",
    "So extraia um valor quando ele estiver explicitamente sustentado pela mensagem. O contexto serve apenas para validar nomes, nunca para completar fatos ausentes.",
    "Reconheca semanticamente a intencao solicitada.",
    "Normalize canonicalDate como YYYY-MM-DD e canonicalTime como HH:mm apenas quando a mensagem informar esses dados.",
    "Interprete datas relativas como hoje, amanha e dias da semana usando context.now e context.timezone.",
    "Preserve o nome do cliente como falado. Nao amplie Joao para Joao Santos e nao escolha nomes semelhantes.",
    "Nao escolha profissional omitido. A validacao deterministica aplicara regras seguras depois.",
    "Para venda de produto, use intent product_sale. Este contrato nao autoriza extrair nem executar a venda; deixe os campos de agendamento ausentes.",
    "Se faltar dado, use null ou lista vazia e liste somente o campo ausente em missingFields.",
    "Se houver ambiguidade, liste o campo em ambiguousFields.",
    "Nunca sugira acao irreversivel sem confirmacao.",
    "Mantenha portugues brasileiro.",
    "Nao inclua segredos, tokens, chaves, senhas, URLs de banco ou logs.",
    "Responda exclusivamente o objeto exigido pelo JSON Schema, sem texto fora do JSON.",
    "",
    "Mensagem do owner:",
    input.message,
    "",
    "Contexto minimo permitido:",
    JSON.stringify(buildSafeContext(input.context)),
  ].join("\n");
}

function normalizeMatchText(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDatePartsInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get("year") ?? 0),
    month: Number(map.get("month") ?? 0),
    day: Number(map.get("day") ?? 0),
  };
}

function formatLocalDate(parts: { year: number; month: number; day: number }) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addLocalDays(parts: { year: number; month: number; day: number }, days: number) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

export type DeterministicDateRecognitionType =
  | "relative"
  | "weekday"
  | "day_of_month"
  | "numeric_slash"
  | "month_name"
  | "fully_spoken"
  | "spoken_numeric_month";

type DeterministicDateRecognition = {
  date: string;
  type: DeterministicDateRecognitionType;
};

const portugueseNumberValues = new Map<string, number>([
  ["zero", 0],
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10],
  ["onze", 11],
  ["doze", 12],
  ["treze", 13],
  ["quatorze", 14],
  ["catorze", 14],
  ["quinze", 15],
  ["dezesseis", 16],
  ["dezasseis", 16],
  ["dezessete", 17],
  ["dezassete", 17],
  ["dezoito", 18],
  ["dezenove", 19],
  ["vinte", 20],
  ["trinta", 30],
  ["quarenta", 40],
  ["cinquenta", 50],
  ["sessenta", 60],
  ["setenta", 70],
  ["oitenta", 80],
  ["noventa", 90],
  ["cem", 100],
  ["cento", 100],
  ["duzentos", 200],
  ["trezentos", 300],
  ["quatrocentos", 400],
  ["quinhentos", 500],
  ["seiscentos", 600],
  ["setecentos", 700],
  ["oitocentos", 800],
  ["novecentos", 900],
]);

const portugueseMonths = new Map<string, number>([
  ["janeiro", 1],
  ["fevereiro", 2],
  ["marco", 3],
  ["abril", 4],
  ["maio", 5],
  ["junho", 6],
  ["julho", 7],
  ["agosto", 8],
  ["setembro", 9],
  ["outubro", 10],
  ["novembro", 11],
  ["dezembro", 12],
]);

const spokenDayPattern = "(?:\\d{1,2}|(?:um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezasseis|dezessete|dezassete|dezoito|dezenove)|vinte(?:\\s+e\\s+(?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?|trinta(?:\\s+e\\s+um)?)";
const spokenMonthPattern = "(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|\\d{1,2})";
const spokenClockNumberPattern = "(?:zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezasseis|dezessete|dezassete|dezoito|dezenove|vinte(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|trinta(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|quarenta(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|cinquenta(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|sessenta(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|setenta(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|oitenta(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|noventa(?:\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?|\\d{1,2})";
const spokenYearPattern = `(?:\\d{2,4}|${spokenClockNumberPattern}\\s+mil(?:\\s+(?:e\\s+)?${spokenClockNumberPattern})?|${spokenClockNumberPattern})`;
const naturalTimeStartPattern = `(?:(?:as|a)\\s+|${spokenClockNumberPattern}\\s+para\\s+as?\\s+|meio\\s+dia\\b|meia\\s+noite\\b|${spokenClockNumberPattern}\\s+(?:horas?\\b|e\\s+(?:meia|${spokenClockNumberPattern})\\b|da\\s+(?:manha|tarde|noite)\\b))`;

function parsePortugueseCardinal(value: string) {
  const normalized = normalizeMatchText(value);
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const tokens = normalized.split(/\s+/).filter((token) => token && token !== "e");
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token === "mil") {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    const number = portugueseNumberValues.get(token);
    if (number === undefined) return null;
    current += number;
  }
  return total + current;
}

function isValidCalendarDate(parts: { year: number; month: number; day: number }) {
  if (parts.year < 1 || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return false;
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  return candidate.getUTCFullYear() === parts.year
    && candidate.getUTCMonth() + 1 === parts.month
    && candidate.getUTCDate() === parts.day;
}

function buildDateRecognition(
  parts: { year: number; month: number; day: number },
  type: DeterministicDateRecognitionType,
): DeterministicDateRecognition | null {
  return isValidCalendarDate(parts) ? { date: formatLocalDate(parts), type } : null;
}

function resolveWeekdayDate(message: string, now: Date, timezone: string) {
  const weekdays = new Map([
    ["domingo", 0],
    ["segunda", 1],
    ["segunda feira", 1],
    ["terca", 2],
    ["terca feira", 2],
    ["quarta", 3],
    ["quarta feira", 3],
    ["quinta", 4],
    ["quinta feira", 4],
    ["sexta", 5],
    ["sexta feira", 5],
    ["sabado", 6],
  ]);
  const normalized = normalizeMatchText(message);
  const target = Array.from(weekdays.entries()).find(([label]) => normalized.includes(label))?.[1];
  if (target === undefined) return "";
  const today = getDatePartsInTimezone(now, timezone);
  const todayDay = new Date(Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0)).getUTCDay();
  const diff = (target - todayDay + 7) % 7 || 7;
  return formatLocalDate(addLocalDays(today, diff));
}

function recognizeDeterministicDate(message: string, now: Date, timezone: string): DeterministicDateRecognition | null {
  const normalized = normalizeMatchText(message);
  const today = getDatePartsInTimezone(now, timezone);
  if (normalized.includes("amanha")) return { date: formatLocalDate(addLocalDays(today, 1)), type: "relative" };
  if (normalized.includes("hoje")) return { date: formatLocalDate(today), type: "relative" };
  const slashDate = message.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]);
    const rawYear = slashDate[3] ? Number(slashDate[3]) : today.year;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return buildDateRecognition({ year, month, day }, "numeric_slash");
  }

  const dayOfMonth = normalized.match(new RegExp(`\\bdia\\s+(${spokenDayPattern})(?=\\s+${naturalTimeStartPattern}|$)`));
  if (dayOfMonth) {
    const day = parsePortugueseCardinal(dayOfMonth[1]);
    if (day !== null) {
      return buildDateRecognition({ year: today.year, month: today.month, day }, "day_of_month");
    }
  }

  const spokenDate = normalized.match(new RegExp(
    `\\b(?:dia\\s+)?(${spokenDayPattern})\\s+(?:de|do)\\s+(${spokenMonthPattern})(?:\\s+(?:de|do)\\s+(${spokenYearPattern}))?(?=\\s+${naturalTimeStartPattern}|$)`,
  ));
  if (spokenDate) {
    const day = parsePortugueseCardinal(spokenDate[1]);
    const month = portugueseMonths.get(spokenDate[2]) ?? parsePortugueseCardinal(spokenDate[2]);
    const parsedYear = spokenDate[3] ? parsePortugueseCardinal(spokenDate[3]) : today.year;
    const year = parsedYear !== null && parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    if (day !== null && month !== null && year !== null) {
      const dayIsSpoken = !/^\d+$/.test(spokenDate[1]);
      const monthIsSpokenName = portugueseMonths.has(spokenDate[2]);
      const yearIsSpoken = Boolean(spokenDate[3] && !/^\d+$/.test(spokenDate[3]));
      const type: DeterministicDateRecognitionType = !monthIsSpokenName
        ? "spoken_numeric_month"
        : dayIsSpoken || yearIsSpoken
          ? "fully_spoken"
          : "month_name";
      return buildDateRecognition({ year, month, day }, type);
    }
  }

  const weekdayDate = resolveWeekdayDate(message, now, timezone);
  return weekdayDate ? { date: weekdayDate, type: "weekday" } : null;
}

function parseDeterministicDate(message: string, now: Date, timezone: string) {
  return recognizeDeterministicDate(message, now, timezone)?.date ?? "";
}

export function getDeterministicDateRecognitionType(message: string, now: Date, timezone: string) {
  return recognizeDeterministicDate(message, now, timezone)?.type;
}

export function recognizeOwnerCommandDate(message: string, now: Date, timezone: string) {
  return recognizeDeterministicDate(message, now, timezone);
}

type DeterministicTimeRecognition = {
  time: string;
  ambiguous?: boolean;
  candidateTime?: string;
  invalid?: boolean;
};

function buildTimeRecognition(hour: number | null, minute: number | null): DeterministicTimeRecognition {
  if (hour === null || minute === null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { time: "", invalid: true };
  }
  return { time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

function resolveHourForPeriod(hour: number | null, period?: string) {
  if (hour === null || hour < 0 || hour > 23) return null;
  if (!period) return hour;
  if (hour > 12) return hour;
  if (period === "manha") return hour === 12 ? 0 : hour;
  if (period === "tarde") return hour === 12 ? 12 : hour + 12;
  if (period === "noite") return hour === 12 ? 0 : hour + 12;
  return null;
}

function parseSpokenMinute(value?: string) {
  if (!value) return 0;
  return value === "meia" ? 30 : parsePortugueseCardinal(value);
}

function recognizeDeterministicTime(message: string): DeterministicTimeRecognition | null {
  const accentless = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalized = normalizeMatchText(message);

  const numericClock = accentless.match(/\b(?:as?\s*)?(\d{1,2})\s*(?::|h)\s*(\d{1,2})(?:\s+da\s+(manha|tarde|noite))?\b/i);
  if (numericClock) {
    return buildTimeRecognition(resolveHourForPeriod(Number(numericClock[1]), numericClock[3]), Number(numericClock[2]));
  }
  const numericHour = accentless.match(/\b(?:as|a)\s+(\d{1,2})(?:\s*h(?:oras?)?)?(?:\s+da\s+(manha|tarde|noite))?\b/i);
  if (numericHour) {
    const rawHour = Number(numericHour[1]);
    if (!numericHour[2] && rawHour >= 1 && rawHour <= 6) {
      return { time: "", ambiguous: true, candidateTime: `${String(rawHour).padStart(2, "0")}:00` };
    }
    return buildTimeRecognition(resolveHourForPeriod(rawHour, numericHour[2]), 0);
  }

  if (/\bmeio\s+dia\b/.test(normalized)) return { time: "12:00" };
  if (/\bmeia\s+noite\b/.test(normalized)) return { time: "00:00" };

  const subtractive = normalized.match(new RegExp(
    `\\b(${spokenClockNumberPattern})\\s+para\\s+as?\\s+(${spokenClockNumberPattern})(?:\\s+da\\s+(manha|tarde|noite))?\\b`,
  ));
  if (subtractive) {
    const minute = parsePortugueseCardinal(subtractive[1]);
    const rawTargetHour = parsePortugueseCardinal(subtractive[2]);
    if (minute === null || minute <= 0 || minute > 59 || rawTargetHour === null || rawTargetHour < 0 || rawTargetHour > 23) {
      return { time: "", invalid: true };
    }
    if (!subtractive[3] && rawTargetHour >= 1 && rawTargetHour <= 6) {
      return { time: "", ambiguous: true, candidateTime: `${String(rawTargetHour).padStart(2, "0")}:00` };
    }
    const targetHour = resolveHourForPeriod(rawTargetHour, subtractive[3]);
    if (targetHour === null) return { time: "", invalid: true };
    const minutesFromMidnight = (targetHour * 60 - minute + 24 * 60) % (24 * 60);
    return buildTimeRecognition(Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60);
  }

  const explicit = normalized.match(new RegExp(
    `\\b(?:as|a)\\s+(${spokenClockNumberPattern})(?:\\s+horas?)?(?:\\s+e\\s+(meia|${spokenClockNumberPattern}))?(?:\\s+da\\s+(manha|tarde|noite))?\\b`,
  ));
  if (explicit) {
    const rawHour = parsePortugueseCardinal(explicit[1]);
    if (!explicit[3] && rawHour !== null && rawHour >= 1 && rawHour <= 6) {
      return { time: "", ambiguous: true, candidateTime: `${String(rawHour).padStart(2, "0")}:00` };
    }
    const hour = resolveHourForPeriod(rawHour, explicit[3]);
    return buildTimeRecognition(hour, parseSpokenMinute(explicit[2]));
  }

  const withHours = normalized.match(new RegExp(
    `\\b(${spokenClockNumberPattern})\\s+horas?(?:\\s+e\\s+(meia|${spokenClockNumberPattern}))?(?:\\s+da\\s+(manha|tarde|noite))?\\b`,
  ));
  if (withHours) {
    const hour = resolveHourForPeriod(parsePortugueseCardinal(withHours[1]), withHours[3]);
    return buildTimeRecognition(hour, parseSpokenMinute(withHours[2]));
  }

  const withPeriod = normalized.match(new RegExp(
    `\\b(${spokenClockNumberPattern})\\s+da\\s+(manha|tarde|noite)\\b`,
  ));
  if (withPeriod) {
    return buildTimeRecognition(resolveHourForPeriod(parsePortugueseCardinal(withPeriod[1]), withPeriod[2]), 0);
  }

  const informalMatches = Array.from(normalized.matchAll(new RegExp(
    `\\b(${spokenClockNumberPattern})\\s+e\\s+(meia|${spokenClockNumberPattern})\\b`,
    "g",
  )));
  for (const informal of informalMatches.reverse()) {
    const hour = parsePortugueseCardinal(informal[1]);
    if (hour !== null && hour >= 0 && hour <= 12) {
      return buildTimeRecognition(hour, parseSpokenMinute(informal[2]));
    }
  }
  return null;
}

export function recognizeOwnerCommandTime(message: string) {
  return recognizeDeterministicTime(message);
}

function findServiceName(message: string, context: OwnerCommandContext) {
  const normalized = ` ${normalizeMatchText(message)} `;
  const fullMatch = context.services
    .map((service) => service.name)
    .filter(Boolean)
    .sort((a, b) => normalizeMatchText(b).length - normalizeMatchText(a).length)
    .find((name) => normalized.includes(` ${normalizeMatchText(name)} `));
  if (fullMatch) return fullMatch;

  const wordMatches = context.services
    .flatMap((service) => {
      const candidates = [service.name, service.category]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .flatMap((item) => normalizeMatchText(item).split(" "))
        .filter((item) => item.length >= 4);
      return Array.from(new Set(candidates)).map((word) => ({ word, serviceName: service.name }));
    })
    .filter((candidate) => normalized.includes(` ${candidate.word} `));
  const uniqueWords = Array.from(new Set(wordMatches.map((candidate) => candidate.word)));
  const uniqueServices = Array.from(new Set(wordMatches.map((candidate) => candidate.serviceName)));
  if (uniqueWords.length === 1 && uniqueServices.length === 1) {
    const word = uniqueWords[0];
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  const messageRoots = new Set(
    normalizeMatchText(message)
      .split(" ")
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 4)),
  );
  const rootedServices = context.services.filter((service) =>
    [service.name, service.category]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => normalizeMatchText(value).split(" "))
      .filter((word) => word.length >= 4)
      .some((word) => messageRoots.has(word.slice(0, 4))),
  );
  if (rootedServices.length === 1) return rootedServices[0].name;
  return undefined;
}

function findProductName(message: string, context: OwnerCommandContext) {
  const normalized = ` ${normalizeMatchText(message)} `;
  const fullMatch = context.products
    .map((product) => product.name)
    .filter(Boolean)
    .sort((a, b) => normalizeMatchText(b).length - normalizeMatchText(a).length)
    .find((name) => normalized.includes(` ${normalizeMatchText(name)} `));
  if (fullMatch) return fullMatch;

  const wordMatches = context.products
    .flatMap((product) => {
      const candidates = [product.name, product.category]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .flatMap((item) => normalizeMatchText(item).split(" "))
        .filter((item) => item.length >= 4);
      return Array.from(new Set(candidates)).map((word) => ({ word, productName: product.name }));
    })
    .filter((candidate) => normalized.includes(` ${candidate.word} `));
  const uniqueWords = Array.from(new Set(wordMatches.map((candidate) => candidate.word)));
  const uniqueProducts = Array.from(new Set(wordMatches.map((candidate) => candidate.productName)));
  if (uniqueWords.length === 1 && uniqueProducts.length === 1) {
    const word = uniqueWords[0];
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return undefined;
}

function findPaymentMethodName(message: string, context: OwnerCommandContext) {
  const normalized = ` ${normalizeMatchText(message)} `;
  const exact = context.paymentMethods
    .map((method) => method.name)
    .filter(Boolean)
    .sort((a, b) => normalizeMatchText(b).length - normalizeMatchText(a).length)
    .find((name) => normalized.includes(` ${normalizeMatchText(name)} `));
  if (exact) return exact;
  const aliases = AI_WHATSAPP_ENTITY_ALIASES.filter(
    (alias) => alias.entity === "payment" && normalized.includes(` ${normalizeAiWhatsappEntityText(alias.alias)} `),
  );
  if (aliases.length !== 1) return undefined;
  const target = normalizeAiWhatsappEntityText(aliases[0].canonicalName);
  const matchingMethods = context.paymentMethods.filter(
    (method) => normalizeAiWhatsappEntityText(method.name) === target,
  );
  return matchingMethods.length === 1 ? matchingMethods[0].name : undefined;
}

function parseProductQuantity(message: string) {
  const normalized = normalizeMatchText(message);
  const numberMatch = normalized.match(/\b(\d{1,2})\b/);
  if (numberMatch) return Number(numberMatch[1]);
  if (/\b(um|uma)\b/.test(normalized)) return 1;
  if (/\b(dois|duas)\b/.test(normalized)) return 2;
  if (/\btres\b/.test(normalized)) return 3;
  return 1;
}

function parseQuotedUnitPrice(message: string) {
  const priceMatch = message.match(/\bpor\s+R?\$?\s*(\d+(?:[,.]\d{1,2})?)\b/i);
  if (!priceMatch) return undefined;
  const parsed = Number(priceMatch[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractProductSaleClientName(message: string) {
  const match = message.match(/\b(?:para|pra|pro)\s+(.+?)(?=[,.;]|$)/i);
  return match?.[1] ? delimitOperationEntity(match[1]) : "";
}

function extractProductNameFromSaleMessage(message: string) {
  const match = message.match(
    /\b(?:vendi|vendeu|venda|vender|registrar\s+(?:uma\s+)?venda(?:\s+de)?)\s+(?:(?:um|uma|uns|umas|\d+)\s+)?(.+?)\s+(?:para|pra|pro)\b/i,
  );
  if (!match?.[1]) return "";
  const productName = cleanClientName(match[1]);
  return productName ? productName.charAt(0).toUpperCase() + productName.slice(1) : "";
}

function cleanClientName(value: string) {
  return value
    .replace(/[.,;:!?]+$/g, "")
    .replace(/^(?:o|a)\s+cliente\s+/i, "")
    .replace(/^(?:o|a|um|uma)\s+/i, "")
    .trim();
}

function cleanScheduleClientName(value: string) {
  return cleanClientName(value)
    .replace(/(?:\s*,\s*|\s+)(?:é|e|eh|hum|ahn)\s*$/i, "")
    .replace(/[\s,]+$/g, "")
    .trim();
}

function recoverAsrClientLabel(value: string) {
  // O ASR pode introduzir artigo e uma pausa artificial dentro de um nome
  // iniciado por "Cliente" (ex.: "o cliente teste, confirmacao"). Limitamos
  // a recuperacao a esse formato estreito; virgulas em frases gerais continuam
  // sendo rejeitadas pela barreira canonica.
  const match = value.trim().match(
    /^(?:o|a)\s+(cliente)\s+([\p{L}'-]+(?:\s+[\p{L}'-]+)*)\s*,\s*([\p{L}'-]+)$/iu,
  );
  if (!match) return "";
  const connectors = new Set(["da", "das", "de", "do", "dos", "e"]);
  const suffix = `${match[2]} ${match[3]}`
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => connectors.has(normalizeMatchText(part))
      ? part.toLocaleLowerCase("pt-BR")
      : `${part.charAt(0).toLocaleUpperCase("pt-BR")}${part.slice(1).toLocaleLowerCase("pt-BR")}`)
    .join(" ");
  return `Cliente ${suffix}`;
}

const operationEntityBoundary = /\s+(?:(?:e\s+|a[ií]\s+)?(?:ele|ela)\s+pagou\b|(?:e\s+|a[ií]\s+)?pagou\s+(?:no|na|em)\b|(?:e\s+|a[ií]\s+)?foi\s+(?:no|na|em)\b|pagamento\s+(?:no|na|em)\b|com\s+pagamento\b|recebi\s+em\b|e\s+marcou\b|para\s+amanh[ãa]\b|com\s+o\s+profissional\b)/i;

export function getOwnerCommandBoundaryObservation(message: string) {
  const candidate = message.match(/\b(?:para|pra|pro)\s+(.+?)(?=[,.;]|$)/i)?.[1] ?? "";
  return {
    result: candidate && operationEntityBoundary.test(candidate) ? "BOUNDARY_MATCHED" : "BOUNDARY_NOT_MATCHED",
  };
}

function delimitOperationEntity(value: string, cleaner = cleanClientName) {
  const match = operationEntityBoundary.exec(value);
  return cleaner(match ? value.slice(0, match.index) : value);
}

// These forms are only consumed at the command boundary. In particular, "Marco"
// is never rewritten globally, so it remains a valid client after "para".
const deterministicScheduleActionPattern = "(?:agenda|agendo|agende|agendar|marca|marco|marque|marcar|coloca|coloco|coloque|colocar|p(?:õe|oe)|ponho|ponha|bota|boto|bote|botar)";

function hasServiceRoot(value: string, serviceName: string) {
  const serviceRoots = normalizeMatchText(serviceName)
    .split(" ")
    .filter((word) => word.length >= 4)
    .map((word) => word.slice(0, 4));
  const valueRoots = new Set(
    normalizeMatchText(value)
      .split(" ")
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 4)),
  );
  return serviceRoots.some((root) => valueRoots.has(root));
}

function extractClientName(message: string, serviceName?: string) {
  const spokenClockBoundaryPattern = spokenClockNumberPattern.replace(/tres/g, "tr[eê]s");
  const dateMarker = `(?:amanh[ãa]|hoje|na\\s+[a-zA-ZçÇãÃáÁàÀâÂéÉêÊíÍóÓôÔõÕúÚ]+|no\\s+[a-zA-ZçÇãÃáÁàÀâÂéÉêÊíÍóÓôÔõÕúÚ]+|dia\\s+\\d{1,2}(?:\\/\\d{1,2})?|dia\\s+${spokenDayPattern}|(?:dia\\s+)?${spokenDayPattern}\\s+(?:de|do)\\s+${spokenMonthPattern}|[àa]s\\s*(?:\\d{1,2}|${spokenClockBoundaryPattern}))`;
  const fieldBoundary = `(?:${dateMarker}|(?:data\\s*)?\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|hor[áa]rio\\b|com\\b)`;
  const cleanCandidate = (value: string) => {
    const beforeNextField = value.split(new RegExp(`\\s+(?=${fieldBoundary})`, "i"))[0] ?? "";
    const candidate = recoverAsrClientLabel(beforeNextField)
      || delimitOperationEntity(beforeNextField, cleanScheduleClientName);
    const normalizedCandidate = normalizeMatchText(candidate);
    if (!normalizedCandidate
      || (serviceName && (normalizedCandidate === normalizeMatchText(serviceName) || hasServiceRoot(candidate, serviceName)))) {
      return "";
    }
    return candidate;
  };

  if (serviceName) {
    const servicePattern = escapeRegex(serviceName);
    const clientBeforeService = new RegExp(`^${deterministicScheduleActionPattern}\\s+(.+?)\\s+(?:para|pra|pro)\\s+${servicePattern}\\b`, "i");
    const clientBeforeServiceMatch = message.match(clientBeforeService);
    if (clientBeforeServiceMatch?.[1]) return cleanCandidate(clientBeforeServiceMatch[1]);

    const naturalClientBeforeService = new RegExp(
      `^${deterministicScheduleActionPattern}\\s+(.+?)\\s+(?:para|pra|pro)\\s+(.+)$`,
      "i",
    );
    const naturalClientBeforeServiceMatch = message.match(naturalClientBeforeService);
    if (naturalClientBeforeServiceMatch?.[1]
      && naturalClientBeforeServiceMatch[2]
      && hasServiceRoot(naturalClientBeforeServiceMatch[2], serviceName)) {
      return cleanCandidate(naturalClientBeforeServiceMatch[1]);
    }

    const serviceBeforeClient = new RegExp(`\\b${servicePattern}\\b\\s+(?:para|pra|pro)\\s+(.+)$`, "i");
    const serviceBeforeMatch = message.match(serviceBeforeClient);
    if (serviceBeforeMatch?.[1]) {
      const candidate = cleanCandidate(serviceBeforeMatch[1]);
      if (candidate) return candidate;
    }

    const serviceThenClient = new RegExp(`\\b${servicePattern}\\b[\\s\\S]*\\s(?:para|pra|pro)\\s+(.+)$`, "i");
    const serviceThenClientMatch = message.match(serviceThenClient);
    if (serviceThenClientMatch?.[1]) {
      const candidate = cleanCandidate(serviceThenClientMatch[1]);
      if (candidate) return candidate;
    }

    const clientAfterTemporalField = new RegExp(`\\b${servicePattern}\\b[\\s\\S]*?(?:${dateMarker})\\s+(?:para|pra|pro)\\s+(.+)$`, "i");
    const clientAfterTemporalFieldMatch = message.match(clientAfterTemporalField);
    if (clientAfterTemporalFieldMatch?.[1]) return cleanCandidate(clientAfterTemporalFieldMatch[1]);
  }

  const directClientAfterAction = new RegExp(`^${deterministicScheduleActionPattern}\\s+(?:para|pra|pro)\\s+(.+)$`, "i");
  const directClientAfterActionMatch = message.match(directClientAfterAction);
  if (directClientAfterActionMatch?.[1]) return cleanCandidate(directClientAfterActionMatch[1]);

  const clientBeforeField = new RegExp(`^${deterministicScheduleActionPattern}\\s+(.+?)\\s+(?=${fieldBoundary})`, "i");
  const clientBeforeFieldMatch = message.match(clientBeforeField);
  if (clientBeforeFieldMatch?.[1]) return cleanCandidate(clientBeforeFieldMatch[1]);
  return "";
}

const scheduleIntentCues = [
  "agendar",
  "agende",
  "agenda",
  "agendo",
  "marcar",
  "marque",
  "marca",
  "marco",
  "reservar",
  "reserve",
  "reserva",
  "coloca",
  "coloco",
  "coloque",
  "colocar",
  "coloca na agenda",
  "colocar na agenda",
  "poe",
  "ponho",
  "ponha",
  "bota",
  "boto",
  "bote",
  "botar",
  "deixa marcado",
  "deixar marcado",
  "encaixar",
  "encaixa",
  "tem horario para",
  "tem como encaixar",
  "quero um horario para",
  "quero marcar um horario",
] as const;

function hasBroadScheduleIntent(input: OwnerCommandParseInput) {
  const message = normalizeMatchText(input.message).trim();
  const normalized = ` ${message} `;
  if (/^agenda\s+(?:do|da|dos|das)\b/.test(message)) return false;
  if (/\b(?:venda|vendi|vender|produto|pagamento|pagou|pix|dinheiro|cartao|preco|valor)\b/.test(message)) return false;
  if (scheduleIntentCues.some((cue) => {
    if (cue.includes(" ")) return normalized.includes(` ${cue} `);
    if (message === cue || message.startsWith(`${cue} `)) return true;
    return new RegExp(`\\b(?:pode|consegue|quero|preciso|favor)\\s+(?:me\\s+)?${cue}\\b`).test(message);
  })) return true;
  const serviceName = findServiceName(input.message, input.context);
  const hasTemporalReference = Boolean(
    recognizeDeterministicDate(input.message, input.context.now, input.context.timezone || "America/Sao_Paulo")
    || recognizeDeterministicTime(input.message),
  );
  const hasClientMarker = /\b(?:para|pra|pro)\s+(?:(?:o|a)\s+)?[\p{L}][\p{L}\s'-]+/iu.test(input.message);
  if (serviceName && hasTemporalReference && hasClientMarker) return true;
  return Boolean(serviceName && /\b(vai|quer|precisa)\b/.test(normalized));
}

function deterministicScheduleParse(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  if (!hasBroadScheduleIntent(input)) return null;

  const serviceName = findServiceName(input.message, input.context);
  const clientName = extractClientName(input.message, serviceName);
  const date = parseDeterministicDate(input.message, input.context.now, input.context.timezone || "America/Sao_Paulo");
  const timeRecognition = recognizeDeterministicTime(input.message);
  const time = timeRecognition?.time ?? "";
  const matchingServices = serviceName
    ? input.context.services.filter((item) =>
        normalizeMatchText(item.name) === normalizeMatchText(serviceName) || hasServiceRoot(item.name, serviceName))
    : [];
  const service = matchingServices.length === 1 ? matchingServices[0] : undefined;
  const configuredProfessionalIds = service?.enabledProfessionalIds;
  const eligibleProfessionals = serviceName
    ? Array.isArray(configuredProfessionalIds) && configuredProfessionalIds.length
      ? input.context.professionals.filter((professional) => professional.id && configuredProfessionalIds.includes(professional.id))
      : input.context.professionals
    : [];
  const professionalName = serviceName && eligibleProfessionals.length === 1
    ? eligibleProfessionals[0]?.name
    : undefined;
  const professionalReason = !serviceName
    ? undefined
    : eligibleProfessionals.length === 0
      ? "no_eligible_professional"
      : eligibleProfessionals.length > 1
        ? "multiple_eligible_professionals"
        : undefined;
  const missingFields = [
    clientName ? "" : "clientName",
    serviceName ? "" : "serviceNames",
    serviceName && !professionalName ? "professionalName" : "",
    date ? "" : "date",
    time ? "" : "time",
  ].filter(Boolean);

  if (!serviceName && !clientName && !date && !time) return null;

  return {
    ok: true,
    mode: "preview_only",
    intent: "schedule_appointment",
    confidence: missingFields.length ? 0.62 : 0.82,
    summary: missingFields.length
      ? "Previa de agendamento incompleta. Revise os campos faltantes."
      : `Agendamento de ${serviceName} para ${clientName} em ${date} as ${time}.`,
    draft: {
      clientName,
      serviceNames: serviceName ? [serviceName] : [],
      professionalName,
      date,
      time,
    },
    missingFields,
    warnings: timeRecognition?.ambiguous
      ? ["Horario ambiguo: informe se e de manha, de tarde ou de noite."]
      : timeRecognition?.invalid
        ? ["Horario invalido: informe uma hora entre 0 e 23 e minutos entre 0 e 59."]
        : missingFields.length
          ? ["Comando incompleto para criar agendamento."]
          : [],
    allowedNextActions: [],
    executed: false,
    fieldDiagnostics: {
      clientName: { confidence: clientName ? 0.98 : 0, source: "deterministic", status: clientName ? "accepted" : "missing" },
      serviceNames: { confidence: serviceName ? 0.98 : 0, source: "deterministic", status: serviceName ? "accepted" : "missing" },
      professionalName: {
        confidence: professionalName ? 1 : 0,
        source: "context_default",
        status: professionalName ? "accepted" : "missing",
        reason: professionalReason,
      },
      date: { confidence: date ? 0.99 : 0, source: "deterministic", status: date ? "accepted" : "missing" },
      time: {
        confidence: time ? 0.99 : timeRecognition?.ambiguous ? 0.5 : 0,
        source: "deterministic",
        status: time ? "accepted" : timeRecognition?.ambiguous ? "ambiguous" : "missing",
        reason: timeRecognition?.ambiguous ? "period_not_specified" : timeRecognition?.invalid ? "invalid_time" : undefined,
        proposedValue: timeRecognition?.ambiguous ? timeRecognition.candidateTime : undefined,
      },
    },
    ambiguities: timeRecognition?.ambiguous ? [{ field: "time", reason: "period_not_specified" }] : [],
  };
}

function legacyDeterministicProductSaleParse(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  const normalized = normalizeMatchText(input.message);
  const hasSaleVerb = /\b(vendi|vendeu|venda|vender|registrar venda)\b/.test(normalized);
  if (!hasSaleVerb) return null;

  const productName = findProductName(input.message, input.context) || extractProductNameFromSaleMessage(input.message);
  const clientName = extractProductSaleClientName(input.message) || null;
  const paymentMethod = findPaymentMethodName(input.message, input.context);
  const quantity = parseProductQuantity(input.message);
  const quotedUnitPrice = parseQuotedUnitPrice(input.message);
  const missingFields = [
    productName ? "" : "productName",
    Number.isInteger(quantity) && quantity > 0 ? "" : "quantity",
    paymentMethod ? "" : "paymentMethod",
  ].filter(Boolean);

  if (!productName && !clientName && !paymentMethod) return null;

  return {
    ok: true,
    mode: "preview_only",
    intent: "sell_product",
    confidence: missingFields.length ? 0.62 : 0.84,
    summary: missingFields.length
      ? "Previa de venda de produto incompleta. Revise os campos faltantes."
      : clientName
        ? `Venda de ${quantity} ${productName} para ${clientName} com pagamento ${paymentMethod}.`
        : `Venda avulsa de ${quantity} ${productName} com pagamento ${paymentMethod}.`,
    draft: {
      clientName,
      productName,
      quantity,
      paymentMethod,
      ...(quotedUnitPrice !== undefined ? { quotedUnitPrice } : {}),
    },
    missingFields,
    warnings: missingFields.length ? ["Comando incompleto para registrar venda de produto."] : [],
    allowedNextActions: [],
    executed: false,
  };
}

function deterministicProductSaleParse(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  const legacy = legacyDeterministicProductSaleParse(input);
  const understanding = interpretCommercialCommandDeterministic({
    message: input.message,
    products: input.context.products,
  });
  if (understanding.kind === "RESOLVED" && understanding.command.intent === "PRODUCT_SALE") {
    const item = understanding.command.items[0];
    return {
      ok: true,
      mode: "preview_only",
      intent: "sell_product",
      confidence: 1,
      summary: `Venda de ${item.quantity} ${item.productReference}.`,
      draft: {
        clientName: legacy?.draft.clientName ?? null,
        productName: item.productReference,
        quantity: item.quantity,
        paymentMethod: legacy?.draft.paymentMethod,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        quotedUnitPrice: item.unitPrice,
      },
      missingFields: [],
      warnings: [],
      allowedNextActions: [],
      executed: false,
      fieldDiagnostics: {
        productName: { confidence: 1, source: "deterministic", status: "accepted" },
        quantity: { confidence: 1, source: "deterministic", status: "accepted" },
        quotedUnitPrice: { confidence: 1, source: "deterministic", status: "accepted" },
      },
    };
  }
  if (understanding.kind === "NEEDS_CLARIFICATION" && understanding.intent === "PRODUCT_SALE") {
    if (
      (understanding.questionCode === "PRODUCT_ENTITY_AMBIGUOUS" || understanding.questionCode === "PRODUCT_ENTITY_NOT_FOUND")
      && typeof legacy?.draft.productName === "string"
      && legacy.draft.productName.trim()
    ) {
      return legacy;
    }
    const known = understanding.knownFields;
    const productName = typeof known.productReference === "string" ? known.productReference : "";
    const quantity = typeof known.quantity === "number" ? known.quantity : 0;
    const unitPrice = typeof known.unitPrice === "number" ? known.unitPrice : undefined;
    const missingFields = [
      ...understanding.missingFields.map((field) => field === "productReference" ? "productName" : field),
      ...understanding.ambiguousFields.map((field) => field === "productReference" ? "productName" : field),
    ];
    return {
      ok: true,
      mode: "preview_only",
      intent: "sell_product",
      confidence: 0.7,
      summary: "Venda de produto requer esclarecimento específico.",
      draft: {
        clientName: legacy?.draft.clientName ?? null,
        productName,
        quantity,
        paymentMethod: legacy?.draft.paymentMethod,
        ...(unitPrice === undefined ? {} : { quotedUnitPrice: unitPrice }),
      },
      missingFields: Array.from(new Set(missingFields)),
      warnings: [],
      allowedNextActions: [],
      executed: false,
      ambiguities: understanding.ambiguousFields.map((field) => ({ field, reason: understanding.questionCode })),
      clarificationCode: understanding.questionCode,
    };
  }
  return legacy;
}

export function parseDeterministicOwnerCommand(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  return deterministicProductSaleParse(input) ?? deterministicScheduleParse(input);
}

export function parseCanonicalDeterministicOwnerCommand(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  const parsed = parseDeterministicOwnerCommand(input);
  if (!parsed || parsed.intent !== "schedule_appointment") return parsed;
  const trimmed = input.message.trim();
  const hasCanonicalPrefix = /^agendar\b/i.test(trimmed);
  const hasSafeNaturalPrefix = new RegExp(`^${deterministicScheduleActionPattern}(?:\\s|$)`, "i").test(trimmed);
  const hasInternalSentenceBoundary = /[.!?]\s+\S/.test(trimmed);
  const hasSpeechDisfluency = /(?:^|[,;:]|\s)(?:é|eh|hum|ahn)(?:[,;:]|\s|$)/i.test(trimmed);
  const normalized = normalizeMatchText(trimmed);
  const hasApproximateTime = /\b(?:umas|uns|aproximadamente|mais ou menos|por volta)\b/.test(normalized);
  const hasSubtractiveTime = new RegExp(`\\b${spokenClockNumberPattern}\\s+para\\s+as?\\s+${spokenClockNumberPattern}\\b`).test(normalized);
  const hasExplicitProfessionalClause = /\bcom\s+(?:o\s+|a\s+)?(?:profissional\s+)?\S+/i.test(trimmed);
  const clientName = typeof parsed.draft.clientName === "string" ? parsed.draft.clientName : "";
  const clientReason = getOwnerCommandClientNameRejectionReason(clientName);
  if ((!hasCanonicalPrefix && !hasSafeNaturalPrefix) || hasInternalSentenceBoundary || hasSpeechDisfluency
    || hasApproximateTime || hasSubtractiveTime || (!hasCanonicalPrefix && hasExplicitProfessionalClause)
    || (clientReason && clientReason !== "contains_introducer" && clientReason !== "missing")) {
    return null;
  }
  return parsed;
}

function isGroundedPhrase(message: string, value: unknown) {
  const phrase = normalizeMatchText(value);
  if (!phrase) return false;
  return ` ${normalizeMatchText(message)} `.includes(` ${phrase} `);
}

function isGroundedEvidence(message: string, evidence: string) {
  const normalizedEvidence = normalizeMatchText(evidence);
  return Boolean(normalizedEvidence) && ` ${normalizeMatchText(message)} `.includes(` ${normalizedEvidence} `);
}

export function getOwnerCommandClientNameRejectionReason(value: string) {
  const normalized = normalizeMatchText(value);
  if (!normalized) return "missing";
  if (/^(?:para\s+)?(?:o\s+|a\s+)?cliente\b/.test(normalized)) return "contains_introducer";
  if (/\bou\b/.test(normalized)) return "contains_alternative";
  if (/^(?:e|eh|hum|ahn)\b|\b(?:e|eh|hum|ahn)$/.test(normalized)) return "hesitation_at_boundary";
  if (/\b(?:agendar|agenda|agende|marcar|marca|marque|reservar|reserva|reserve|encaixar|encaixa|faca|faz|quero|preciso|vai|cortar)\b/.test(normalized)) {
    return "contains_action_verb";
  }
  if (/\b(?:hoje|amanha|ontem|dia|hora|horas|horario|manha|tarde|noite|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(normalized)) {
    return "contains_temporal_fragment";
  }
  if (/[.!?;:]/.test(value) || /,/.test(value)) return "contains_sentence_fragment";
  return "";
}

function isValidIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
}

function canonicalCatalogService(input: OwnerCommandParseInput, value: string) {
  const normalized = normalizeAiWhatsappEntityText(value);
  const direct = input.context.services.find((service) =>
    normalizeAiWhatsappEntityText(service.name) === normalized
    || normalizeAiWhatsappEntityText(service.category) === normalized
  );
  if (direct) return direct.name;
  const alias = AI_WHATSAPP_ENTITY_ALIASES.find(
    (candidate) => candidate.entity === "service" && normalizeAiWhatsappEntityText(candidate.alias) === normalized,
  );
  if (!alias) return "";
  return input.context.services.find(
    (service) => normalizeAiWhatsappEntityText(service.name) === normalizeAiWhatsappEntityText(alias.canonicalName),
  )?.name ?? "";
}

function validateSemanticTimePeriod(canonical: string, evidence: string) {
  const hour = Number(canonical.slice(0, 2));
  const normalized = normalizeMatchText(evidence);
  if (/\b(?:da|de)\s+tarde\b/.test(normalized) && hour < 12) return "afternoon_period_lost";
  if (/\b(?:da|de)\s+noite\b/.test(normalized) && hour > 0 && hour < 12) return "night_period_lost";
  if (/\b(?:da|de)\s+manha\b/.test(normalized) && hour >= 12) return "morning_period_lost";
  return "";
}

function sanitizeSemanticScheduleV2(
  input: OwnerCommandParseInput,
  parsed: z.infer<typeof semanticScheduleV2ResponseSchema>,
): OwnerCommandParseResult {
  if (parsed.intent !== "schedule_appointment" || parsed.intentConfidence < 0.7) {
    return {
      ok: true,
      mode: "preview_only",
      intent: "unknown",
      confidence: parsed.intentConfidence,
      summary: "Mensagem sem uma acao de agendamento identificada com seguranca.",
      draft: {},
      missingFields: [],
      warnings: [],
      allowedNextActions: [],
      executed: false,
      ambiguities: parsed.ambiguities,
    };
  }

  const diagnostics: Record<string, OwnerCommandFieldDiagnostic> = {};
  const ambiguities = [...parsed.ambiguities];
  const warnings: string[] = [];

  const clientField = parsed.fields.clientName;
  let clientName = "";
  const clientReason = getOwnerCommandClientNameRejectionReason(clientField.value);
  if (!clientField.value) {
    diagnostics.clientName = { confidence: 0, source: "gemini_validated", status: "missing" };
  } else if (clientField.confidence < 0.8) {
    diagnostics.clientName = { confidence: clientField.confidence, source: "gemini_validated", status: "rejected", reason: "low_confidence" };
  } else if (!isGroundedEvidence(input.message, clientField.evidence) || !isGroundedPhrase(input.message, clientField.value)) {
    diagnostics.clientName = { confidence: clientField.confidence, source: "gemini_validated", status: "rejected", reason: "not_grounded" };
  } else if (clientReason) {
    diagnostics.clientName = { confidence: clientField.confidence, source: "gemini_validated", status: "rejected", reason: clientReason };
  } else {
    clientName = clientField.value.trim();
    diagnostics.clientName = { confidence: clientField.confidence, source: "gemini_validated", status: "accepted" };
  }

  const serviceField = parsed.fields.serviceNames;
  let serviceNames: string[] = [];
  if (!serviceField.values.length) {
    diagnostics.serviceNames = { confidence: 0, source: "gemini_validated", status: "missing" };
  } else if (serviceField.confidence < 0.75) {
    diagnostics.serviceNames = { confidence: serviceField.confidence, source: "gemini_validated", status: "rejected", reason: "low_confidence" };
  } else if (!isGroundedEvidence(input.message, serviceField.evidence) && !findServiceName(input.message, input.context)) {
    diagnostics.serviceNames = { confidence: serviceField.confidence, source: "gemini_validated", status: "rejected", reason: "not_grounded" };
  } else {
    const canonical = serviceField.values.map((value) => canonicalCatalogService(input, value)).filter(Boolean);
    if (canonical.length !== serviceField.values.length) {
      diagnostics.serviceNames = { confidence: serviceField.confidence, source: "gemini_validated", status: "rejected", reason: "not_in_tenant_catalog" };
    } else {
      serviceNames = Array.from(new Set(canonical));
      diagnostics.serviceNames = { confidence: serviceField.confidence, source: "gemini_validated", status: "accepted" };
    }
  }

  const dateField = parsed.fields.date;
  const deterministicDate = recognizeDeterministicDate(input.message, input.context.now, input.context.timezone || "America/Sao_Paulo");
  const dateAmbiguous = parsed.ambiguities.some((item) => item.field === "date");
  let date = "";
  let dateReason = "";
  if (dateAmbiguous) {
    dateReason = "semantic_ambiguous";
  } else if (deterministicDate?.date) {
    date = deterministicDate.date;
  } else if (!dateField.canonical) dateReason = "missing";
  else if (dateField.confidence < 0.8) dateReason = "low_confidence";
  else if (!isGroundedEvidence(input.message, dateField.evidence) || !isGroundedEvidence(input.message, dateField.expression)) dateReason = "not_grounded";
  else if (!isValidIsoDate(dateField.canonical)) dateReason = "invalid_calendar_date";
  else if (deterministicDate?.date && deterministicDate.date !== dateField.canonical) dateReason = "deterministic_semantic_divergence";
  if (!date && !dateReason) date = dateField.canonical;
  diagnostics.date = {
    confidence: date ? dateField.canonical ? dateField.confidence : 1 : 0,
    source: deterministicDate?.date ? "deterministic" : "gemini_validated",
    status: date ? "accepted" : dateReason === "semantic_ambiguous" ? "ambiguous" : dateReason === "missing" ? "missing" : "rejected",
    reason: dateReason || undefined,
    expression: dateField.expression || undefined,
  };

  const timeField = parsed.fields.time;
  const deterministicTime = recognizeDeterministicTime(input.message);
  const approximateTime = timeField.precision === "approximate";
  let time = "";
  let timeReason = "";
  if (deterministicTime?.time && !deterministicTime.ambiguous && !approximateTime) {
    time = deterministicTime.time;
  } else if ((timeField.ambiguous || deterministicTime?.ambiguous) && !approximateTime) timeReason = "period_not_specified";
  else if (!timeField.canonical && deterministicTime?.time && !deterministicTime.ambiguous) {
    time = deterministicTime.time;
  } else if (!timeField.canonical) timeReason = "missing";
  else if (timeField.confidence < 0.82) timeReason = "low_confidence";
  else if (!isGroundedEvidence(input.message, timeField.evidence) || !isGroundedEvidence(input.message, timeField.expression)) timeReason = "not_grounded";
  else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeField.canonical)) timeReason = "invalid_time";
  else if (deterministicTime?.time && deterministicTime.time !== timeField.canonical) timeReason = "deterministic_semantic_divergence";
  else if (approximateTime) timeReason = "approximate_time";
  else timeReason = validateSemanticTimePeriod(timeField.canonical, timeField.evidence);
  if (!time && !timeReason) time = timeField.canonical;
  const timeAmbiguous = timeReason === "period_not_specified" || timeReason === "approximate_time";
  diagnostics.time = {
    confidence: time ? timeField.canonical ? timeField.confidence : 1 : timeField.expression ? timeField.confidence : 0,
    source: deterministicTime?.time && !deterministicTime.ambiguous ? "deterministic" : "gemini_validated",
    status: time ? "accepted" : timeAmbiguous ? "ambiguous" : timeReason === "missing" ? "missing" : "rejected",
    reason: timeReason || undefined,
    expression: timeField.expression || undefined,
    proposedValue: approximateTime && timeField.canonical ? timeField.canonical : undefined,
  };
  if (timeAmbiguous && !ambiguities.some((item) => item.field === "time")) {
    ambiguities.push({
      field: "time",
      reason: approximateTime
        ? `Horario aproximado: confirme exatamente ${timeField.canonical}.`
        : "Periodo nao informado: confirme manha, tarde ou noite.",
    });
  }

  const professionalField = parsed.fields.professionalName;
  let professionalName: string | undefined;
  if (professionalField.value) {
    const exact = input.context.professionals.find((professional) =>
      normalizeAiWhatsappEntityText(professional.name) === normalizeAiWhatsappEntityText(professionalField.value)
    );
    if (professionalField.confidence >= 0.8 && exact && isGroundedEvidence(input.message, professionalField.evidence) && isGroundedPhrase(input.message, professionalField.value)) {
      professionalName = exact.name;
      diagnostics.professionalName = { confidence: professionalField.confidence, source: "gemini_validated", status: "accepted" };
    } else {
      diagnostics.professionalName = { confidence: professionalField.confidence, source: "gemini_validated", status: "rejected", reason: exact ? "not_grounded_or_low_confidence" : "not_in_tenant_catalog" };
    }
  } else if (input.context.professionals.length === 1) {
    professionalName = input.context.professionals[0]?.name;
    diagnostics.professionalName = { confidence: 1, source: "context_default", status: "accepted" };
  } else {
    diagnostics.professionalName = { confidence: 0, source: "context_default", status: "missing" };
  }

  const missingFields = [
    clientName ? "" : "clientName",
    serviceNames.length ? "" : "serviceNames",
    professionalName ? "" : "professionalName",
    date ? "" : "date",
    time ? "" : "time",
  ].filter(Boolean);
  for (const [field, diagnostic] of Object.entries(diagnostics)) {
    if (diagnostic.status === "rejected") warnings.push(`${field}: ${diagnostic.reason}.`);
  }
  if (ambiguities.length) warnings.push(...ambiguities.map((item) => `${item.field}: ${item.reason}`));
  else if (missingFields.length) warnings.push("Comando incompleto para criar agendamento.");
  const acceptedRequiredConfidences = ["clientName", "serviceNames", "date", "time"]
    .map((field) => diagnostics[field])
    .filter((item) => item?.status === "accepted")
    .map((item) => item.confidence);
  const confidence = acceptedRequiredConfidences.length ? Math.min(parsed.intentConfidence, ...acceptedRequiredConfidences) : parsed.intentConfidence;

  return {
    ok: true,
    mode: "preview_only",
    intent: "schedule_appointment",
    confidence: Number(confidence.toFixed(2)),
    summary: missingFields.length
      ? "Previa de agendamento incompleta. Revise os campos faltantes ou ambiguos."
      : `Agendamento de ${serviceNames.join(", ")} para ${clientName} em ${date} as ${time}.`,
    draft: { clientName, serviceNames, professionalName, date, time },
    missingFields,
    warnings: Array.from(new Set(warnings)),
    allowedNextActions: [],
    executed: false,
    fieldDiagnostics: diagnostics,
    ambiguities,
  };
}

function sanitizeSemanticStructuredOutput(
  input: OwnerCommandParseInput,
  parsed: z.infer<typeof semanticStructuredOutputSchema>,
): OwnerCommandParseResult {
  if (parsed.intent === "product_sale") {
    return {
      ok: true,
      mode: "preview_only",
      intent: "sell_product",
      confidence: parsed.confidence.intent,
      summary: "Venda de produto requer dados determinísticos completos.",
      draft: { clientName: parsed.clientName ?? "" },
      missingFields: ["productName", "quantity", "paymentMethod"],
      warnings: ["Comando incompleto para registrar venda."],
      allowedNextActions: [],
      executed: false,
    };
  }
  const timeExpression = parsed.timeExpression ?? "";
  const normalizedTimeExpression = normalizeMatchText(timeExpression);
  const period = /\b(?:da|de)\s+manha\b/.test(normalizedTimeExpression)
    ? "morning"
    : /\b(?:da|de)\s+tarde\b/.test(normalizedTimeExpression)
      ? "afternoon"
      : /\b(?:da|de)\s+noite\b/.test(normalizedTimeExpression)
        ? "night"
        : "unspecified";
  return sanitizeSemanticScheduleV2(input, {
    schemaVersion: "1.0",
    intent: parsed.intent,
    intentConfidence: parsed.confidence.intent,
    fields: {
      clientName: {
        value: parsed.clientName ?? "",
        evidence: parsed.clientName ?? "",
        confidence: parsed.confidence.clientName,
      },
      serviceNames: {
        values: parsed.serviceNames,
        evidence: parsed.serviceNames.join(" "),
        confidence: parsed.confidence.service,
      },
      professionalName: {
        value: parsed.professionalName ?? "",
        evidence: parsed.professionalName ?? "",
        confidence: parsed.confidence.professional,
      },
      date: {
        expression: parsed.dateExpression ?? "",
        canonical: parsed.canonicalDate ?? "",
        evidence: parsed.dateExpression ?? "",
        confidence: parsed.confidence.date,
      },
      time: {
        expression: timeExpression,
        canonical: parsed.canonicalTime ?? "",
        period,
        ambiguous: parsed.ambiguousFields.includes("time"),
        precision: parsed.timePrecision,
        evidence: timeExpression,
        confidence: parsed.confidence.time,
      },
    },
    ambiguities: parsed.ambiguousFields.map((field) => ({
      field,
      reason: field === "time" && parsed.timePrecision === "approximate"
        ? "Horario aproximado requer confirmacao exata."
        : "Campo ambiguo requer esclarecimento.",
    })),
    missingFields: parsed.missingFields,
  });
}

function isKnownSemanticService(input: OwnerCommandParseInput, value: string) {
  const normalized = normalizeAiWhatsappEntityText(value);
  if (!normalized) return false;
  if (input.context.services.some((service) =>
    normalizeAiWhatsappEntityText(service.name) === normalized || normalizeAiWhatsappEntityText(service.category) === normalized
  )) return true;
  const aliases = AI_WHATSAPP_ENTITY_ALIASES.filter(
    (alias) => alias.entity === "service" && normalizeAiWhatsappEntityText(alias.alias) === normalized,
  );
  if (aliases.length !== 1) return false;
  const canonical = normalizeAiWhatsappEntityText(aliases[0].canonicalName);
  return input.context.services.some((service) => normalizeAiWhatsappEntityText(service.name) === canonical);
}

function sanitizeSemanticScheduleResult(
  input: OwnerCommandParseInput,
  parsed: OwnerCommandParseResult,
): OwnerCommandParseResult {
  const deterministicService = findServiceName(input.message, input.context);
  const rawClientName = typeof parsed.draft.clientName === "string" ? parsed.draft.clientName.trim() : "";
  const deterministicClient = extractClientName(input.message, deterministicService);
  const clientName = isGroundedPhrase(input.message, rawClientName) ? rawClientName : deterministicClient;
  const dateRecognition = recognizeDeterministicDate(
    input.message,
    input.context.now,
    input.context.timezone || "America/Sao_Paulo",
  );
  const timeRecognition = recognizeDeterministicTime(input.message);
  const normalizedMessage = normalizeMatchText(input.message);
  const hasSemanticRequestEvidence = parsed.confidence >= 0.65
    && Boolean(clientName)
    && Boolean(deterministicService)
    && Boolean(dateRecognition?.date || timeRecognition?.time)
    && /\b(?:pode|consegue|gostaria|queria|preciso|precisa|da para|tem como|deixa|deixar|poe|botar|bota|arruma|organiza)\b/.test(normalizedMessage)
    && !/\b(?:nao quero|cancela|cancelar|desmarca|desmarcar)\b/.test(normalizedMessage);

  if (!hasBroadScheduleIntent(input) && !hasSemanticRequestEvidence) {
    return {
      ok: true,
      mode: "preview_only",
      intent: "unknown",
      confidence: 0,
      summary: "Mensagem sem uma acao de agendamento identificada com seguranca.",
      draft: {},
      missingFields: [],
      warnings: [],
      allowedNextActions: [],
      executed: false,
    };
  }

  const rawServiceNames = Array.isArray(parsed.draft.serviceNames)
    ? parsed.draft.serviceNames.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const groundedSemanticServices = rawServiceNames.filter(
    (name) => isKnownSemanticService(input, name) && (isGroundedPhrase(input.message, name) || Boolean(deterministicService)),
  );
  const serviceNames = deterministicService ? [deterministicService] : Array.from(new Set(groundedSemanticServices));

  const rawProfessionalName = typeof parsed.draft.professionalName === "string"
    ? parsed.draft.professionalName.trim()
    : "";
  const explicitProfessional = input.context.professionals.find(
    (professional) =>
      normalizeAiWhatsappEntityText(professional.name) === normalizeAiWhatsappEntityText(rawProfessionalName)
      && isGroundedPhrase(input.message, rawProfessionalName),
  )?.name;
  const professionalName = explicitProfessional
    ?? (input.context.professionals.length === 1 ? input.context.professionals[0]?.name : undefined);

  const date = dateRecognition?.date ?? "";
  const time = timeRecognition?.ambiguous || timeRecognition?.invalid ? "" : timeRecognition?.time ?? "";
  const missingFields = [
    clientName ? "" : "clientName",
    serviceNames.length ? "" : "serviceNames",
    professionalName ? "" : "professionalName",
    date ? "" : "date",
    time ? "" : "time",
  ].filter(Boolean);
  const warnings = timeRecognition?.ambiguous
    ? ["Horario ambiguo: informe se e de manha, de tarde ou de noite."]
    : timeRecognition?.invalid
      ? ["Horario invalido: informe uma hora entre 0 e 23 e minutos entre 0 e 59."]
      : missingFields.length
        ? ["Comando incompleto para criar agendamento."]
        : [];

  return {
    ok: true,
    mode: "preview_only",
    intent: "schedule_appointment",
    confidence: Number(Math.min(parsed.confidence, missingFields.length ? 0.75 : 0.9).toFixed(2)),
    summary: missingFields.length
      ? "Previa de agendamento incompleta. Revise os campos faltantes."
      : `Agendamento de ${serviceNames.join(", ")} para ${clientName} em ${date} as ${time}.`,
    draft: { clientName, serviceNames, professionalName, date, time },
    missingFields,
    warnings,
    allowedNextActions: [],
    executed: false,
    fieldDiagnostics: {
      clientName: clientName
        ? { confidence: parsed.confidence, source: "gemini_validated", status: "accepted" }
        : { confidence: 0, source: "gemini_validated", status: "missing" },
      serviceNames: serviceNames.length
        ? { confidence: parsed.confidence, source: deterministicService ? "deterministic" : "gemini_validated", status: "accepted" }
        : { confidence: 0, source: "gemini_validated", status: "missing" },
      professionalName: professionalName
        ? { confidence: 1, source: explicitProfessional ? "gemini_validated" : "context_default", status: "accepted" }
        : rawProfessionalName
          ? { confidence: parsed.confidence, source: "gemini_validated", status: "rejected", reason: "not_in_tenant_catalog" }
          : { confidence: 0, source: "gemini_validated", status: "missing" },
      date: date
        ? { confidence: 1, source: "deterministic", status: "accepted" }
        : { confidence: 0, source: "deterministic", status: "missing" },
      time: time
        ? { confidence: 1, source: "deterministic", status: "accepted" }
        : { confidence: 0, source: "deterministic", status: timeRecognition?.ambiguous ? "ambiguous" : "missing", reason: timeRecognition?.ambiguous ? "period_not_specified" : undefined },
    },
  };
}

function normalizeResult(value: unknown, input: OwnerCommandParseInput): OwnerCommandParseResult {
  const structured = semanticStructuredOutputSchema.safeParse(value);
  if (structured.success) return sanitizeSemanticStructuredOutput(input, structured.data);

  const semanticScheduleV2 = semanticScheduleV2ResponseSchema.safeParse(value);
  if (semanticScheduleV2.success) {
    return sanitizeSemanticScheduleV2(input, semanticScheduleV2.data);
  }

  const semanticSchedule = legacySemanticScheduleResponseSchema.safeParse(value);
  if (semanticSchedule.success) {
    const parsed = semanticSchedule.data;
    return sanitizeSemanticScheduleResult(input, {
      ok: true,
      mode: "preview_only",
      intent: "schedule_appointment",
      confidence: Number(parsed.confidence.toFixed(2)),
      summary: "Interpretacao semantica de agendamento.",
      draft: {
        clientName: parsed.clientName,
        serviceNames: parsed.serviceNames,
        professionalName: parsed.professionalName,
        date: parsed.date,
        time: parsed.time,
      },
      missingFields: parsed.missingFields,
      warnings: [],
      allowedNextActions: [],
      executed: false,
    });
  }

  const parsed = ownerCommandResponseSchema.parse(value);
  const result: OwnerCommandParseResult = {
    ok: true,
    mode: "preview_only",
    intent: parsed.intent === "product_sale" ? "sell_product" : parsed.intent,
    confidence: Number(parsed.confidence.toFixed(2)),
    summary: parsed.summary,
    draft: parsed.draft,
    missingFields: parsed.missingFields,
    warnings: parsed.warnings,
    allowedNextActions: parsed.allowedNextActions.includes("confirm_later") ? ["confirm_later"] : [],
    executed: false,
  };
  return result.intent === "schedule_appointment" ? sanitizeSemanticScheduleResult(input, result) : result;
}

export class GeminiOwnerCommandParser implements OwnerCommandParser {
  readonly modelVersion: string;
  private rateLimitCount = 0;
  private rateLimitWindowStartedAt = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 15_000,
    private readonly rateLimitThreshold = 2,
    private readonly circuitCooldownMs = 60_000,
  ) {
    this.modelVersion = `gemini:${model}`;
  }

  private registerRateLimit(now: number) {
    if (now - this.rateLimitWindowStartedAt > this.circuitCooldownMs) {
      this.rateLimitCount = 0;
      this.rateLimitWindowStartedAt = now;
    }
    this.rateLimitCount += 1;
    if (this.rateLimitCount >= this.rateLimitThreshold) {
      this.circuitOpenUntil = now + this.circuitCooldownMs;
    }
  }

  private fallbackOrThrow(input: OwnerCommandParseInput, reason: OwnerCommandFallbackReason, attempt?: OwnerCommandParserAttempt) {
    const deterministic = parseDeterministicOwnerCommand(input);
    if (deterministic) return { ...deterministic, fallbackReason: reason };
    throw new OwnerCommandParserError(
      reason,
      reason === "gemini_invalid_json" || reason === "gemini_invalid_schema" || reason === "parser_error"
        ? "IA nao conseguiu interpretar a mensagem com seguranca."
        : "IA indisponivel no momento. Tente novamente em instantes.",
      attempt?.httpStatus,
      attempt?.attempts,
    );
  }

  async parseGemini(input: OwnerCommandParseInput): Promise<OwnerCommandParserAttempt> {
    const startedAt = Date.now();
    if (Date.now() < this.circuitOpenUntil) {
      return { status: "PROVIDER_ERROR", durationMs: 0, failureCode: "gemini_circuit_open" };
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    try {
      const provider = await executeResilientProviderRequest({
        correlationId: input.correlationId,
        provider: "gemini",
        purpose: "semantic",
        model: this.model,
        fallbackModel: process.env.GEMINI_FALLBACK_MODEL,
        fallbackEnabled: String(process.env.GEMINI_MODEL_FALLBACK_ENABLED ?? "").trim().toLowerCase() === "true",
        endpoint,
        timeoutMs: this.timeoutMs,
        totalBudgetMs: getGeminiOwnerCommandTotalBudgetMsFromEnv(),
        maxRetries: getGeminiOwnerCommandMaxRetriesFromEnv(),
        request: async (model, signal) => await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
          {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              responseJsonSchema: semanticStructuredOutputJsonSchema,
            },
          }),
          signal,
        },
        ),
      });

      const payload = (await provider.response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) {
        return { status: "INVALID_RESPONSE", durationMs: Date.now() - startedAt, httpStatus: provider.response.status, failureCode: "gemini_empty_response", attempts: provider.attempts, model: provider.model, fallbackUsed: provider.fallbackUsed };
      }
      try {
        const result = normalizeResult(JSON.parse(stripJsonFence(text)), input);
        const status = result.intent === "unknown"
          ? "UNSUPPORTED"
          : result.ambiguities?.length
            ? "AMBIGUOUS"
          : result.missingFields.length
            ? "PARSED_INCOMPLETE"
            : "PARSED_COMPLETE";
        return { status, result, durationMs: Date.now() - startedAt, httpStatus: provider.response.status, attempts: provider.attempts, model: provider.model, fallbackUsed: provider.fallbackUsed };
      } catch (error) {
        return {
          status: "INVALID_RESPONSE",
          durationMs: Date.now() - startedAt,
          httpStatus: provider.response.status,
          failureCode: error instanceof z.ZodError ? "gemini_invalid_schema" : "gemini_invalid_json",
          attempts: provider.attempts,
          model: provider.model,
          fallbackUsed: provider.fallbackUsed,
        };
      }
    } catch (error) {
      if (error instanceof ResilientProviderError) {
        const last = error.lastAttempt;
        if (last?.httpStatus === 429 && error.classification !== "permanent_quota") this.registerRateLimit(Date.now());
        const failureCode: OwnerCommandFallbackReason = error.classification === "permanent_quota"
          ? "gemini_quota_exhausted"
          : error.classification === "transient_timeout"
            ? "gemini_timeout"
            : last?.httpStatus === 429
              ? "gemini_429"
              : error.classification === "transient_http"
                ? "gemini_5xx"
                : error.classification === "transient_network"
                  ? "gemini_network_error"
                  : "gemini_http_error";
        return {
          status: failureCode === "gemini_timeout" ? "TIMEOUT" : "PROVIDER_ERROR",
          durationMs: Date.now() - startedAt,
          httpStatus: last?.httpStatus,
          failureCode,
          attempts: error.attempts,
          model: error.model,
          fallbackUsed: error.attempts.some((attempt) => attempt.fallbackUsed),
        };
      }
      return { status: "PROVIDER_ERROR", durationMs: Date.now() - startedAt, failureCode: "parser_error" };
    }
  }

  async parse(input: OwnerCommandParseInput): Promise<OwnerCommandParseResult> {
    const attempt = await this.parseGemini(input);
    if (attempt.result) return attempt.result;
    return this.fallbackOrThrow(input, attempt.failureCode ?? "parser_error", attempt);
  }
}

type LocalLlamaChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
};

function markLocalLlamaDiagnostics(result: OwnerCommandParseResult): OwnerCommandParseResult {
  if (!result.fieldDiagnostics) return result;
  return {
    ...result,
    fieldDiagnostics: Object.fromEntries(Object.entries(result.fieldDiagnostics).map(([field, diagnostic]) => [
      field,
      diagnostic.source === "gemini_validated"
        ? { ...diagnostic, source: "local_llama_validated" as const }
        : diagnostic,
    ])),
  };
}

export class LocalLlamaOwnerCommandParser implements OwnerCommandParser {
  readonly modelVersion: string;

  constructor(
    private readonly endpoint: string,
    private readonly model: string,
    private readonly timeoutMs = 15_000,
    private readonly modelHash = "unknown",
  ) {
    this.modelVersion = `local_llama:${model}@sha256:${modelHash}`;
  }

  async parseGemini(input: OwnerCommandParseInput): Promise<OwnerCommandParserAttempt> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: buildPrompt(input) }],
          temperature: 0,
          max_tokens: 320,
          stream: false,
          reasoning_format: "none",
          chat_template_kwargs: { enable_thinking: false },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "commercial_understanding",
              strict: true,
              schema: semanticStructuredOutputJsonSchema,
            },
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          status: "PROVIDER_ERROR",
          durationMs: Date.now() - startedAt,
          httpStatus: response.status,
          failureCode: "local_llama_http_error",
          model: this.modelVersion,
        };
      }
      const payload = await response.json() as LocalLlamaChatResponse;
      const message = payload.choices?.[0]?.message;
      const text = message?.content?.trim();
      if (!text || message?.reasoning_content?.trim()) {
        return {
          status: "INVALID_RESPONSE",
          durationMs: Date.now() - startedAt,
          httpStatus: response.status,
          failureCode: "local_llama_empty_response",
          model: this.modelVersion,
        };
      }
      try {
        const result = markLocalLlamaDiagnostics(normalizeResult(JSON.parse(stripJsonFence(text)), input));
        const status = result.intent === "unknown"
          ? "UNSUPPORTED"
          : result.ambiguities?.length
            ? "AMBIGUOUS"
            : result.missingFields.length
              ? "PARSED_INCOMPLETE"
              : "PARSED_COMPLETE";
        return { status, result, durationMs: Date.now() - startedAt, httpStatus: response.status, model: this.modelVersion };
      } catch (error) {
        return {
          status: "INVALID_RESPONSE",
          durationMs: Date.now() - startedAt,
          httpStatus: response.status,
          failureCode: error instanceof z.ZodError ? "local_llama_invalid_schema" : "local_llama_invalid_json",
          model: this.modelVersion,
        };
      }
    } catch (error) {
      return {
        status: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "PROVIDER_ERROR",
        durationMs: Date.now() - startedAt,
        failureCode: error instanceof Error && error.name === "AbortError" ? "local_llama_timeout" : "local_llama_unavailable",
        model: this.modelVersion,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async parse(input: OwnerCommandParseInput): Promise<OwnerCommandParseResult> {
    const attempt = await this.parseGemini(input);
    if (attempt.result) return attempt.result;
    const deterministic = parseDeterministicOwnerCommand(input);
    if (deterministic) return { ...deterministic, fallbackReason: attempt.failureCode ?? "parser_error" };
    throw new OwnerCommandParserError(
      attempt.failureCode ?? "parser_error",
      attempt.status === "INVALID_RESPONSE"
        ? "IA nao conseguiu interpretar a mensagem com seguranca."
        : "IA indisponivel no momento. Tente novamente em instantes.",
      attempt.httpStatus,
    );
  }
}

export function getGeminiOwnerCommandTimeoutMsFromEnv() {
  const configured = Number(process.env.GEMINI_TIMEOUT_MS ?? 15_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 15_000;
}

export function getGeminiOwnerCommandTotalBudgetMsFromEnv() {
  const configured = Number(process.env.GEMINI_TOTAL_BUDGET_MS ?? 45_000);
  return Number.isFinite(configured) && configured > 0 ? Math.min(120_000, Math.trunc(configured)) : 45_000;
}

export function getGeminiOwnerCommandMaxRetriesFromEnv() {
  const configured = Number(process.env.GEMINI_MAX_RETRIES ?? (process.env.NODE_ENV === "test" ? 0 : 2));
  return Number.isFinite(configured) && configured >= 0 ? Math.min(5, Math.trunc(configured)) : 2;
}

export function createGeminiOwnerCommandParserFromEnv(): OwnerCommandParser | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const rateLimitThreshold = Number(process.env.GEMINI_CIRCUIT_429_THRESHOLD ?? 2);
  const circuitCooldownMs = Number(process.env.GEMINI_CIRCUIT_COOLDOWN_MS ?? 60_000);
  return new GeminiOwnerCommandParser(
    apiKey,
    model,
    getGeminiOwnerCommandTimeoutMsFromEnv(),
    Number.isFinite(rateLimitThreshold) && rateLimitThreshold > 0 ? Math.trunc(rateLimitThreshold) : 2,
    Number.isFinite(circuitCooldownMs) && circuitCooldownMs > 0 ? circuitCooldownMs : 60_000,
  );
}

export function createOwnerCommandParserFromEnv(): OwnerCommandParser | null {
  const configuredProvider = process.env.SEMANTIC_PROVIDER?.trim().toLowerCase();
  const provider = configuredProvider || (process.env.NODE_ENV === "test"
    ? process.env.GEMINI_API_KEY ? "gemini" : "deterministic"
    : "local_llama");
  if (provider === "local_llama") {
    const endpoint = (process.env.LOCAL_LLAMA_URL?.trim() || "http://127.0.0.1:11435").replace(/\/$/, "");
    const model = process.env.LOCAL_LLAMA_MODEL?.trim() || "google_gemma-3-4b-it-Q4_K_M.gguf";
    const modelHash = process.env.LOCAL_LLAMA_MODEL_SHA256?.trim().toLowerCase()
      || "4996030242583a40aa151ff93f49ed787ac8c25e4120c3ae4588b2e2a7d1ae94";
    const configuredTimeout = Number(process.env.LOCAL_LLAMA_TIMEOUT_MS ?? 15_000);
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? Math.min(15_000, Math.trunc(configuredTimeout))
      : 15_000;
    return new LocalLlamaOwnerCommandParser(endpoint, model, timeoutMs, modelHash);
  }
  return provider === "gemini" && process.env.NODE_ENV === "test"
    ? createGeminiOwnerCommandParserFromEnv()
    : null;
}
