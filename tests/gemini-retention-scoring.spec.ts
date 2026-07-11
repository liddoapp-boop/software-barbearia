import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGeminiRetentionScorerFromEnv,
  GeminiRetentionScorer,
} from "../src/application/gemini-retention-scoring";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

function scoringFacts() {
  return {
    unitId: "unit-01",
    clientId: "client-secret-id",
    scoredAt: new Date("2026-07-10T12:00:00.000Z"),
    daysWithoutReturn: 64,
    visits90d: 1,
    heuristicRiskScore: 70.8,
    heuristicRiskLevel: "HIGH" as const,
    heuristicReturnProbability: 29.2,
    heuristicReasons: ["Mais de 60 dias sem retorno"],
  };
}

describe("Gemini retention scoring", () => {
  it("fica desativado sem GEMINI_API_KEY", () => {
    delete process.env.GEMINI_API_KEY;
    expect(createGeminiRetentionScorerFromEnv()).toBeNull();
  });

  it("normaliza a resposta JSON do Gemini sem enviar IDs internos no prompt", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    riskScore: 82.456,
                    riskLevel: "HIGH",
                    returnProbability: 18.123,
                    reasons: ["Cliente esta ha muito tempo sem retorno"],
                  }),
                },
              ],
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const scorer = new GeminiRetentionScorer("test-secret", "gemini-test", 1000);
    const result = await scorer.score(scoringFacts());

    expect(result).toEqual({
      riskScore: 82.46,
      riskLevel: "HIGH",
      returnProbability: 18.12,
      reasons: ["Cliente esta ha muito tempo sem retorno"],
      modelVersion: "gemini:gemini-test",
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("daysWithoutReturn");
    expect(prompt).not.toContain("client-secret-id");
    expect(prompt).not.toContain("unit-01");
  });

  it("retorna null quando a API falha para permitir fallback heuristico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
      })),
    );

    const scorer = new GeminiRetentionScorer("test-secret", "gemini-test", 1000);
    await expect(scorer.score(scoringFacts())).resolves.toBeNull();
  });
});
