import { z } from "zod";

export type OwnerCommandContext = {
  unitId: string;
  unitName?: string;
  screenContext?: string;
  now: Date;
  timezone: string;
  services: Array<{ name: string; category?: string | null; price?: number; durationMin?: number }>;
  products: Array<{ name: string; category?: string | null; salePrice?: number; stockQty?: number }>;
  paymentMethods: Array<{ name: string; isDefault?: boolean }>;
  professionals: Array<{ name: string }>;
};

export type OwnerCommandParseInput = {
  message: string;
  context: OwnerCommandContext;
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
    | "unknown";
  confidence: number;
  summary: string;
  draft: Record<string, unknown>;
  missingFields: string[];
  warnings: string[];
  allowedNextActions: string[];
  executed: false;
};

export interface OwnerCommandParser {
  readonly modelVersion: string;
  parse(input: OwnerCommandParseInput): Promise<OwnerCommandParseResult>;
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
    services: context.services.slice(0, 80),
    products: context.products.slice(0, 80),
    paymentMethods: context.paymentMethods.slice(0, 20),
    professionals: context.professionals.slice(0, 40),
  };
}

function buildPrompt(input: OwnerCommandParseInput) {
  return [
    "Voce e o Atendente IA do Dono de uma barbearia.",
    "Sua tarefa e interpretar uma mensagem curta do owner e montar uma previa estruturada.",
    "Voce nunca executa acoes. Sempre retorne executed:false.",
    "Nao crie, cancele, conclua, cobre, venda, altere estoque, lance financeiro, envie WhatsApp, altere senha ou apague dados.",
    "Nao invente IDs. Use nomes quando existirem no texto ou no contexto.",
    "Para agendamento, reconheca agenda, agende, marca e marque como intent schedule_appointment.",
    "Para agendamento, retorne draft.clientName, draft.serviceNames, draft.date no formato YYYY-MM-DD e draft.time no formato HH:mm.",
    "Interprete datas relativas como hoje, amanha e dias da semana usando context.now e context.timezone.",
    "Aceite nomes de clientes em maiusculas, minusculas ou com acentos exatamente como foram escritos.",
    "Se houver apenas um profissional no contexto, use esse nome em draft.professionalName.",
    "Para venda de produto, reconheca vendi, venda, vendeu e registrar venda como intent sell_product.",
    "Para venda de produto, retorne draft.clientName, draft.productName, draft.quantity, draft.paymentMethod e, se o owner informar valor, draft.quotedUnitPrice.",
    "Para venda de produto, use somente produtos e metodos de pagamento presentes no contexto.",
    "Se faltar dado obrigatorio, preencha missingFields e warnings.",
    "Se houver ambiguidade, peca confirmacao humana em warnings.",
    "Nunca sugira acao irreversivel sem confirmacao.",
    "Mantenha portugues brasileiro.",
    "Nao inclua segredos, tokens, chaves, senhas, URLs de banco ou logs.",
    "Responda exclusivamente JSON valido, sem texto fora do JSON.",
    'Formato: {"ok":true,"mode":"preview_only","intent":"checkout_service|sell_product|product_sale|schedule_appointment|cancel_appointment|report_query|unknown","confidence":0.0,"summary":"...","draft":{},"missingFields":[],"warnings":[],"allowedNextActions":[],"executed":false}',
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

function parseDeterministicDate(message: string, now: Date, timezone: string) {
  const normalized = normalizeMatchText(message);
  const today = getDatePartsInTimezone(now, timezone);
  if (normalized.includes("amanha")) return formatLocalDate(addLocalDays(today, 1));
  if (normalized.includes("hoje")) return formatLocalDate(today);
  const slashDate = message.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]);
    const rawYear = slashDate[3] ? Number(slashDate[3]) : today.year;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return formatLocalDate({ year, month, day });
  }
  return resolveWeekdayDate(message, now, timezone);
}

function parseDeterministicTime(message: string) {
  const match = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/\b(?:as|a)\s*(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})?)?\b/i);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
  return context.paymentMethods
    .map((method) => method.name)
    .filter(Boolean)
    .sort((a, b) => normalizeMatchText(b).length - normalizeMatchText(a).length)
    .find((name) => normalized.includes(` ${normalizeMatchText(name)} `));
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
  const match = message.match(/\b(?:para|pra|pro)\s+(.+?)(?:,|\.|\s+(?:ele|ela)\s+pagou|\s+pagou|\s+no\s+|\s+na\s+|$)/i);
  return match?.[1] ? cleanClientName(match[1]) : "";
}

function extractProductNameFromSaleMessage(message: string) {
  const match = message.match(/\b(?:vendi|vendeu|venda|vender)\s+(?:(?:um|uma|uns|umas|\d+)\s+)?(.+?)\s+(?:para|pra|pro)\b/i);
  if (!match?.[1]) return "";
  const productName = cleanClientName(match[1]);
  return productName ? productName.charAt(0).toUpperCase() + productName.slice(1) : "";
}

