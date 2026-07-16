import { Prisma, PrismaClient } from "@prisma/client";
import type { Product } from "../domain/types";
import type { InMemoryStore } from "../infrastructure/in-memory-store";
import { toAuditEvent, writePrismaAuditEvent } from "./audit-service";
import {
  buildStockAlertMessage,
  evaluateStockTransition,
  stockAlertIdempotencyKey,
  type StockAlertRecord,
  type StockAlertType,
} from "./stock-alerts";

type StockProduct = Pick<Product, "id" | "name" | "stockQty" | "minStockAlert">;

function systemAudit(input: {
  unitId: string;
  action: string;
  alertId?: string;
  productId: string;
  alertType?: StockAlertType;
  cycle: number;
  quantity: number;
  minimumStock: number;
  attempts?: number;
  errorCode?: string;
}) {
  return toAuditEvent({
    unitId: input.unitId,
    actorId: "system:stock-alert",
    actorRole: "owner",
    action: input.action,
    entity: "stock_alert",
    entityId: input.alertId ?? input.productId,
    route: "internal:stock-alert",
    method: "SYSTEM",
    requestId: crypto.randomUUID(),
    idempotencyKey: input.alertId,
    after: {
      productId: input.productId,
      alertType: input.alertType,
      cycle: input.cycle,
      quantity: input.quantity,
      minimumStock: input.minimumStock,
      attempts: input.attempts,
      errorCode: input.errorCode,
    },
  });
}

export function recordMemoryStockTransition(
  store: InMemoryStore,
  input: {
    unitId: string;
    product: StockProduct;
    previousQuantity: number;
    previousMinimumStock?: number;
    maxAttempts?: number;
  },
) {
  const previousState = store.stockAlertCycleStates.get(input.product.id) ?? { cycle: 0, active: false };
  const decision = evaluateStockTransition({
    previousQuantity: input.previousQuantity,
    currentQuantity: input.product.stockQty,
    minimumStock: input.product.minStockAlert,
    previousMinimumStock: input.previousMinimumStock,
    cycleActive: previousState.active,
  });
  let cycle = previousState.cycle;
  let active = previousState.active;
  if (decision.resetsCycle) {
    active = false;
    store.auditEvents.push(systemAudit({
      unitId: input.unitId,
      action: "STOCK_ALERT_CYCLE_RESET",
      productId: input.product.id,
      cycle,
      quantity: input.product.stockQty,
      minimumStock: input.product.minStockAlert,
    }));
  }
  if (decision.startsCycle) {
    cycle += 1;
    active = true;
  }
  store.stockAlertCycleStates.set(input.product.id, { cycle, active });

  if (!decision.alertType) {
    if (decision.currentSituation !== "IN_STOCK" && active) {
      store.auditEvents.push(systemAudit({
        unitId: input.unitId,
        action: "STOCK_ALERT_DEDUPLICATED",
        productId: input.product.id,
        alertType: decision.currentSituation as StockAlertType,
        cycle,
        quantity: input.product.stockQty,
        minimumStock: input.product.minStockAlert,
      }));
    }
    return null;
  }

  const existing = store.stockAlerts.find((item) =>
    item.unitId === input.unitId
    && item.productId === input.product.id
    && item.alertType === decision.alertType
    && item.cycle === cycle);
  if (existing) {
    store.auditEvents.push(systemAudit({
      unitId: input.unitId,
      action: "STOCK_ALERT_DEDUPLICATED",
      alertId: existing.id,
      productId: input.product.id,
      alertType: decision.alertType,
      cycle,
      quantity: input.product.stockQty,
      minimumStock: input.product.minStockAlert,
    }));
    return null;
  }

  const now = new Date();
  const id = stockAlertIdempotencyKey({
    unitId: input.unitId,
    productId: input.product.id,
    alertType: decision.alertType,
    cycle,
  });
  const alert: StockAlertRecord = {
    id,
    unitId: input.unitId,
    productId: input.product.id,
    productName: input.product.name,
    alertType: decision.alertType,
    cycle,
    status: "PENDING",
    quantity: input.product.stockQty,
    minimumStock: input.product.minStockAlert,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: now,
    updatedAt: now,
  };
  store.stockAlerts.push(alert);
  store.auditEvents.push(systemAudit({
    unitId: input.unitId,
    action: "STOCK_ALERT_CREATED",
    alertId: alert.id,
    productId: alert.productId,
    alertType: alert.alertType,
    cycle: alert.cycle,
    quantity: alert.quantity,
    minimumStock: alert.minimumStock,
  }));
  return alert;
}

