import crypto from "node:crypto";
import { isIP } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { InMemoryStore } from "../infrastructure/in-memory-store";
import { normalizeWhatsappRecipient, WhatsappDeliveryError } from "../notifications";
import {
  ReactivationAnalysisService,
  ReactivationCandidate,
  ReactivationExclusionReason,
  ReactivationSegment,
} from "./reactivation-analysis";

export type ReactivationCampaignStatus = "DRAFT" | "SENDING" | "COMPLETED" | "PARTIAL" | "CANCELLED";
export type ReactivationRecipientStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "UNCERTAIN" | "SKIPPED";
export type ReactivationRecipientAuditEvent =
  | "CLAIM_OBTAINED"
  | "PROVIDER_CALL_STARTED"
  | "SEND_CONFIRMED"
  | "FAILURE_CONFIRMED"
  | "DELIVERY_UNCERTAIN"
  | "RECIPIENT_SKIPPED"
  | "OUTBOUND_BLOCKED"
  | "STALE_CLAIM_RECOVERED"
  | "OPT_OUT_RECEIVED";
type EligibleSegment = Exclude<ReactivationSegment, "NOT_ELIGIBLE">;

export type ReactivationCampaignRecord = {
  id: string;
  unitId: string;
  ownerId: string;
  status: ReactivationCampaignStatus;
  analyzedClients: number;
  eligibleClients: number;
  selectedCount: number;
  segmentCounts: Record<EligibleSegment, number>;
  exclusions: Record<ReactivationExclusionReason, number>;
  maxRecipients: number;
  confirmedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReactivationRecipientRecord = {
  id: string;
  campaignId: string;
  clientId: string;
  segment: EligibleSegment;
  phoneSnapshot: string;
  phoneMasked: string;
  message: string;
  delayDays: number;
  status: ReactivationRecipientStatus;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  attemptId: string;
  openClientKey: string | null;
  skipReason: string | null;
  errorCode: string | null;
  claimedAt: Date | null;
  providerCallStartedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReactivationRecipientAuditRecord = {
  id: string;
  eventKey: string;
  unitId: string;
  campaignId: string | null;
  recipientId: string | null;
  attemptId: string | null;
  event: ReactivationRecipientAuditEvent;
  state: ReactivationRecipientStatus | null;
  reason: string;
  createdAt: Date;
};

export type ReactivationCampaignPreview = {
  campaignId: string;
  status: ReactivationCampaignStatus;
  analyzedClients: number;
  eligibleClients: number;
  selected: number;
  segments: Record<EligibleSegment, number>;
  exclusions: Record<ReactivationExclusionReason, number>;
  examples: Array<{ firstName: string; phoneMasked: string; segment: EligibleSegment; message: string }>;
  messagesSent: 0;
};

export type ReactivationCampaignSummary = {
  campaignId: string;
  selected: number;
  sent: number;
  skipped: number;
  failed: number;
  uncertain: number;
  pending: number;
  processing: number;
  duplicateMessages: 0;
  status: ReactivationCampaignStatus;
  replay: boolean;
};

type DraftInput = {
  campaign: ReactivationCampaignRecord;
  recipients: ReactivationRecipientRecord[];
};

export type ReactivationClaimRecovery = {
  requeued: number;
  uncertain: number;
};

export interface ReactivationCampaignRepository {
  resolvePhones(unitId: string, clientIds: string[]): Promise<Map<string, string>>;
  replaceDraft(input: DraftInput): Promise<void>;
  findDraft(unitId: string, ownerId: string): Promise<ReactivationCampaignRecord | null>;
  findLatest(unitId: string, ownerId: string): Promise<ReactivationCampaignRecord | null>;
  claimCampaign(campaignId: string, now: Date): Promise<boolean>;
  listRecipients(campaignId: string): Promise<ReactivationRecipientRecord[]>;
  claimRecipient(recipientId: string, now: Date): Promise<ReactivationRecipientRecord | null>;
  markProviderCallStarted(recipientId: string, attemptId: string, now: Date): Promise<boolean>;
  markRecipientSent(recipientId: string, attemptId: string, now: Date): Promise<void>;
  markRecipientSkipped(recipientId: string, reason: string, now: Date): Promise<void>;
  markRecipientFailed(recipientId: string, attemptId: string, errorCode: string, reason: string, now: Date): Promise<void>;
  markRecipientUncertain(recipientId: string, attemptId: string, errorCode: string, reason: string, now: Date): Promise<void>;
  recoverStaleClaims(campaignId: string, staleBefore: Date, now: Date): Promise<ReactivationClaimRecovery>;
  finishCampaign(campaignId: string, status: "COMPLETED" | "PARTIAL", now: Date): Promise<void>;
  cancelCampaign(campaignId: string, now: Date): Promise<boolean>;
  optOutByPhone(unitId: string, normalizedPhone: string, now: Date): Promise<{
    clientId: string;
    matchedClients: number;
    changedClients: number;
    phoneMasked: string;
    cancelledPending: number;
  } | null>;
  listAudits(campaignId?: string): Promise<ReactivationRecipientAuditRecord[]>;
}

function normalizePhone(value: string | null | undefined) {
  const normalized = normalizeWhatsappRecipient(String(value ?? ""));
  return /^\d{12,13}$/.test(normalized) && !/^(\d)\1+$/.test(normalized) ? normalized : null;
}

function maskPhone(phone: string) {
  return `(**) *****-${phone.slice(-4)}`;
}

function nowRecord<T extends { updatedAt: Date }>(record: T, now: Date) {
  record.updatedAt = now;
  return record;
}

function openClientKey(unitId: string, clientId: string) {
  return `${unitId}:${clientId}`;
}

function auditEventKey(parts: Array<string | Date | null | undefined>) {
  return parts.map((part) => part instanceof Date ? part.toISOString() : String(part ?? "-")).join(":");
}

function phoneFingerprint(normalizedPhone: string) {
  return crypto.createHash("sha256").update(normalizedPhone).digest("hex").slice(0, 16);
}

export class ReactivationCampaignConflictError extends Error {
  constructor(readonly reason: "CAMPAIGN_SENDING" | "CLIENT_IN_OPEN_CAMPAIGN" | "OPEN_CAMPAIGN_CONFLICT") {
    super(reason);
    this.name = "ReactivationCampaignConflictError";
  }
}

export const REACTIVATION_PUBLIC_BOOKING_URL_ERROR =
  "Campanha de reativacao indisponivel: link publico de agendamento ausente ou invalido.";

export class ReactivationCampaignConfigurationError extends Error {
  readonly reason = "PUBLIC_BOOKING_URL_INVALID";

  constructor() {
    super(REACTIVATION_PUBLIC_BOOKING_URL_ERROR);
    this.name = "ReactivationCampaignConfigurationError";
  }
}

function isPrivateOrInternalHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".localdomain")
    || !hostname.includes(".")
  ) return true;

  if (isIP(hostname) === 4) {
    const parts = hostname.split(".").map(Number);
    return parts[0] === 0
      || parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  }
  if (isIP(hostname) === 6) {
    return hostname === "::"
      || hostname === "::1"
      || hostname.startsWith("::ffff:")
      || hostname.startsWith("fc")
      || hostname.startsWith("fd")
      || hostname.startsWith("fe80:");
  }
  return false;
}

