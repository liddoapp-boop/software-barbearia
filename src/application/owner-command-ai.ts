import { z } from "zod";

export type OwnerCommandContext = {
  unitId: string;
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
    "Se faltar dado obrigatorio, preencha missingFields e warnings.",
    "Se houver ambiguidade, peca confirmacao humana em warnings.",
    "Nunca sugira acao irreversivel sem confirmacao.",
    "Mantenha portugues brasileiro.",
    "Nao inclua segredos, tokens, chaves, senhas, URLs de banco ou logs.",
    "Responda exclusivamente JSON valido, sem texto fora do JSON.",
    'Formato: {"ok":true,"mode":"preview_only","intent":"checkout_service|product_sale|schedule_appointment|cancel_appointment|report_query|unknown","confidence":0.0,"summary":"...","draft":{},"missingFields":[],"warnings":[],"allowedNextActions":[],"executed":false}',
    "",
    "Mensagem do owner:",
    input.message,
    "",
    "Contexto minimo permitido:",
    JSON.stringify(buildSafeContext(input.context)),
  ].join("\n");
}

function normalizeResult(value: unknown): OwnerCommandParseResult {
  const parsed = ownerCommandResponseSchema.parse(value);
  return {
    ok: true,
    mode: "preview_only",
    intent: parsed.intent,
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