export async function recordPrismaStockTransition(
  tx: Prisma.TransactionClient,
  input: {
    unitId: string;
    productId: string;
    previousQuantity: number;
    previousMinimumStock?: number;
    maxAttempts?: number;
  },
) {
  const lockKey = `${input.unitId}:${input.productId}:stock-alert`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  const product = await tx.product.findFirstOrThrow({
    where: { id: input.productId, businessId: input.unitId },
    select: {
      id: true,
      name: true,
      stockQty: true,
      minStockAlert: true,
      stockAlertCycle: true,
      stockAlertCycleActive: true,
    },
  });
  const decision = evaluateStockTransition({
    previousQuantity: input.previousQuantity,
    currentQuantity: product.stockQty,
    minimumStock: product.minStockAlert,
    previousMinimumStock: input.previousMinimumStock,
    cycleActive: product.stockAlertCycleActive,
  });
  let cycle = product.stockAlertCycle;
  if (decision.resetsCycle) {
    await tx.product.update({
      where: { id: product.id },
      data: { stockAlertCycleActive: false },
    });
    await writePrismaAuditEvent(tx, systemAudit({
      unitId: input.unitId,
      action: "STOCK_ALERT_CYCLE_RESET",
      productId: product.id,
      cycle,
      quantity: product.stockQty,
      minimumStock: product.minStockAlert,
    }));
  }
  if (decision.startsCycle) {
    cycle += 1;
    await tx.product.update({
      where: { id: product.id },
      data: { stockAlertCycle: cycle, stockAlertCycleActive: true },
    });
  }
  if (!decision.alertType) {
    if (decision.currentSituation !== "IN_STOCK" && product.stockAlertCycleActive) {
      await writePrismaAuditEvent(tx, systemAudit({
        unitId: input.unitId,
        action: "STOCK_ALERT_DEDUPLICATED",
        productId: product.id,
        alertType: decision.currentSituation as StockAlertType,
        cycle,
        quantity: product.stockQty,
        minimumStock: product.minStockAlert,
      }));
    }
    return null;
  }

  const existing = await tx.stockAlert.findUnique({
    where: {
      unitId_productId_alertType_cycle: {
        unitId: input.unitId,
        productId: product.id,
        alertType: decision.alertType,
        cycle,
      },
    },
  });
  if (existing) return null;
  const alert = await tx.stockAlert.create({
    data: {
      id: stockAlertIdempotencyKey({
        unitId: input.unitId,
        productId: product.id,
        alertType: decision.alertType,
        cycle,
      }),
      unitId: input.unitId,
      productId: product.id,
      alertType: decision.alertType,
      cycle,
      quantity: product.stockQty,
      minimumStock: product.minStockAlert,
      maxAttempts: input.maxAttempts ?? 3,
    },
    include: { product: { select: { name: true } } },
  });
  await writePrismaAuditEvent(tx, systemAudit({
    unitId: input.unitId,
    action: "STOCK_ALERT_CREATED",
    alertId: alert.id,
    productId: product.id,
    alertType: decision.alertType,
    cycle,
    quantity: product.stockQty,
    minimumStock: product.minStockAlert,
  }));
  return alert;
}

export interface StockAlertDeliveryStore {
  claimNext(now: Date): Promise<StockAlertRecord | null>;
  markSent(alert: StockAlertRecord, sentAt: Date): Promise<void>;
  markFailed(alert: StockAlertRecord, input: { errorCode: string; nextAttemptAt?: Date; failedAt: Date }): Promise<void>;
}

export class MemoryStockAlertStore implements StockAlertDeliveryStore {
  constructor(private readonly memory: InMemoryStore) {}