export function resolveReactivationPublicBookingUrl(rawValue: string | undefined, unitId: string) {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw.length > 2_048) throw new ReactivationCampaignConfigurationError();
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const unitIds = url.searchParams.getAll("unitId");
    const sensitiveQuery = [...url.searchParams.keys()].some((key) =>
      /(?:api[_-]?key|authorization|credential|password|secret|token)/i.test(key));
    if (
      url.protocol !== "https:"
      || Boolean(url.username || url.password || url.hash)
      || Boolean(url.port && url.port !== "443")
      || isPrivateOrInternalHostname(url.hostname)
      || path !== "/agendamento"
      || unitIds.length !== 1
      || unitIds[0] !== unitId
      || sensitiveQuery
    ) throw new ReactivationCampaignConfigurationError();
    return url.toString();
  } catch (error) {
    if (error instanceof ReactivationCampaignConfigurationError) throw error;
    throw new ReactivationCampaignConfigurationError();
  }
}

export function buildDefaultReactivationMessage(input: {
  firstName: string;
  barbershopName: string;
  publicBookingUrl: string;
}) {
  return [
    `Olá, ${input.firstName}! Como você está?`,
    "",
    `Que tal dar uma renovada no corte? Será um prazer receber você novamente na ${input.barbershopName}.`,
    "",
    "Escolha o melhor dia e horário pelo nosso agendamento:",
    input.publicBookingUrl,
    "",
    "Se preferir não receber mais mensagens como esta, responda SAIR.",
  ].join("\n");
}

export class MemoryReactivationCampaignRepository implements ReactivationCampaignRepository {
  constructor(private readonly store: InMemoryStore) {}

  private recordAudit(input: Omit<ReactivationRecipientAuditRecord, "id">) {
    if (this.store.reactivationRecipientAudits.some((item) => item.eventKey === input.eventKey)) return;
    this.store.reactivationRecipientAudits.push({ id: crypto.randomUUID(), ...input });
  }

  private auditRecipient(
    recipient: ReactivationRecipientRecord,
    event: ReactivationRecipientAuditEvent,
    state: ReactivationRecipientStatus,
    reason: string,
    now: Date,
    eventKey: string,
  ) {
    const campaign = this.store.reactivationCampaigns.find((item) => item.id === recipient.campaignId);
    if (!campaign) throw new Error("Campanha da auditoria nao encontrada");
    this.recordAudit({
      eventKey,
      unitId: campaign.unitId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      attemptId: recipient.attemptId,
      event,
      state,
      reason,
      createdAt: now,
    });
  }

  async resolvePhones(unitId: string, clientIds: string[]) {
    const allowed = new Set(clientIds);
    return new Map(this.store.clients
      .filter((client) => (client.businessId ?? "unit-01") === unitId && allowed.has(client.id))
      .flatMap((client) => {
        const phone = normalizePhone(client.phone);
        return phone ? [[client.id, phone] as const] : [];
      }));
  }

  async replaceDraft(input: DraftInput) {
    const now = input.campaign.createdAt;
    const sending = this.store.reactivationCampaigns.some((campaign) =>
      campaign.unitId === input.campaign.unitId
      && campaign.ownerId === input.campaign.ownerId
      && campaign.status === "SENDING");
    if (sending) throw new ReactivationCampaignConflictError("CAMPAIGN_SENDING");

    const replacedCampaignIds = new Set(this.store.reactivationCampaigns
      .filter((campaign) =>
        campaign.unitId === input.campaign.unitId
        && campaign.ownerId === input.campaign.ownerId
        && campaign.status === "DRAFT")
      .map((campaign) => campaign.id));
    const conflictingClient = input.recipients.some((candidate) =>
      this.store.reactivationRecipients.some((recipient) =>
        recipient.openClientKey === candidate.openClientKey
        && !replacedCampaignIds.has(recipient.campaignId)));
    if (conflictingClient) throw new ReactivationCampaignConflictError("CLIENT_IN_OPEN_CAMPAIGN");

    for (const campaign of this.store.reactivationCampaigns) {
      if (campaign.unitId === input.campaign.unitId && campaign.ownerId === input.campaign.ownerId && campaign.status === "DRAFT") {
        campaign.status = "CANCELLED";
        campaign.cancelledAt = now;
        nowRecord(campaign, now);
        for (const recipient of this.store.reactivationRecipients) {
          if (recipient.campaignId === campaign.id && recipient.status === "PENDING") {
            recipient.status = "SKIPPED";
            recipient.openClientKey = null;
            recipient.skipReason = "DRAFT_REPLACED";
            nowRecord(recipient, now);
            this.auditRecipient(
              recipient,
              "RECIPIENT_SKIPPED",
              "SKIPPED",
              "DRAFT_REPLACED",
              now,
              auditEventKey([recipient.id, "RECIPIENT_SKIPPED", "DRAFT_REPLACED"]),
            );
          }
        }
        for (const recipient of this.store.reactivationRecipients) {
          if (recipient.campaignId === campaign.id) recipient.openClientKey = null;
        }
      }
    }
    this.store.reactivationCampaigns.push(input.campaign);
    this.store.reactivationRecipients.push(...input.recipients);
  }

  async findDraft(unitId: string, ownerId: string) {
    return [...this.store.reactivationCampaigns]
      .reverse()
      .find((item) => item.unitId === unitId && item.ownerId === ownerId && item.status === "DRAFT") ?? null;
  }

