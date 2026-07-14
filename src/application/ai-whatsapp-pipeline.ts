export type AiWhatsappPipelineState =
  | "RECEIVED"
  | "UNAUTHORIZED"
  | "DUPLICATE"
  | "MEDIA_DOWNLOAD_FAILED"
  | "AUDIO_EMPTY"
  | "ASR_TRANSIENT_FAILURE"
  | "ASR_PERMANENT_FAILURE"
  | "TRANSCRIBED"
  | "SEMANTIC_TRANSIENT_FAILURE"
  | "SEMANTIC_PERMANENT_FAILURE"
  | "INVALID_STRUCTURED_OUTPUT"
  | "UNKNOWN_INTENT"
  | "MISSING_FIELDS"
  | "AMBIGUOUS_FIELDS"
  | "GROUNDING_FAILED"
  | "READY_FOR_PREVIEW"
  | "PREVIEW_SENT"
  | "CANCELLED"
  | "CONFIRMED"
  | "EXECUTION_FAILED"
  | "SUCCEEDED";

export class SingleWhatsappResponseGate {
  private attempted = false;

  get responseAttempted() {
    return this.attempted;
  }

  async send(send: () => Promise<void>) {
    if (this.attempted) return { attempted: false, delivered: false } as const;
    this.attempted = true;
    try {
      await send();
      return { attempted: true, delivered: true } as const;
    } catch (error) {
      return { attempted: true, delivered: false, error } as const;
    }
  }
}