  async claimNext(now: Date) {
    const staleClaimBefore = new Date(now.getTime() - 5 * 60_000);
    const alert = this.memory.stockAlerts
      .filter((item) => item.attempts < item.maxAttempts)
      .filter((item) => item.status === "PENDING"
        || (item.status === "FAILED" && Boolean(item.nextAttemptAt) && item.nextAttemptAt!.getTime() <= now.getTime())
        || (item.status === "SENDING" && Boolean(item.claimedAt) && item.claimedAt!.getTime() <= staleClaimBefore.getTime()))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!alert) return null;
    alert.status = "SENDING";
    alert.claimedAt = now;
    alert.attempts += 1;
    alert.updatedAt = now;
    return { ...alert };
  }

  async markSent(alert: StockAlertRecord, sentAt: Date) {
    const stored = this.memory.stockAlerts.find((item) => item.id === alert.id);
    if (!stored || stored.status !== "SENDING") return;
    stored.status = "SENT";
    stored.sentAt = sentAt;
    stored.nextAttemptAt = undefined;
    stored.lastErrorCode = undefined;
    stored.updatedAt = sentAt;
    this.memory.auditEvents.push(systemAudit({
      unitId: stored.unitId,
      action: stored.attempts > 1 ? "STOCK_ALERT_RETRY_SUCCEEDED" : "STOCK_ALERT_SENT",
      alertId: stored.id,
      productId: stored.productId,
      alertType: stored.alertType,
      cycle: stored.cycle,
      quantity: stored.quantity,
      minimumStock: stored.minimumStock,
      attempts: stored.attempts,
    }));
  }

  async markFailed(alert: StockAlertRecord, input: { errorCode: string; nextAttemptAt?: Date; failedAt: Date }) {
    const stored = this.memory.stockAlerts.find((item) => item.id === alert.id);
    if (!stored || stored.status !== "SENDING") return;
    stored.status = "FAILED";
    stored.lastErrorCode = input.errorCode;
    stored.nextAttemptAt = input.nextAttemptAt;
    stored.updatedAt = input.failedAt;
    this.memory.auditEvents.push(systemAudit({
      unitId: stored.unitId,
      action: "STOCK_ALERT_FAILED",
      alertId: stored.id,
      productId: stored.productId,
      alertType: stored.alertType,
      cycle: stored.cycle,
      quantity: stored.quantity,
      minimumStock: stored.minimumStock,
      attempts: stored.attempts,
      errorCode: stored.lastErrorCode,
    }));
  }
}

