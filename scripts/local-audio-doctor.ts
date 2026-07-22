import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import {
  AudioTranscriptionError,
  LocalWhisperAudioTranscriptionService,
  createAudioTranscriptionServiceFromEnv,
} from "../src/application/audio-transcription";
import { createApp } from "../src/http/app";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

function loadLocalEnvironment() {
  for (const file of [".env", ".env.pilot.local"]) {
    const resolved = path.resolve(file);
    if (!existsSync(resolved)) continue;
    const parsed = dotenv.parse(readFileSync(resolved));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function getArgument(name: string) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function inferMimetype(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const mimetypes: Record<string, string> = {
    ".ogg": "audio/ogg; codecs=opus",
    ".opus": "audio/opus",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
    ".wav": "audio/wav",
  };
  return mimetypes[extension] ?? "";
}

async function runWebhookDiagnostic(input: {
  service: LocalWhisperAudioTranscriptionService;
  audio: Buffer;
  mimetype: string;
  fingerprint: string;
}) {
  const ownerPhone = String(process.env.AI_WHATSAPP_OWNER_PHONE ?? "").replace(/\D/g, "");
  const webhookSecret = String(process.env.EVOLUTION_WEBHOOK_SECRET ?? "").trim();
  const instance = String(process.env.EVOLUTION_INSTANCE_NAME ?? "").trim();
  if (!ownerPhone || !webhookSecret || !instance) throw new Error("isolated_webhook_configuration_invalid");
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATA_BACKEND: "memory",
    AUTH_ENFORCED: "true",
    HTTP_LOG_ENABLED: "false",
    AI_WHATSAPP_ENABLED: "true",
    AI_WHATSAPP_AUDIO_ENABLED: "true",
    AI_AUDIO_TRANSCRIPTION_ENABLED: "true",
    AI_WHATSAPP_UNIT_ID: "unit-01",
  });
  const store = new InMemoryStore();
  const stockBefore = store.products.map((product) => [product.id, product.stockQty]);
  const salesBefore = store.productSales.length;
  const movementsBefore = store.stockMovements.length;
  const financialBefore = store.financialEntries.length;
  let downloads = 0;
  let outboundMessages = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("/chat/getBase64FromMediaMessage/")) {
      downloads += 1;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ base64: input.audio.toString("base64") }) } as Response;
    }
    if (target.includes("/message/sendText/")) {
      outboundMessages += 1;
      return { ok: true, status: 200, text: async () => "" } as Response;
    }
    throw new Error("unexpected_external_request");
  }) as typeof fetch;
  const app = createApp({ memoryStore: store, audioTranscriptionService: input.service, ownerCommandParser: null });
  try {
    const payload = {
      instance,
      data: {
        key: {
          id: `audio-doctor-${input.fingerprint}`,
          remoteJid: "123456789012345@lid",
          remoteJidAlt: `${ownerPhone}@s.whatsapp.net`,
          addressingMode: "lid",
          fromMe: false,
        },
        messageType: "audioMessage",
        message: {
          audioMessage: {
            mimetype: input.mimetype,
            fileLength: { low: input.audio.length, high: 0, unsigned: true },
            seconds: 5,
            ptt: true,
          },
        },
      },
    };
    const inject = () => app.inject({
      method: "POST",
      url: "/webhooks/evolution/whatsapp",
      headers: { "x-evolution-webhook-secret": webhookSecret },
      payload,
    });
    const first = await inject();
    const retry = await inject();
    const firstBody = first.json();
    const retryBody = retry.json();
    const preview = firstBody.preview && typeof firstBody.preview === "object"
      ? firstBody.preview as Record<string, unknown>
      : null;
    const operationalStateUnchanged = JSON.stringify(store.products.map((product) => [product.id, product.stockQty])) === JSON.stringify(stockBefore)
      && store.productSales.length === salesBefore
      && store.stockMovements.length === movementsBefore
      && store.financialEntries.length === financialBefore;
    return {
      ok: first.statusCode === 200 && retry.statusCode === 200 && operationalStateUnchanged,
      mode: "isolated_webhook",
      first: {
        statusCode: first.statusCode,
        intent: firstBody.intent ?? null,
        previewOnly: firstBody.mode === "preview_only",
        executed: firstBody.executed === true,
        reason: firstBody.reason ?? null,
      },
      retry: {
        statusCode: retry.statusCode,
        deduplicated: retryBody.deduplicated === true,
        executed: retryBody.executed === true,
      },
      downloads,
      outboundMessages,
      previewCount: store.aiWhatsappStockEntryPreviews.size,
      preview: preview ? {
        productId: preview.productId ?? null,
        productName: preview.productName ?? null,
        quantity: preview.quantity ?? null,
        unitCost: preview.unitCost ?? null,
        totalCost: preview.totalCost ?? null,
        salePrice: preview.salePrice ?? null,
      } : null,
      stockChanged: !operationalStateUnchanged,
      salesChanged: store.productSales.length !== salesBefore,
      movementsChanged: store.stockMovements.length !== movementsBefore,
      financialChanged: store.financialEntries.length !== financialBefore,
    };
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  loadLocalEnvironment();
  const requestedInput = getArgument("--input");
  if (!requestedInput) {
    console.error("Uso: npm run audio:doctor -- --input <arquivo-de-audio>");
    process.exitCode = 2;
    return;
  }
  const inputPath = path.resolve(requestedInput);
  const mimetype = getArgument("--mimetype") || inferMimetype(inputPath);
  if (!existsSync(inputPath) || !mimetype) {
    console.error(JSON.stringify({ ok: false, reason: !existsSync(inputPath) ? "input_missing" : "unsupported_extension" }));
    process.exitCode = 2;
    return;
  }
  process.env.AI_AUDIO_TRANSCRIPTION_ENABLED = "true";
  process.env.ASR_PROVIDER = "local_whisper";
  process.env.LOCAL_WHISPER_GPU_ENABLED = "true";
  process.env.LOCAL_WHISPER_STRUCTURED_LOGS = "true";
  const service = createAudioTranscriptionServiceFromEnv();
  if (!(service instanceof LocalWhisperAudioTranscriptionService)) {
    console.error(JSON.stringify({ ok: false, reason: "local_whisper_configuration_invalid" }));
    process.exitCode = 2;
    return;
  }
  const audio = await readFile(inputPath);
  const fingerprint = createHash("sha256").update(audio).digest("hex").slice(0, 12);
  const runDir = path.resolve(".runtime", "audio-diagnostics", `doctor-${Date.now()}-${fingerprint}`);
  await mkdir(runDir, { recursive: true });
  try {
    if (process.argv.includes("--webhook")) {
      const report = await runWebhookDiagnostic({ service, audio, mimetype, fingerprint });
      await writeFile(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(JSON.stringify(report));
      if (!report.ok || report.stockChanged || report.salesChanged || report.movementsChanged || report.financialChanged || !report.retry.deduplicated) {
        process.exitCode = 1;
      }
      return;
    }
    const result = await service.transcribe({
      audio,
      mimetype,
      correlationId: `audio-doctor-${fingerprint}`,
      pass: 1,
    });
    const transcriptPath = path.join(runDir, "transcript.txt");
    await writeFile(transcriptPath, result.transcript, "utf8");
    const report = {
      ok: true,
      input: path.basename(inputPath),
      inputBytes: audio.length,
      inputFingerprint: fingerprint,
      mimetype,
      provider: result.provider,
      transcriptLength: result.transcript.length,
      transcriptFingerprint: createHash("sha256").update(result.transcript).digest("hex").slice(0, 12),
      diagnostics: result.diagnostics,
      transcriptFile: path.relative(process.cwd(), transcriptPath).replace(/\\/g, "/"),
    };
    await writeFile(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report));
  } catch (error) {
    const report = error instanceof AudioTranscriptionError
      ? { ok: false, reason: error.reason, input: path.basename(inputPath), inputBytes: audio.length, inputFingerprint: fingerprint, diagnostics: error.diagnostics }
      : { ok: false, reason: "audio_doctor_unexpected_failure", input: path.basename(inputPath), inputBytes: audio.length, inputFingerprint: fingerprint };
    await writeFile(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  }
}

void main();
