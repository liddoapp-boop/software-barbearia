import dotenv from "dotenv";
import { createApp } from "./http/app";
import {
  AudioTranscriptionError,
  AudioTranscriptionService,
  createAudioTranscriptionServiceFromEnv,
  isAudioTranscriptionEnabledFromEnv,
} from "./application/audio-transcription";
import { assertSafeServerEnvironment } from "./server-environment";

dotenv.config();

async function bootstrap() {
  const serverEnvironment = assertSafeServerEnvironment();
  const configuredProvider = String(process.env.ASR_PROVIDER ?? process.env.AI_AUDIO_TRANSCRIPTION_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  let audioTranscriptionService: AudioTranscriptionService | null | undefined;
  if (configuredProvider === "local_whisper" && isAudioTranscriptionEnabledFromEnv()) {
    audioTranscriptionService = createAudioTranscriptionServiceFromEnv();
    const warmupStartedAt = Date.now();
    if (audioTranscriptionService?.warmUp) {
      try {
        const result = await audioTranscriptionService.warmUp();
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          event: "audio.transcription.warmup.completed",
          enabled: true,
          ready: true,
          provider: "local_whisper",
          model: result.model,
          durationMs: result.durationMs,
        }));
      } catch (error) {
        const reason = error instanceof AudioTranscriptionError ? error.reason : "audio_transcription_unavailable";
        // O HTTP pode subir para texto e health, mas o canal de audio fica
        // fechado ate um restart com warm-up bem-sucedido.
        audioTranscriptionService = null;
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({
          event: "audio.transcription.warmup.failed",
          enabled: true,
          ready: false,
          provider: "local_whisper",
          reason,
          durationMs: Date.now() - warmupStartedAt,
        }));
      }
    } else {
      audioTranscriptionService = null;
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({
        event: "audio.transcription.warmup.failed",
        enabled: true,
        ready: false,
        provider: "local_whisper",
        reason: "audio_transcription_unavailable",
        durationMs: Date.now() - warmupStartedAt,
      }));
    }
  }
  const app = audioTranscriptionService === undefined
    ? createApp()
    : createApp({ audioTranscriptionService });
  const { port, host } = serverEnvironment;
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`API online em http://${host}:${port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
