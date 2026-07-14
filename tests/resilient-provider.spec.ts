import { describe, expect, it, vi } from "vitest";
import { SingleWhatsappResponseGate } from "../src/application/ai-whatsapp-pipeline";
import {
  executeResilientProviderRequest,
  ResilientProviderError,
} from "../src/application/resilient-provider";

function response(status: number, body: unknown = {}, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
  });
}

function runtime() {
  let now = 0;
  const delays: number[] = [];
  return {
    delays,
    value: {
      now: () => now,
      random: () => 0,
      sleep: async (delayMs: number) => {
        delays.push(delayMs);
        now += delayMs;
      },
    },
  };
}

function semanticConfig(request: (model: string, signal: AbortSignal) => Promise<Response>) {
  const clock = runtime();
  return {
    clock,
    config: {
      correlationId: "corr-semantic-1",
      provider: "gemini",
      purpose: "semantic" as const,
      model: "primary-model",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/primary:generateContent?key=secret",
      timeoutMs: 15_000,
      totalBudgetMs: 45_000,
      maxRetries: 2,
      request,
      runtime: clock.value,
    },
  };
}

describe("cliente resiliente comum de provedores", () => {
  it("recupera 500 -> 200 e registra cada tentativa", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(response(500, { error: { code: 500, status: "INTERNAL", message: "temporary" } }))
      .mockResolvedValueOnce(response(200, { ok: true }));
    const { config, clock } = semanticConfig(request);

    const result = await executeResilientProviderRequest(config);

    expect(result.attempts).toMatchObject([
      { httpStatus: 500, classification: "transient_http", retryApplied: true, result: "failed" },
      { httpStatus: 200, classification: "success", retryApplied: false, result: "success" },
    ]);
    expect(clock.delays).toEqual([1_000]);
  });

  it("respeita Retry-After no 503", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(response(503, { error: { code: 503, status: "UNAVAILABLE" } }, { "retry-after": "3" }))
      .mockResolvedValueOnce(response(200));
    const { config, clock } = semanticConfig(request);

    const result = await executeResilientProviderRequest(config);

    expect(clock.delays).toEqual([3_000]);
    expect(result.attempts[0]).toMatchObject({ retryAfterMs: 3_000, retryHeaders: { "retry-after": "3" } });
  });

  it.each([400, 401, 403])("nao repete HTTP %s", async (status) => {
    const request = vi.fn().mockResolvedValue(response(status, { error: { code: status, message: "invalid key=secret" } }));
    const { config } = semanticConfig(request);

    await expect(executeResilientProviderRequest(config)).rejects.toMatchObject({
      classification: "permanent_http",
      attempts: [{ httpStatus: status, retryApplied: false, providerMessage: expect.not.stringContaining("secret") }],
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("nao repete cota diaria permanente", async () => {
    const request = vi.fn().mockResolvedValue(response(429, {
      error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "RequestsPerDay limit: 0" },
    }));
    const { config } = semanticConfig(request);

    await expect(executeResilientProviderRequest(config)).rejects.toMatchObject({ classification: "permanent_quota" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("limita falha 5xx persistente a duas repeticoes", async () => {
    const request = vi.fn().mockResolvedValue(response(502, { error: { code: 502 } }));
    const { config } = semanticConfig(request);

    const failure = await executeResilientProviderRequest(config).catch((error) => error as ResilientProviderError);

    expect(failure.attempts).toHaveLength(3);
    expect(failure.attempts.map((attempt) => attempt.retryApplied)).toEqual([true, true, false]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("usa fallback opt-in uma unica vez depois da falha transitoria", async () => {
    const models: string[] = [];
    const request = vi.fn(async (model: string) => {
      models.push(model);
      return model === "fallback-model" ? response(200) : response(504, { error: { code: 504 } });
    });
    const { config } = semanticConfig(request);
    config.maxRetries = 0;

    const result = await executeResilientProviderRequest({
      ...config,
      fallbackEnabled: true,
      fallbackModel: "fallback-model",
    });

    expect(models).toEqual(["primary-model", "fallback-model"]);
    expect(result).toMatchObject({ model: "fallback-model", fallbackUsed: true });
    expect(result.attempts[1]).toMatchObject({ fallbackUsed: true, retryApplied: false });
  });

  it("fallback desativado nao chama segundo modelo", async () => {
    const request = vi.fn().mockResolvedValue(response(500));
    const { config } = semanticConfig(request);
    config.maxRetries = 0;

    await expect(executeResilientProviderRequest({ ...config, fallbackEnabled: false, fallbackModel: "fallback-model" }))
      .rejects.toBeInstanceOf(ResilientProviderError);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
describe("trava de resposta WhatsApp", () => {
  it("permite no maximo uma tentativa mesmo quando o primeiro envio falha", async () => {
    const gate = new SingleWhatsappResponseGate();
    const sender = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);

    const first = await gate.send(sender);
    const second = await gate.send(sender);

    expect(first).toMatchObject({ attempted: true, delivered: false });
    expect(second).toEqual({ attempted: false, delivered: false });
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