function cleanClientName(value: string) {
  return value
    .replace(/[.,;:!?]+$/g, "")
    .replace(/^(?:o|a|um|uma)\s+/i, "")
    .trim();
}

function extractClientName(message: string, serviceName?: string) {
  const dateMarker = "(?:amanh[ãa]|hoje|na\\s+[a-zA-ZçÇãÃáÁàÀâÂéÉêÊíÍóÓôÔõÕúÚ]+|no\\s+[a-zA-ZçÇãÃáÁàÀâÂéÉêÊíÍóÓôÔõÕúÚ]+|dia\\s+\\d{1,2}\\/\\d{1,2}|[àa]s\\s*\\d{1,2})";
  if (serviceName) {
    const servicePattern = escapeRegex(serviceName);
    const serviceBeforeClient = new RegExp(`\\b${servicePattern}\\b\\s+(?:para|pra|pro)\\s+(.+?)\\s+(?=${dateMarker})`, "i");
    const serviceBeforeMatch = message.match(serviceBeforeClient);
    if (serviceBeforeMatch?.[1]) return cleanClientName(serviceBeforeMatch[1]);
  }

  const clientBeforeDate = new RegExp(`^(?:agenda|agende|agendar|marca|marque|marcar)\\s+(.+?)\\s+(?=${dateMarker})`, "i");
  const clientBeforeDateMatch = message.match(clientBeforeDate);
  if (clientBeforeDateMatch?.[1]) return cleanClientName(clientBeforeDateMatch[1]);

  if (serviceName) {
    const servicePattern = escapeRegex(serviceName);
    const clientBeforeService = new RegExp(`^(?:agenda|agende|agendar|marca|marque|marcar)\\s+(.+?)\\s+(?:para|pra|pro)\\s+${servicePattern}\\b`, "i");
    const clientBeforeServiceMatch = message.match(clientBeforeService);
    if (clientBeforeServiceMatch?.[1]) return cleanClientName(clientBeforeServiceMatch[1]);
  }
  return "";
}

function deterministicScheduleParse(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  const normalized = normalizeMatchText(input.message);
  const hasScheduleVerb = /\b(agenda|agende|agendar|marca|marque|marcar)\b/.test(normalized);
  if (!hasScheduleVerb) return null;

  const serviceName = findServiceName(input.message, input.context);
  const clientName = extractClientName(input.message, serviceName);
  const date = parseDeterministicDate(input.message, input.context.now, input.context.timezone || "America/Sao_Paulo");
  const time = parseDeterministicTime(input.message);
  const professionalName = input.context.professionals.length === 1 ? input.context.professionals[0]?.name : undefined;
  const missingFields = [
    clientName ? "" : "clientName",
    serviceName ? "" : "serviceNames",
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
    warnings: missingFields.length ? ["Comando incompleto para criar agendamento."] : [],
    allowedNextActions: [],
    executed: false,
  };
}

function deterministicProductSaleParse(input: OwnerCommandParseInput): OwnerCommandParseResult | null {
  const normalized = normalizeMatchText(input.message);
  const hasSaleVerb = /\b(vendi|vendeu|venda|vender|registrar venda)\b/.test(normalized);
  if (!hasSaleVerb) return null;

  const productName = findProductName(input.message, input.context) || extractProductNameFromSaleMessage(input.message);
  const clientName = extractProductSaleClientName(input.message);
  const paymentMethod = findPaymentMethodName(input.message, input.context);
  const quantity = parseProductQuantity(input.message);
  const quotedUnitPrice = parseQuotedUnitPrice(input.message);
  const missingFields = [
    clientName ? "" : "clientName",
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
      : `Venda de ${quantity} ${productName} para ${clientName} com pagamento ${paymentMethod}.`,
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

function normalizeResult(value: unknown): OwnerCommandParseResult {
  const parsed = ownerCommandResponseSchema.parse(value);
  return {
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
}

export class GeminiOwnerCommandParser implements OwnerCommandParser {
  readonly modelVersion: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 8000,
  ) {
    this.modelVersion = `gemini:${model}`;
  }

  async parse(input: OwnerCommandParseInput): Promise<OwnerCommandParseResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error("IA indisponivel no momento. Tente novamente em instantes.");
      }

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) {
        throw new Error("IA retornou uma resposta vazia.");
      }
      return normalizeResult(JSON.parse(stripJsonFence(text)));
    } catch (error) {
      const productSale = deterministicProductSaleParse(input);
      if (productSale) return productSale;
      const deterministic = deterministicScheduleParse(input);
      if (deterministic) return deterministic;
      if (error instanceof Error && error.message.startsWith("IA ")) throw error;
      throw new Error("IA nao conseguiu interpretar a mensagem com seguranca.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGeminiOwnerCommandParserFromEnv(): OwnerCommandParser | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 8000);
  return new GeminiOwnerCommandParser(
    apiKey,
    model,
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000,
  );
}
