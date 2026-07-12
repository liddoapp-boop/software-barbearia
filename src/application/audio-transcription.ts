export type AudioTranscriptionFailureReason =
  | "audio_transcription_unavailable"
  | "audio_transcription_429"
  | "audio_transcription_5xx"
  | "audio_transcription_timeout"
  | "audio_transcription_empty"
  | "audio_transcription_no_speech"
  | "audio_transcription_failed";

export class AudioTranscriptionError extends Error {
  constructor(
    public readonly reason: AudioTranscriptionFailureReason,
    message = "Nao foi possivel transcrever o audio.",
  ) {
    super(message);
    this.name = "AudioTranscriptionError";
  }
}

export type AudioTranscriptionResult = {
  transcript: string;
  provider: string;
  confidence?: number;
};

export interface AudioTranscriptionService {
  transcribe(input: { audio: Buffer; mimetype: string }): Promise<AudioTranscriptionResult>;
}

/**
 * Adapter deliberately limited to local/test use until a real transcription
 * provider is approved. It never persists or logs the supplied audio bytes.
 */
export class MockAudioTranscriptionService implements AudioTranscriptionService {
  constructor(
    private readonly transcript: string,
    private readonly failureReason?: AudioTranscriptionFailureReason,
  ) {}

  async transcribe(): Promise<AudioTranscriptionResult> {
    if (this.failureReason) throw new AudioTranscriptionError(this.failureReason);
    const transcript = this.transcript.trim().slice(0, 1000);
    if (!transcript) {
      throw new AudioTranscriptionError("audio_transcription_empty");
    }
    if (/^\[\s*(?:sem fala|no speech)\s*\]$/i.test(transcript)) {
      throw new AudioTranscriptionError("audio_transcription_no_speech");
    }
    return { transcript, provider: "mock" };
  }
}

export function createAudioTranscriptionServiceFromEnv(): AudioTranscriptionService | null {
  // A real provider is intentionally not inferred from Gemini credentials. Audio
  // uploads require an explicit, separately reviewed integration.
  if (String(process.env.AI_WHATSAPP_AUDIO_TRANSCRIPTION_MODE ?? "").trim().toLowerCase() !== "mock") {
    return null;
  }
  const configuredFailure = String(process.env.AI_WHATSAPP_AUDIO_MOCK_FAILURE ?? "").trim();
  const failureReasons: AudioTranscriptionFailureReason[] = [
    "audio_transcription_429",
    "audio_transcription_5xx",
    "audio_transcription_timeout",
    "audio_transcription_empty",
    "audio_transcription_no_speech",
    "audio_transcription_failed",
  ];
  const failureReason = failureReasons.includes(configuredFailure as AudioTranscriptionFailureReason)
    ? (configuredFailure as AudioTranscriptionFailureReason)
    : undefined;
  return new MockAudioTranscriptionService(process.env.AI_WHATSAPP_AUDIO_MOCK_TRANSCRIPT ?? "", failureReason);
}