export class PrismaStockAlertStore implements StockAlertDeliveryStore {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Awaited<ReturnType<PrismaClient["stockAlert"]["findFirst"]>> & { product?: { name: string } } | null) {
    if (!row) return null;
    return {
      id: row.id,
      unitId: row.unitId,
      productId: row.productId,
      productName: row.product?.name ?? "Produto",
      alertType: row.alertType,
      cycle: row.cycle,
      status: row.status,
      quantity: row.quantity,
      minimumStock: row.minimumStock,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      nextAttemptAt: row.nextAttemptAt ?? undefined,
      claimedAt: row.claimedAt ?? undefined,
      sentAt: row.sentAt ?? undefined,
      lastErrorCode: row.lastErrorCode ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } satisfies StockAlertRecord;
  }

  async claimNext(now: Date) {
    return await this.prisma.$transaction(async (tx) => {
      const staleClaimBefore = new Date(now.getTime() - 5 * 60_000);
      const candidates = await tx.stockAlert.findMany({
        where: {
          attempts: { lt: tx.stockAlert.fields.maxAttempts },
          OR: [
            { status: "PENDING" },
            { status: "FAILED", nextAttemptAt: { not: null, lte: now } },
            { status: "SENDING", claimedAt: { not: null, lte: staleClaimBefore } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 10,
        include: { product: { select: { name: true } } },
      });
      for (const candidate of candidates) {
        if (candidate.attempts >= candidate.maxAttempts) continue;
        const claimed = await tx.stockAlert.updateMany({
          where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts },
          data: { status: "SENDING", attempts: { increment: 1 }, claimedAt: now },
        });
        if (claimed.count !== 1) continue;
        return this.map({ ...candidate, status: "SENDING", attempts: candidate.attempts + 1, claimedAt: now });
      }
      return null;
    });
  }

  async markSent(alert: StockAlertRecord, sentAt: Date) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockAlert.updateMany({
        where: { id: alert.id, status: "SENDING" },
        data: { status: "SENT", sentAt, nextAttemptAt: null, lastErrorCode: null },
      });
      if (updated.count !== 1) return;
      await writePrismaAuditEvent(tx, systemAudit({
        unitId: alert.unitId,
        action: alert.attempts > 1 ? "STOCK_ALERT_RETRY_SUCCEEDED" : "STOCK_ALERT_SENT",
        alertId: alert.id,
        productId: alert.productId,
        alertType: alert.alertType,
        cycle: alert.cycle,
        quantity: alert.quantity,
        minimumStock: alert.minimumStock,
        attempts: alert.attempts,
      }));
    });
  }

  async markFailed(alert: StockAlertRecord, input: { errorCode: string; nextAttemptAt?: Date; failedAt: Date }) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockAlert.updateMany({
        where: { id: alert.id, status: "SENDING" },
        data: { status: "FAILED", lastErrorCode: input.errorCode, nextAttemptAt: input.nextAttemptAt ?? null },
      });
      if (updated.count !== 1) return;
      await writePrismaAuditEvent(tx, systemAudit({
        unitId: alert.unitId,
        action: "STOCK_ALERT_FAILED",
        alertId: alert.id,
        productId: alert.productId,
        alertType: alert.alertType,
        cycle: alert.cycle,
        quantity: alert.quantity,
        minimumStock: alert.minimumStock,
        attempts: alert.attempts,
        errorCode: input.errorCode,
      }));
    });
  }
}

function safeErrorCode(error: unknown) {
  const reason = error && typeof error === "object" && "reason" in error ? String(error.reason) : "unavailable";
  return ["configuration", "timeout", "http", "network", "unavailable"].includes(reason) ? reason : "unavailable";
}

export class StockAlertDispatcher {
  constructor(private readonly input: {
    store: StockAlertDeliveryStore;
    send: (phone: string, text: string) => Promise<void>;
    resolveOwnerPhone: (unitId: string) => string | undefined;
    now?: () => Date;
    baseBackoffMs?: number;
    maxPerRun?: number;
  }) {}

  async dispatchDue() {
    const maxPerRun = Math.max(1, this.input.maxPerRun ?? 20);
    let processed = 0;
    while (processed < maxPerRun) {
      const now = this.input.now?.() ?? new Date();
      const alert = await this.input.store.claimNext(now);
      if (!alert) break;
      processed += 1;
      try {
        const ownerPhone = this.input.resolveOwnerPhone(alert.unitId);
        if (!ownerPhone) throw Object.assign(new Error("owner_not_configured"), { reason: "configuration" });
        await this.input.send(ownerPhone, buildStockAlertMessage({
          type: alert.alertType,
          productName: alert.productName,
          quantity: alert.quantity,
          minimumStock: alert.minimumStock,
        }));
        await this.input.store.markSent(alert, this.input.now?.() ?? new Date());
      } catch (error) {
        const failedAt = this.input.now?.() ?? new Date();
        const canRetry = alert.attempts < alert.maxAttempts;
        const base = Math.max(1, this.input.baseBackoffMs ?? 30_000);
        const nextAttemptAt = canRetry
          ? new Date(failedAt.getTime() + base * 2 ** Math.max(0, alert.attempts - 1))
          : undefined;
        await this.input.store.markFailed(alert, {
          errorCode: safeErrorCode(error),
          nextAttemptAt,
          failedAt,
        });
      }
    }
    return { processed };
  }
}

export function resolveConfiguredStockAlertOwner(unitId: string) {
  const configuredUnit = String(process.env.AI_WHATSAPP_UNIT_ID ?? "").trim();
  if (!configuredUnit || configuredUnit !== unitId) return undefined;
  const digits = String(process.env.AI_WHATSAPP_OWNER_PHONE ?? "").replace(/\D/g, "");
  return digits || undefined;
}
