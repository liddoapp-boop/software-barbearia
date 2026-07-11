import { z } from "zod";

export type RetentionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RetentionScoringFacts = {
  unitId: string;
  clientId: string;
  scoredAt: Date;
  daysWithoutReturn: number;
  visits90d: number;
  heuristicRiskScore: number;
  heuristicRiskLevel: RetentionRiskLevel;
  heuristicReturnProbability: number;
  heuristicReasons: string[];
};

export type RetentionScoringResult = {
  riskScore: number;
  riskLevel: RetentionRiskLevel;
  returnProbability: number;
  reasons: string[];
  modelVersion: string;
};

export interface RetentionAiScorer {
  readonly modelVersion: string;
  score(input: RetentionScoringFacts): Promise<RetentionScoringResult | null>;
}

const geminiScoreSchema = z.object({
  riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  returnProbability: z.number().min(0).max(100),
  reasons: z.array(z.string().min(3).max(140)).min(1).max(4),
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

function buildPrompt(input: RetentionScoringFacts) {
  return [
    "Voce e uma IA de retencao para uma barbearia.",
    "Avalie somente os dados agregados abaixo, sem inferir dados pessoais.",
    "Responda exclusivamente em JSON valido com riskScore, riskLevel, returnProbability e reasons.",
    "riskScore e returnProbability devem ir de 0 a 100.",
    'riskLevel deve ser "LOW", "MEDIUM" ou "HIGH".',
    "reasons deve conter de 1 a 4 motivos curtos em portugues do Brasil.",
    "",
    JSON.stringify({
      scoredAt: input.scoredAt.toISOString(),
      daysWithoutReturn: input.daysWithoutReturn,
      visits90d: input.visits90d,
      heuristic: {
        riskScore: input.heuristicRiskScore,
        riskLevel: input.heuristicRiskLevel,
        returnProbability: input.heuristicReturnProbability,
        reasons: input.heuristicReasons,
      },
    }),
  ].join("\n");
}

export class GeminiRetentionScorer implements RetentionAiScorer {
  readonly modelVersion: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 6000,
  ) {
    this.modelVersion = `gemini:${model}`;
  }

  async score(input: RetentionScoringFacts): Promise<RetentionScoringResult | null> {
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
      if (!response.ok) return null;

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) return null;

      const parsed = geminiScoreSchema.safeParse(JSON.parse(stripJsonFence(text)));
      if (!parsed.success) return null;

      return {
        riskScore: Number(parsed.data.riskScore.toFixed(2)),
        riskLevel: parsed.data.riskLevel,
        returnProbability: Number(parsed.data.returnProbability.toFixed(2)),
        reasons: parsed.data.reasons,
        modelVersion: this.modelVersion,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGeminiRetentionScorerFromEnv(): RetentionAiScorer | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 6000);
  return new GeminiRetentionScorer(
    apiKey,
    model,
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 6000,
  );
}
