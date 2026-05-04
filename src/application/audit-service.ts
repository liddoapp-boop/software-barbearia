import crypto from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { AuditActorRole, AuditEvent } from "../domain/types";

type AuditJson = Record<string, unknown>;
export type PrismaAuditClient = PrismaClient | Prisma.TransactionClient;

export type RecordAuditEventInput = {
  unitId: string;
  actorId: string;
  actorEmail?: string;
  actorRole: AuditActorRole;
  action: string;
  entity: string;
  entityId?: string;
  route: string;
  method: string;
  requestId: string;
  idempotencyKey?: string;
  before?: AuditJson;
  after?: AuditJson;
  metadata?: AuditJson;
};

export type TransactionalAuditContext = Pick<
  RecordAuditEventInput,
  | "actorId"
  | "actorEmail"
  | "actorRole"
  | "route"
  | "method"
  | "requestId"
  | "idempotencyKey"
>;

export type AuditEventQuery = {
  unitId: string;
  entity?: string;
  action?: string;
  actorId?: string;
  start?: Date;
  end?: Date;
  limit?: number;
};

function toPlainJson(input?: AuditJson) {
  if (!input) return undefined;
  return JSON.parse(JSON.stringify(input)) as AuditJson;
}

export function toAuditEvent(input: RecordAuditEventInput): AuditEvent {
  return {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    route: input.route,
    method: input.method.toUpperCase(),
    requestId: input.requestId,
    idempotencyKey: input.idempotencyKey,
    beforeJson: toPlainJson(input.before),
    afterJson: toPlainJson(input.after),
    metadataJson: toPlainJson(input.metadata),
    createdAt: new Date(),
  };
}

export async function writePrismaAuditEvent(
  client: PrismaAuditClient,
  event: AuditEvent,
) {
  if (event.idempotencyKey && event.entityId) {
    const lockKey = `${event.unitId}:${event.action}:${event.entity}:${event.entityId}`;
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const existing = await client.auditLog.findFirst({
      where: {
        unitId: event.unitId,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
      },
      select: { id: true },
    });
    if (existing) return null;
  }

  await client.auditLog.create({
    data: {
      id: event.id,
      unitId: event.unitId,
      actorId: event.actorId,
      actorEmail: event.actorEmail ?? null,
      actorRole: event.actorRole,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId ?? null,
      route: event.route,
      method: event.method,
      requestId: event.requestId,
      idempotencyKey: event.idempotencyKey ?? null,
      beforeJson: event.beforeJson
        ? (event.beforeJson as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      afterJson: event.afterJson
        ? (event.afterJson as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      metadataJson: event.metadataJson
        ? (event.metadataJson as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      createdAt: event.createdAt,
    },
  });
  return event;
}

function mapPrismaAuditLog(row: {
  id: string;
  unitId: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  route: string;
  method: string;
  requestId: string;
  idempotencyKey: string | null;
  beforeJson: Prisma.JsonValue | null;
  afterJson: Prisma.JsonValue | null;
  metadataJson: Prisma.JsonValue | null;
  createdAt: Date;
}): AuditEvent {
  return {
    id: row.id,
    unitId: row.unitId,
    actorId: row.actorId,
    actorEmail: row.actorEmail ?? undefined,
    actorRole: row.actorRole as AuditActorRole,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId ?? undefined,
    route: row.route,
    method: row.method,
    requestId: row.requestId,
    idempotencyKey: row.idempotencyKey ?? undefined,
    beforeJson: (row.beforeJson as AuditJson | null) ?? undefined,
    afterJson: (row.afterJson as AuditJson | null) ?? undefined,
    metadataJson: (row.metadataJson as AuditJson | null) ?? undefined,
    createdAt: row.createdAt,
  };
}

export class AuditRecorder {
  constructor(
    private readonly input: {
      backend: string;
      prisma?: PrismaClient;
      memoryEvents: AuditEvent[];
      log?: {
        info: (payload: unknown) => void;
        error: (payload: unknown) => void;
      };
    },
  ) {}

  private shouldUsePrisma() {
    return this.input.backend === "prisma" && Boolean(this.input.prisma);
  }

  private async hasIdempotentBusinessEvent(event: AuditEvent) {
    if (!event.idempotencyKey || !event.entityId) return false;
    if (this.shouldUsePrisma()) {
      const existing = await this.input.prisma!.auditLog.findFirst({
        where: {
          unitId: event.unitId,
          action: event.action,
          entity: event.entity,
          entityId: event.entityId,
        },
        select: { id: true },
      });
      return Boolean(existing);
    }

    return this.input.memoryEvents.some(
      (item) =>
        item.unitId === event.unitId &&
        item.action === event.action &&
        item.entity === event.entity &&
        item.entityId === event.entityId,
    );
  }

  async record(input: RecordAuditEventInput) {
    const event = toAuditEvent(input);
    try {
      if (this.shouldUsePrisma()) {
        let skippedReplay = false;
        await this.input.prisma!.$transaction(async (tx) => {
          const written = await writePrismaAuditEvent(tx, event);
          skippedReplay = !written;
        });
        if (skippedReplay) {
          this.input.log?.info({
            event: "audit.skipped_idempotent_replay",
            audit: {
              action: event.action,
              entity: event.entity,
              entityId: event.entityId,
              idempotencyKey: event.idempotencyKey,
            },
          });
          return null;
        }
      } else {
        if (await this.hasIdempotentBusinessEvent(event)) {
          this.input.log?.info({
            event: "audit.skipped_idempotent_replay",
            audit: {
              action: event.action,
              entity: event.entity,
              entityId: event.entityId,
              idempotencyKey: event.idempotencyKey,
            },
          });
          return null;
        }
        this.input.memoryEvents.push(event);
        if (this.input.memoryEvents.length > 5000) {
          this.input.memoryEvents.splice(0, this.input.memoryEvents.length - 5000);
        }
      }

      this.input.log?.info({ event: "audit.recorded", audit: event });
      return event;
    } catch (error) {
      this.input.log?.error({
        event: "audit.record_failed",
        message: error instanceof Error ? error.message : String(error),
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        requestId: event.requestId,
      });
      return null;
    }
  }

  async list(query: AuditEventQuery) {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    if (this.shouldUsePrisma()) {
      const createdAt =
        query.start || query.end
          ? {
              ...(query.start ? { gte: query.start } : {}),
              ...(query.end ? { lte: query.end } : {}),
            }
          : undefined;
      const rows = await this.input.prisma!.auditLog.findMany({
        where: {
          unitId: query.unitId,
          entity: query.entity,
          action: query.action,
          actorId: query.actorId,
          createdAt,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(mapPrismaAuditLog);
    }

    return this.input.memoryEvents
      .filter((item) => item.unitId === query.unitId)
      .filter((item) => (query.entity ? item.entity === query.entity : true))
      .filter((item) => (query.action ? item.action === query.action : true))
      .filter((item) => (query.actorId ? item.actorId === query.actorId : true))
      .filter((item) => (query.start ? item.createdAt >= query.start : true))
      .filter((item) => (query.end ? item.createdAt <= query.end : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