  async findLatest(unitId: string, ownerId: string) {
    return [...this.store.reactivationCampaigns]
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.unitId === unitId && item.ownerId === ownerId)
      .sort((a, b) => b.item.updatedAt.getTime() - a.item.updatedAt.getTime()
        || b.item.createdAt.getTime() - a.item.createdAt.getTime()
        || b.index - a.index)[0]?.item ?? null;
  }

  async claimCampaign(campaignId: string, now: Date) {
    const campaign = this.store.reactivationCampaigns.find((item) => item.id === campaignId);
    if (!campaign || campaign.status !== "DRAFT") return false;
    campaign.status = "SENDING";
    campaign.confirmedAt = now;
    nowRecord(campaign, now);
    return true;
  }

  async listRecipients(campaignId: string) {
    return this.store.reactivationRecipients.filter((item) => item.campaignId === campaignId);
  }

  async claimRecipient(recipientId: string, now: Date) {
    const recipient = this.store.reactivationRecipients.find((item) => item.id === recipientId);
    if (!recipient || recipient.status !== "PENDING") return null;
    recipient.status = "SENDING";
    recipient.claimedAt = now;
    recipient.errorCode = null;
    nowRecord(recipient, now);
    this.auditRecipient(
      recipient,
      "CLAIM_OBTAINED",
      "SENDING",
      "PENDING_TO_SENDING",
      now,
      auditEventKey([recipient.id, "CLAIM_OBTAINED", now]),
    );
    return recipient;
  }

  async markProviderCallStarted(recipientId: string, attemptId: string, now: Date) {
    const recipient = this.store.reactivationRecipients.find((item) => item.id === recipientId);
    if (!recipient || recipient.status !== "SENDING" || recipient.attemptId !== attemptId || recipient.providerCallStartedAt) return false;
    recipient.providerCallStartedAt = now;
    recipient.attempts += 1;
    nowRecord(recipient, now);
    this.auditRecipient(
      recipient,
      "PROVIDER_CALL_STARTED",
      "SENDING",
      "PROVIDER_CALL_DISPATCHED",
      now,
      auditEventKey([recipient.id, "PROVIDER_CALL_STARTED", attemptId]),
    );
    return true;
  }

  async markRecipientSent(recipientId: string, attemptId: string, now: Date) {
    const recipient = this.store.reactivationRecipients.find((item) => item.id === recipientId);
    if (!recipient || recipient.status !== "SENDING" || recipient.attemptId !== attemptId) return;
    recipient.status = "SENT";
    recipient.sentAt = now;
    nowRecord(recipient, now);
    this.auditRecipient(
      recipient,
      "SEND_CONFIRMED",
      "SENT",
      "PROVIDER_ACCEPTED",
      now,
      auditEventKey([recipient.id, "SEND_CONFIRMED", attemptId]),
    );
  }

  async markRecipientSkipped(recipientId: string, reason: string, now: Date) {
    const recipient = this.store.reactivationRecipients.find((item) => item.id === recipientId);
    if (
      !recipient
      || !["PENDING", "SENDING"].includes(recipient.status)
      || recipient.providerCallStartedAt
    ) return;
    recipient.status = "SKIPPED";
    recipient.skipReason = reason;
    nowRecord(recipient, now);
    this.auditRecipient(
      recipient,
      "RECIPIENT_SKIPPED",
      "SKIPPED",
      reason,
      now,
      auditEventKey([recipient.id, "RECIPIENT_SKIPPED", reason]),
    );
  }

  async markRecipientFailed(recipientId: string, attemptId: string, errorCode: string, reason: string, now: Date) {
    const recipient = this.store.reactivationRecipients.find((item) => item.id === recipientId);
    if (!recipient || recipient.status !== "SENDING" || recipient.attemptId !== attemptId) return;
    recipient.status = "FAILED";
    recipient.errorCode = errorCode;
    nowRecord(recipient, now);
    this.auditRecipient(
      recipient,
      "FAILURE_CONFIRMED",
      "FAILED",
      reason,
      now,
      auditEventKey([recipient.id, "FAILURE_CONFIRMED", attemptId]),
    );
    if (reason.startsWith("ISOLATED_OUTBOUND_")) {
      this.auditRecipient(
        recipient,
        "OUTBOUND_BLOCKED",
        "FAILED",
        reason,
        now,
        auditEventKey([recipient.id, "OUTBOUND_BLOCKED", attemptId]),
      );
    }
  }

  async markRecipientUncertain(recipientId: string, attemptId: string, errorCode: string, reason: string, now: Date) {
    const recipient = this.store.reactivationRecipients.find((item) => item.id === recipientId);
    if (!recipient || recipient.status !== "SENDING" || recipient.attemptId !== attemptId) return;
    recipient.status = "UNCERTAIN";
    recipient.errorCode = errorCode;
    nowRecord(recipient, now);
    this.auditRecipient(
      recipient,
      "DELIVERY_UNCERTAIN",
      "UNCERTAIN",
      reason,
      now,
      auditEventKey([recipient.id, "DELIVERY_UNCERTAIN", attemptId]),
    );
  }

  async recoverStaleClaims(campaignId: string, staleBefore: Date, now: Date) {
    const result: ReactivationClaimRecovery = { requeued: 0, uncertain: 0 };
    for (const recipient of this.store.reactivationRecipients) {
      if (
        recipient.campaignId !== campaignId
        || recipient.status !== "SENDING"
        || !recipient.claimedAt
        || recipient.claimedAt > staleBefore
      ) continue;
      const previousClaimedAt = recipient.claimedAt;
      if (recipient.providerCallStartedAt) {
        recipient.status = "UNCERTAIN";
        recipient.errorCode = "STALE_AFTER_PROVIDER_START";
        result.uncertain += 1;
        this.auditRecipient(
          recipient,
          "STALE_CLAIM_RECOVERED",
          "UNCERTAIN",
          "CLAIM_EXPIRED_AFTER_PROVIDER_START",
          now,
          auditEventKey([recipient.id, "STALE_CLAIM_RECOVERED", previousClaimedAt, "UNCERTAIN"]),
        );
        this.auditRecipient(
          recipient,
          "DELIVERY_UNCERTAIN",
          "UNCERTAIN",
          "CLAIM_EXPIRED_AFTER_PROVIDER_START",
          now,
          auditEventKey([recipient.id, "DELIVERY_UNCERTAIN", recipient.attemptId]),
        );
      } else {
        recipient.status = "PENDING";
        recipient.claimedAt = null;
        recipient.errorCode = null;
        result.requeued += 1;
        this.auditRecipient(
          recipient,
          "STALE_CLAIM_RECOVERED",
          "PENDING",
          "CLAIM_EXPIRED_BEFORE_PROVIDER_START",
          now,
          auditEventKey([recipient.id, "STALE_CLAIM_RECOVERED", previousClaimedAt, "PENDING"]),
        );
      }
      nowRecord(recipient, now);
    }
    return result;
  }

  async finishCampaign(campaignId: string, status: "COMPLETED" | "PARTIAL", now: Date) {
    const campaign = this.store.reactivationCampaigns.find((item) => item.id === campaignId);
    if (!campaign || campaign.status !== "SENDING") return;
    campaign.status = status;
    campaign.completedAt = now;
    nowRecord(campaign, now);
    for (const recipient of this.store.reactivationRecipients) {
      if (recipient.campaignId === campaignId) recipient.openClientKey = null;
    }
  }

  async cancelCampaign(campaignId: string, now: Date) {
    const campaign = this.store.reactivationCampaigns.find((item) => item.id === campaignId);
    if (!campaign || campaign.status !== "DRAFT") return false;
    campaign.status = "CANCELLED";
    campaign.cancelledAt = now;
    nowRecord(campaign, now);
    for (const recipient of this.store.reactivationRecipients) {
      if (recipient.campaignId === campaignId && recipient.status === "PENDING") {
        recipient.status = "SKIPPED";
        recipient.openClientKey = null;
        recipient.skipReason = "CAMPAIGN_CANCELLED";
        nowRecord(recipient, now);
        this.auditRecipient(
          recipient,
          "RECIPIENT_SKIPPED",
          "SKIPPED",
          "CAMPAIGN_CANCELLED",
          now,
          auditEventKey([recipient.id, "RECIPIENT_SKIPPED", "CAMPAIGN_CANCELLED"]),
        );
      }
    }
    for (const recipient of this.store.reactivationRecipients) {
      if (recipient.campaignId === campaignId) recipient.openClientKey = null;
    }
    return true;
  }

  async optOutByPhone(unitId: string, normalizedPhone: string, now: Date) {
    const clients = this.store.clients.filter((item) =>
      (item.businessId ?? "unit-01") === unitId && normalizePhone(item.phone) === normalizedPhone);
    if (!clients.length) return null;
    const changedClients = clients.filter((client) => !client.whatsappOptOut).length;
    for (const client of clients) client.whatsappOptOut = true;
    const clientIds = new Set(clients.map((client) => client.id));
    let cancelledPending = 0;
    for (const recipient of this.store.reactivationRecipients) {
      const campaign = this.store.reactivationCampaigns.find((item) => item.id === recipient.campaignId);
      if (
        clientIds.has(recipient.clientId)
        && campaign?.unitId === unitId
        && (recipient.status === "PENDING" || (recipient.status === "SENDING" && !recipient.providerCallStartedAt))
      ) {
        recipient.status = "SKIPPED";
        recipient.skipReason = "WHATSAPP_OPT_OUT";
        nowRecord(recipient, now);
        cancelledPending += 1;
        this.auditRecipient(
          recipient,
          "RECIPIENT_SKIPPED",
          "SKIPPED",
          "WHATSAPP_OPT_OUT",
          now,
          auditEventKey([recipient.id, "RECIPIENT_SKIPPED", "WHATSAPP_OPT_OUT"]),
        );
      }
    }
    this.recordAudit({
      eventKey: auditEventKey([unitId, "OPT_OUT_RECEIVED", phoneFingerprint(normalizedPhone)]),
      unitId,
      campaignId: null,
      recipientId: null,
      attemptId: null,
      event: "OPT_OUT_RECEIVED",
      state: null,
      reason: "NORMALIZED_PHONE_MATCH",
      createdAt: now,
    });
    return {
      clientId: clients[0]!.id,
      matchedClients: clients.length,
      changedClients,
      phoneMasked: maskPhone(normalizedPhone),
      cancelledPending,
    };
  }

  async listAudits(campaignId?: string): Promise<ReactivationRecipientAuditRecord[]> {
    return this.store.reactivationRecipientAudits.filter((item) => campaignId ? item.campaignId === campaignId : true);
  }
}

function asCampaign(row: any): ReactivationCampaignRecord {
  return { ...row, segmentCounts: row.segmentCounts as ReactivationCampaignRecord["segmentCounts"], exclusions: row.exclusions as ReactivationCampaignRecord["exclusions"] };
}

export class PrismaReactivationCampaignRepository implements ReactivationCampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}
  private get db(): any { return this.prisma as any; }

  private async recordAudits(db: any, events: Array<Omit<ReactivationRecipientAuditRecord, "id">>) {
    if (!events.length) return;
    await db.reactivationRecipientAudit.createMany({
      data: events.map((event) => ({ id: crypto.randomUUID(), ...event })),
      skipDuplicates: true,
    });
  }

  private recipientAudit(
    recipient: ReactivationRecipientRecord & { campaign: { unitId: string } },
    event: ReactivationRecipientAuditEvent,
    state: ReactivationRecipientStatus,
    reason: string,
    now: Date,
    eventKey: string,
  ): Omit<ReactivationRecipientAuditRecord, "id"> {
    return {
      eventKey,
      unitId: recipient.campaign.unitId,
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      attemptId: recipient.attemptId,
      event,
      state,
      reason,
      createdAt: now,
    };
  }

  async resolvePhones(unitId: string, clientIds: string[]) {
    const clients = await this.prisma.client.findMany({ where: { businessId: unitId, id: { in: clientIds } }, select: { id: true, phone: true } });
    return new Map(clients.flatMap((client) => {
      const phone = normalizePhone(client.phone);
      return phone ? [[client.id, phone] as const] : [];
    }));
  }

  async replaceDraft(input: DraftInput) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const tx = transaction as any;
        const lockKey = `reactivation-campaign:${input.campaign.unitId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

        const sending = await tx.reactivationCampaign.findFirst({
          where: { unitId: input.campaign.unitId, ownerId: input.campaign.ownerId, status: "SENDING" },
          select: { id: true },
        });
        if (sending) throw new ReactivationCampaignConflictError("CAMPAIGN_SENDING");

        const old = await tx.reactivationCampaign.findMany({
          where: { unitId: input.campaign.unitId, ownerId: input.campaign.ownerId, status: "DRAFT" },
          select: { id: true },
        });
        const oldIds = old.map((item: { id: string }) => item.id);
        if (oldIds.length) {
          const skipped = await tx.reactivationCampaignRecipient.findMany({
            where: { campaignId: { in: oldIds }, status: "PENDING" },
            include: { campaign: { select: { unitId: true } } },
          });
          await tx.reactivationCampaignRecipient.updateMany({
            where: { campaignId: { in: oldIds }, status: "PENDING" },
            data: { status: "SKIPPED", skipReason: "DRAFT_REPLACED", openClientKey: null },
          });
          await tx.reactivationCampaignRecipient.updateMany({
            where: { campaignId: { in: oldIds } },
            data: { openClientKey: null },
          });
          await this.recordAudits(tx, skipped.map((recipient: any) => this.recipientAudit(
            recipient,
            "RECIPIENT_SKIPPED",
            "SKIPPED",
            "DRAFT_REPLACED",
            input.campaign.createdAt,
            auditEventKey([recipient.id, "RECIPIENT_SKIPPED", "DRAFT_REPLACED"]),
          )));
          await tx.reactivationCampaign.updateMany({
            where: { id: { in: oldIds }, status: "DRAFT" },
            data: { status: "CANCELLED", cancelledAt: input.campaign.createdAt },
          });
        }

        const newKeys = input.recipients.map((recipient) => recipient.openClientKey).filter(Boolean);
        const conflicting = newKeys.length
          ? await tx.reactivationCampaignRecipient.findFirst({
              where: { openClientKey: { in: newKeys } },
              select: { id: true },
            })
          : null;
        if (conflicting) throw new ReactivationCampaignConflictError("CLIENT_IN_OPEN_CAMPAIGN");

        await tx.reactivationCampaign.create({
          data: {
            ...input.campaign,
            recipients: { create: input.recipients.map(({ campaignId: _campaignId, ...recipient }) => recipient) },
          },
        });
      });
    } catch (error) {
      if (error instanceof ReactivationCampaignConflictError) throw error;
      const code = (error as { code?: string })?.code;
      if (code === "P2002") throw new ReactivationCampaignConflictError("OPEN_CAMPAIGN_CONFLICT");
      throw error;
    }
  }

  async findDraft(unitId: string, ownerId: string) {
    const row = await this.db.reactivationCampaign.findFirst({ where: { unitId, ownerId, status: "DRAFT" }, orderBy: { createdAt: "desc" } });
    return row ? asCampaign(row) : null;
  }

  async findLatest(unitId: string, ownerId: string) {
    const row = await this.db.reactivationCampaign.findFirst({
      where: { unitId, ownerId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return row ? asCampaign(row) : null;
  }

  async claimCampaign(campaignId: string, now: Date) {
    const result = await this.db.reactivationCampaign.updateMany({ where: { id: campaignId, status: "DRAFT" }, data: { status: "SENDING", confirmedAt: now } });
    return result.count === 1;
  }

  async listRecipients(campaignId: string) {
    return await this.db.reactivationCampaignRecipient.findMany({ where: { campaignId }, orderBy: [{ delayDays: "desc" }, { clientId: "asc" }] });
  }

  async claimRecipient(recipientId: string, now: Date) {
    return await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const updated = await tx.reactivationCampaignRecipient.updateMany({
        where: { id: recipientId, status: "PENDING" },
        data: { status: "SENDING", claimedAt: now, errorCode: null },
      });
      if (updated.count !== 1) return null;
      const recipient = await tx.reactivationCampaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: { select: { unitId: true } } },
      });
      if (!recipient) throw new Error("Destinatario obtido no claim nao encontrado");
      await this.recordAudits(tx, [this.recipientAudit(
        recipient,
        "CLAIM_OBTAINED",
        "SENDING",
        "PENDING_TO_SENDING",
        now,
        auditEventKey([recipient.id, "CLAIM_OBTAINED", now]),
      )]);
      const { campaign: _campaign, ...record } = recipient;
      return record;
    });
  }

  async markProviderCallStarted(recipientId: string, attemptId: string, now: Date) {
    return await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaignRecipient.updateMany({
        where: { id: recipientId, attemptId, status: "SENDING", providerCallStartedAt: null },
        data: { providerCallStartedAt: now, attempts: { increment: 1 } },
      });
      if (result.count !== 1) return false;
      const recipient = await tx.reactivationCampaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: { select: { unitId: true } } },
      });
      if (!recipient) throw new Error("Destinatario iniciado nao encontrado");
      await this.recordAudits(tx, [this.recipientAudit(
        recipient,
        "PROVIDER_CALL_STARTED",
        "SENDING",
        "PROVIDER_CALL_DISPATCHED",
        now,
        auditEventKey([recipient.id, "PROVIDER_CALL_STARTED", attemptId]),
      )]);
      return true;
    });
  }

  async markRecipientSent(recipientId: string, attemptId: string, now: Date) {
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaignRecipient.updateMany({
        where: { id: recipientId, attemptId, status: "SENDING" },
        data: { status: "SENT", sentAt: now },
      });
      if (result.count !== 1) return;
      const recipient = await tx.reactivationCampaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: { select: { unitId: true } } },
      });
      await this.recordAudits(tx, [this.recipientAudit(
        recipient,
        "SEND_CONFIRMED",
        "SENT",
        "PROVIDER_ACCEPTED",
        now,
        auditEventKey([recipient.id, "SEND_CONFIRMED", attemptId]),
      )]);
    });
  }

  async markRecipientSkipped(recipientId: string, reason: string, now: Date) {
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaignRecipient.updateMany({
        where: { id: recipientId, status: { in: ["PENDING", "SENDING"] }, providerCallStartedAt: null },
        data: { status: "SKIPPED", skipReason: reason },
      });
      if (result.count !== 1) return;
      const recipient = await tx.reactivationCampaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: { select: { unitId: true } } },
      });
      await this.recordAudits(tx, [this.recipientAudit(
        recipient,
        "RECIPIENT_SKIPPED",
        "SKIPPED",
        reason,
        now,
        auditEventKey([recipient.id, "RECIPIENT_SKIPPED", reason]),
      )]);
    });
  }

  async markRecipientFailed(recipientId: string, attemptId: string, errorCode: string, reason: string, now: Date) {
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaignRecipient.updateMany({
        where: { id: recipientId, attemptId, status: "SENDING" },
        data: { status: "FAILED", errorCode },
      });
      if (result.count !== 1) return;
      const recipient = await tx.reactivationCampaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: { select: { unitId: true } } },
      });
      const audits = [this.recipientAudit(
        recipient,
        "FAILURE_CONFIRMED",
        "FAILED",
        reason,
        now,
        auditEventKey([recipient.id, "FAILURE_CONFIRMED", attemptId]),
      )];
      if (reason.startsWith("ISOLATED_OUTBOUND_")) {
        audits.push(this.recipientAudit(
          recipient,
          "OUTBOUND_BLOCKED",
          "FAILED",
          reason,
          now,
          auditEventKey([recipient.id, "OUTBOUND_BLOCKED", attemptId]),
        ));
      }
      await this.recordAudits(tx, audits);
    });
  }

  async markRecipientUncertain(recipientId: string, attemptId: string, errorCode: string, reason: string, now: Date) {
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaignRecipient.updateMany({
        where: { id: recipientId, attemptId, status: "SENDING" },
        data: { status: "UNCERTAIN", errorCode },
      });
      if (result.count !== 1) return;
      const recipient = await tx.reactivationCampaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: { select: { unitId: true } } },
      });
      await this.recordAudits(tx, [this.recipientAudit(
        recipient,
        "DELIVERY_UNCERTAIN",
        "UNCERTAIN",
        reason,
        now,
        auditEventKey([recipient.id, "DELIVERY_UNCERTAIN", attemptId]),
      )]);
    });
  }

  async recoverStaleClaims(campaignId: string, staleBefore: Date, now: Date) {
    return await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const stale = await tx.reactivationCampaignRecipient.findMany({
        where: { campaignId, status: "SENDING", claimedAt: { lte: staleBefore } },
        include: { campaign: { select: { unitId: true } } },
      });
      const result: ReactivationClaimRecovery = { requeued: 0, uncertain: 0 };
      for (const recipient of stale) {
        const targetState: "PENDING" | "UNCERTAIN" = recipient.providerCallStartedAt ? "UNCERTAIN" : "PENDING";
        const updated = await tx.reactivationCampaignRecipient.updateMany({
          where: { id: recipient.id, status: "SENDING", claimedAt: recipient.claimedAt },
          data: targetState === "UNCERTAIN"
            ? { status: "UNCERTAIN", errorCode: "STALE_AFTER_PROVIDER_START" }
            : { status: "PENDING", claimedAt: null, errorCode: null },
        });
        if (updated.count !== 1) continue;
        if (targetState === "UNCERTAIN") result.uncertain += 1;
        else result.requeued += 1;
        const recoveryAudits = [this.recipientAudit(
          recipient,
          "STALE_CLAIM_RECOVERED",
          targetState,
          targetState === "UNCERTAIN"
            ? "CLAIM_EXPIRED_AFTER_PROVIDER_START"
            : "CLAIM_EXPIRED_BEFORE_PROVIDER_START",
          now,
          auditEventKey([recipient.id, "STALE_CLAIM_RECOVERED", recipient.claimedAt, targetState]),
        )];
        if (targetState === "UNCERTAIN") {
          recoveryAudits.push(this.recipientAudit(
            recipient,
            "DELIVERY_UNCERTAIN",
            "UNCERTAIN",
            "CLAIM_EXPIRED_AFTER_PROVIDER_START",
            now,
            auditEventKey([recipient.id, "DELIVERY_UNCERTAIN", recipient.attemptId]),
          ));
        }
        await this.recordAudits(tx, recoveryAudits);
      }
      return result;
    });
  }

  async finishCampaign(campaignId: string, status: "COMPLETED" | "PARTIAL", now: Date) {
    await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaign.updateMany({
        where: { id: campaignId, status: "SENDING" },
        data: { status, completedAt: now },
      });
      if (result.count === 1) {
        await tx.reactivationCampaignRecipient.updateMany({ where: { campaignId }, data: { openClientKey: null } });
      }
    });
  }

  async cancelCampaign(campaignId: string, now: Date) {
    return await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const result = await tx.reactivationCampaign.updateMany({ where: { id: campaignId, status: "DRAFT" }, data: { status: "CANCELLED", cancelledAt: now } });
      if (result.count !== 1) return false;
      const recipients = await tx.reactivationCampaignRecipient.findMany({
        where: { campaignId, status: "PENDING" },
        include: { campaign: { select: { unitId: true } } },
      });
      await tx.reactivationCampaignRecipient.updateMany({
        where: { campaignId, status: "PENDING" },
        data: { status: "SKIPPED", skipReason: "CAMPAIGN_CANCELLED", openClientKey: null },
      });
      await tx.reactivationCampaignRecipient.updateMany({ where: { campaignId }, data: { openClientKey: null } });
      await this.recordAudits(tx, recipients.map((recipient: any) => this.recipientAudit(
        recipient,
        "RECIPIENT_SKIPPED",
        "SKIPPED",
        "CAMPAIGN_CANCELLED",
        now,
        auditEventKey([recipient.id, "RECIPIENT_SKIPPED", "CAMPAIGN_CANCELLED"]),
      )));
      return true;
    });
  }

  async optOutByPhone(unitId: string, normalizedPhone: string, now: Date) {
    return await this.prisma.$transaction(async (transaction) => {
      const tx = transaction as any;
      const clients = await tx.client.findMany({
        where: { businessId: unitId },
        select: { id: true, phone: true, whatsappOptOut: true },
      });
      const matched = clients.filter((item: { phone: string | null }) => normalizePhone(item.phone) === normalizedPhone);
      if (!matched.length) return null;
      const clientIds = matched.map((item: { id: string }) => item.id);
      const changedClients = matched.filter((item: { whatsappOptOut: boolean }) => !item.whatsappOptOut).length;
      await tx.client.updateMany({ where: { id: { in: clientIds }, businessId: unitId }, data: { whatsappOptOut: true } });
      const recipients = await tx.reactivationCampaignRecipient.findMany({
        where: {
          clientId: { in: clientIds },
          campaign: { unitId, status: { in: ["DRAFT", "SENDING"] } },
          OR: [
            { status: "PENDING" },
            { status: "SENDING", providerCallStartedAt: null },
          ],
        },
        include: { campaign: { select: { unitId: true } } },
      });
      const cancelledRecipients: any[] = [];
      for (const recipient of recipients) {
        const cancelled = await tx.reactivationCampaignRecipient.updateMany({
          where: {
            id: recipient.id,
            OR: [
              { status: "PENDING" },
              { status: "SENDING", providerCallStartedAt: null },
            ],
          },
          data: { status: "SKIPPED", skipReason: "WHATSAPP_OPT_OUT" },
        });
        if (cancelled.count === 1) cancelledRecipients.push(recipient);
      }
      await this.recordAudits(tx, [
        ...cancelledRecipients.map((recipient: any) => this.recipientAudit(
          recipient,
          "RECIPIENT_SKIPPED",
          "SKIPPED",
          "WHATSAPP_OPT_OUT",
          now,
          auditEventKey([recipient.id, "RECIPIENT_SKIPPED", "WHATSAPP_OPT_OUT"]),
        )),
        {
          eventKey: auditEventKey([unitId, "OPT_OUT_RECEIVED", phoneFingerprint(normalizedPhone)]),
          unitId,
          campaignId: null,
          recipientId: null,
          attemptId: null,
          event: "OPT_OUT_RECEIVED",
          state: null,
          reason: "NORMALIZED_PHONE_MATCH",
          createdAt: now,
        },
      ]);
      return {
        clientId: matched[0]!.id,
        matchedClients: matched.length,
        changedClients,
        phoneMasked: maskPhone(normalizedPhone),
        cancelledPending: cancelledRecipients.length,
      };
    });
  }

  async listAudits(campaignId?: string): Promise<ReactivationRecipientAuditRecord[]> {
    return await this.db.reactivationRecipientAudit.findMany({
      where: campaignId ? { campaignId } : undefined,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }
}

function safeErrorCode(error: unknown) {
  const classification = error instanceof WhatsappDeliveryError
    ? `${error.name}:${error.reason}`
    : error instanceof Error ? error.name : "delivery_error";
  return crypto.createHash("sha256").update(classification).digest("hex").slice(0, 12);
}

function isUncertainDelivery(error: unknown) {
  if (!(error instanceof WhatsappDeliveryError)) return true;
  return error.reason === "timeout" || error.reason === "network";
}

function safeDeliveryReason(error: unknown) {
  if (!(error instanceof WhatsappDeliveryError)) return "AMBIGUOUS_PROVIDER_RESULT";
  return error.reason.toUpperCase();
}

export class ReactivationCampaignService {
  private readonly maxRecipients: number;
  private readonly claimTimeoutMs: number;
  constructor(private readonly input: {
    analysis: ReactivationAnalysisService;
    repository: ReactivationCampaignRepository;
    send: (phone: string, text: string) => Promise<void>;
    now?: () => Date;
    maxRecipients?: number;
    claimTimeoutMs?: number;
    publicBookingUrl?: string | ((unitId: string) => string | undefined);
  }) {
    this.maxRecipients = Math.min(20, Math.max(1, input.maxRecipients ?? 20));
    this.claimTimeoutMs = Math.max(1_000, input.claimTimeoutMs ?? 5 * 60_000);
  }

  private now() { return this.input.now?.() ?? new Date(); }

  private publicBookingUrl(unitId: string) {
    const configured = typeof this.input.publicBookingUrl === "function"
      ? this.input.publicBookingUrl(unitId)
      : this.input.publicBookingUrl;
    return resolveReactivationPublicBookingUrl(configured, unitId);
  }

  async createDraft(params: { unitId: string; ownerId: string }): Promise<ReactivationCampaignPreview> {
    const latest = await this.input.repository.findLatest(params.unitId, params.ownerId);
    if (latest?.status === "SENDING") {
      throw new ReactivationCampaignConflictError("CAMPAIGN_SENDING");
    }
    const publicBookingUrl = this.publicBookingUrl(params.unitId);
    const now = this.now();
    const analysis = await this.input.analysis.analyze({ unitId: params.unitId, now, generateMessageVariants: false });
    const selected = analysis.candidates.slice(0, this.maxRecipients).map((candidate) => ({
      ...candidate,
      message: buildDefaultReactivationMessage({
        firstName: candidate.firstName,
        barbershopName: analysis.unitName,
        publicBookingUrl,
      }),
    }));
    const phones = await this.input.repository.resolvePhones(params.unitId, selected.map((item) => item.clientId));
    const deliverable = selected.filter((item) => phones.has(item.clientId));
    const campaignId = crypto.randomUUID();
    const segmentCounts = {
      NEAR_DUE: deliverable.filter((item) => item.segment === "NEAR_DUE").length,
      OVERDUE: deliverable.filter((item) => item.segment === "OVERDUE").length,
      STRONGLY_OVERDUE: deliverable.filter((item) => item.segment === "STRONGLY_OVERDUE").length,
    };
    const campaign: ReactivationCampaignRecord = {
      id: campaignId, unitId: params.unitId, ownerId: params.ownerId, status: "DRAFT",
      analyzedClients: analysis.analyzedClients, eligibleClients: analysis.eligibleClients,
      selectedCount: deliverable.length, segmentCounts, exclusions: analysis.excluded,
      maxRecipients: this.maxRecipients, confirmedAt: null, completedAt: null, cancelledAt: null,
      createdAt: now, updatedAt: now,
    };
    const recipients = deliverable.map((candidate): ReactivationRecipientRecord => ({
      id: crypto.randomUUID(), campaignId, clientId: candidate.clientId, segment: candidate.segment,
      phoneSnapshot: phones.get(candidate.clientId)!, phoneMasked: candidate.phoneMasked, message: candidate.message,
      delayDays: candidate.delayDays, status: "PENDING", attempts: 0, maxAttempts: 1,
      idempotencyKey: `${campaignId}:${candidate.clientId}`, attemptId: crypto.randomUUID(),
      openClientKey: openClientKey(params.unitId, candidate.clientId),
      skipReason: null, errorCode: null, claimedAt: null, providerCallStartedAt: null,
      sentAt: null, createdAt: now, updatedAt: now,
    }));
    await this.input.repository.replaceDraft({ campaign, recipients });
    return this.preview(campaign, deliverable);
  }

  private preview(campaign: ReactivationCampaignRecord, candidates: ReactivationCandidate[]): ReactivationCampaignPreview {
    return {
      campaignId: campaign.id, status: campaign.status, analyzedClients: campaign.analyzedClients,
      eligibleClients: campaign.eligibleClients, selected: campaign.selectedCount, segments: campaign.segmentCounts,
      exclusions: campaign.exclusions, messagesSent: 0,
      examples: candidates.slice(0, 5).map((item) => ({ firstName: item.firstName, phoneMasked: item.phoneMasked, segment: item.segment, message: item.message })),
    };
  }

  async findDraft(unitId: string, ownerId: string) { return await this.input.repository.findDraft(unitId, ownerId); }

  async cancel(params: { unitId: string; ownerId: string }) {
    const draft = await this.input.repository.findDraft(params.unitId, params.ownerId);
    return draft ? await this.input.repository.cancelCampaign(draft.id, this.now()) : false;
  }

  async confirm(params: { unitId: string; ownerId: string }): Promise<ReactivationCampaignSummary | null> {
    const draft = await this.input.repository.findDraft(params.unitId, params.ownerId);
    let campaign: ReactivationCampaignRecord;
    let replay = false;
    if (draft) {
      const confirmedAt = this.now();
      if (!await this.input.repository.claimCampaign(draft.id, confirmedAt)) {
        const latest = await this.input.repository.findLatest(params.unitId, params.ownerId);
        return latest ? await this.summary(latest, true) : null;
      }
      campaign = { ...draft, status: "SENDING", confirmedAt, updatedAt: confirmedAt };
    } else {
      const latest = await this.input.repository.findLatest(params.unitId, params.ownerId);
      if (!latest) return null;
      if (["COMPLETED", "PARTIAL"].includes(latest.status)) return await this.summary(latest, true);
      if (latest.status !== "SENDING") return null;

      replay = true;
      const recoveryNow = this.now();
      const staleBefore = new Date(recoveryNow.getTime() - this.claimTimeoutMs);
      const recovery = await this.input.repository.recoverStaleClaims(latest.id, staleBefore, recoveryNow);
      const campaignClaimExpired = Boolean(latest.confirmedAt && latest.confirmedAt <= staleBefore);
      if (!campaignClaimExpired && recovery.requeued === 0 && recovery.uncertain === 0) {
        return await this.summary(latest, true);
      }
      campaign = latest;
    }

    const recipients = await this.input.repository.listRecipients(campaign.id);
    for (const initial of recipients) {
      const claimed = await this.input.repository.claimRecipient(initial.id, this.now());
      if (!claimed) continue;
      const currentAnalysis = await this.input.analysis.analyze({ unitId: params.unitId, now: this.now(), generateMessageVariants: false });
      const eligible = currentAnalysis.candidates.some((candidate) => candidate.clientId === claimed.clientId);
      const currentPhones = await this.input.repository.resolvePhones(params.unitId, [claimed.clientId]);
      if (!eligible || currentPhones.get(claimed.clientId) !== claimed.phoneSnapshot) {
        await this.input.repository.markRecipientSkipped(claimed.id, "NOT_ELIGIBLE_AFTER_REVALIDATION", this.now());
        continue;
      }
      const providerCallStarted = await this.input.repository.markProviderCallStarted(
        claimed.id,
        claimed.attemptId,
        this.now(),
      );
      if (!providerCallStarted) continue;
      try {
        await this.input.send(claimed.phoneSnapshot, claimed.message);
        await this.input.repository.markRecipientSent(claimed.id, claimed.attemptId, this.now());
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const reason = safeDeliveryReason(error);
        if (isUncertainDelivery(error)) {
          await this.input.repository.markRecipientUncertain(claimed.id, claimed.attemptId, errorCode, reason, this.now());
        } else {
          await this.input.repository.markRecipientFailed(claimed.id, claimed.attemptId, errorCode, reason, this.now());
        }
      }
    }
    const after = await this.input.repository.listRecipients(campaign.id);
    const hasOpenRecipients = after.some((item) => item.status === "PENDING" || item.status === "SENDING");
    if (hasOpenRecipients) return await this.summary({ ...campaign, status: "SENDING" }, replay);

    const status = after.some((item) => item.status === "FAILED" || item.status === "UNCERTAIN")
      ? "PARTIAL"
      : "COMPLETED";
    await this.input.repository.finishCampaign(campaign.id, status, this.now());
    return await this.summary({ ...campaign, status }, replay);
  }

  private async summary(campaign: ReactivationCampaignRecord, replay: boolean): Promise<ReactivationCampaignSummary> {
    const recipients = await this.input.repository.listRecipients(campaign.id);
    return {
      campaignId: campaign.id, selected: campaign.selectedCount,
      sent: recipients.filter((item) => item.status === "SENT").length,
      skipped: recipients.filter((item) => item.status === "SKIPPED").length,
      failed: recipients.filter((item) => item.status === "FAILED").length,
      uncertain: recipients.filter((item) => item.status === "UNCERTAIN").length,
      pending: recipients.filter((item) => item.status === "PENDING").length,
      processing: recipients.filter((item) => item.status === "SENDING").length,
      duplicateMessages: 0, status: campaign.status, replay,
    };
  }

  async optOut(params: { unitId: string; phone: string }) {
    const normalized = normalizePhone(params.phone);
    return normalized ? await this.input.repository.optOutByPhone(params.unitId, normalized, this.now()) : null;
  }
}

export function looksLikeReactivationCampaignCommand(value: string) {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return /\b(campanha (?:de |para )?(?:reativacao|clientes? inativos?)|(?:crie|criar|prepare|preparar|monte|montar) (?:uma )?campanha.*reativ)\b/.test(normalized);
}

export function parseStrictReactivationDecision(value: string): "CONFIRMAR" | "CANCELAR" | null {
  const normalized = String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return normalized === "CONFIRMAR" || normalized === "CANCELAR" ? normalized : null;
}

export function isUnambiguousWhatsappOptOut(value: string) {
  const normalized = String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
  return ["SAIR", "PARAR", "NAO QUERO RECEBER", "REMOVER MEU NUMERO"].includes(normalized);
}

export function formatReactivationCampaignPreview(preview: ReactivationCampaignPreview) {
  const lines = [
    "Prévia da campanha de reativação", "",
    `Selecionados: ${preview.selected} de ${preview.eligibleClients} elegíveis`,
    `Próximos do retorno: ${preview.segments.NEAR_DUE}`,
    `Atrasados: ${preview.segments.OVERDUE}`,
    `Muito atrasados: ${preview.segments.STRONGLY_OVERDUE}`,
    "", "Exclusões:",
    `- Agendamento futuro: ${preview.exclusions.FUTURE_APPOINTMENT}`,
    `- Opt-out: ${preview.exclusions.WHATSAPP_OPT_OUT}`,
    `- Contato recente: ${preview.exclusions.RECENT_CONTACT}`,
    `- Telefone inválido: ${preview.exclusions.INVALID_WHATSAPP}`,
  ];
  if (preview.examples.length) {
    lines.push("", "Exemplos mascarados:");
    for (const example of preview.examples) lines.push(`- ${example.firstName} ${example.phoneMasked}: ${example.message}`);
  }
  lines.push("", "Nada foi enviado.", "Responda exatamente CONFIRMAR ou CANCELAR.");
  return lines.join("\n");
}

export function formatReactivationCampaignSummary(summary: ReactivationCampaignSummary) {
  return [
    "Campanha de reativação concluída", "",
    `- Selecionados: ${summary.selected}`,
    `- Enviados: ${summary.sent}`,
    `- Ignorados após revalidação: ${summary.skipped}`,
    `- Falharam: ${summary.failed}`,
    `- Entrega incerta (sem reenvio automático): ${summary.uncertain}`,
    "", "Nenhuma mensagem duplicada.",
  ].join("\n");
}
