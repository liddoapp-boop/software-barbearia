import { Prisma, PrismaClient } from "@prisma/client";
import type { Product } from "../domain/types";
import type { InMemoryStore } from "../infrastructure/in-memory-store";
import type { WhatsappDeliveryAttemptContext } from "../notifications";
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
  deliveryAttemptId?: string;
  providerCallStartedAt?: Date;
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
      deliveryAttemptId: input.deliveryAttemptId,
      providerCallStartedAt: input.providerCallStartedAt?.toISOString(),
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
  recoverStale(unitId: string, now: Date): Promise<{ recovered: number; uncertain: number }>;
  claimNext(unitId: string, now: Date): Promise<StockAlertRecord | null>;
  markProviderCallStarted(unitId: string, alert: StockAlertRecord, startedAt: Date): Promise<boolean>;
  markSent(unitId: string, alert: StockAlertRecord, sentAt: Date): Promise<boolean>;
  markFailed(unitId: string, alert: StockAlertRecord, input: { errorCode: string; nextAttemptAt?: Date; failedAt: Date }): Promise<boolean>;
  markUncertain(unitId: string, alert: StockAlertRecord, input: { errorCode: string; uncertainAt: Date }): Promise<boolean>;
}

export function requireStockAlertUnitId(value: unknown) {
  const unitId = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(unitId)) {
    throw new Error("Stock alert dispatcher requires a valid unitId.");
  }
  return unitId;
}

function alertBelongsToUnit(unitId: string, alert: StockAlertRecord) {
  return requireStockAlertUnitId(unitId) === alert.unitId;
}

export class MemoryStockAlertStore implements StockAlertDeliveryStore {
  constructor(private readonly memory: InMemoryStore) {}

  async recoverStale(unitId: string, now: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    const staleClaimBefore = new Date(now.getTime() - 5 * 60_000);
    let recovered = 0;
    let uncertain = 0;
    for (const alert of this.memory.stockAlerts) {
      if (alert.unitId !== scopedUnitId
        || alert.status !== "SENDING"
        || !alert.claimedAt
        || alert.claimedAt > staleClaimBefore) continue;
      if (alert.providerCallStartedAt) {
        alert.status = "UNCERTAIN";
        alert.uncertainAt = now;
        alert.nextAttemptAt = undefined;
        alert.lastErrorCode = "stale_provider_call";
        alert.updatedAt = now;
        uncertain += 1;
        this.memory.auditEvents.push(systemAudit({
          unitId: alert.unitId,
          action: "STOCK_ALERT_UNCERTAIN",
          alertId: alert.id,
          productId: alert.productId,
          alertType: alert.alertType,
          cycle: alert.cycle,
          quantity: alert.quantity,
          minimumStock: alert.minimumStock,
          attempts: alert.attempts,
          errorCode: alert.lastErrorCode,
          deliveryAttemptId: alert.deliveryAttemptId,
          providerCallStartedAt: alert.providerCallStartedAt,
        }));
        continue;
      }
      alert.status = "PENDING";
      alert.attempts = Math.max(0, alert.attempts - 1);
      alert.claimedAt = undefined;
      alert.deliveryAttemptId = undefined;
      alert.updatedAt = now;
      recovered += 1;
      this.memory.auditEvents.push(systemAudit({
        unitId: alert.unitId,
        action: "STOCK_ALERT_CLAIM_RECOVERED",
        alertId: alert.id,
        productId: alert.productId,
        alertType: alert.alertType,
        cycle: alert.cycle,
        quantity: alert.quantity,
        minimumStock: alert.minimumStock,
        attempts: alert.attempts,
      }));
    }
    return { recovered, uncertain };
  }

  async claimNext(unitId: string, now: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    const alert = this.memory.stockAlerts
      .filter((item) => item.unitId === scopedUnitId)
      .filter((item) => item.attempts < item.maxAttempts)
      .filter((item) => item.status === "PENDING"
        || (item.status === "FAILED" && Boolean(item.nextAttemptAt) && item.nextAttemptAt!.getTime() <= now.getTime()))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!alert) return null;
    alert.status = "SENDING";
    alert.claimedAt = now;
    alert.deliveryAttemptId = crypto.randomUUID();
    alert.providerCallStartedAt = undefined;
    alert.failedAt = undefined;
    alert.uncertainAt = undefined;
    alert.nextAttemptAt = undefined;
    alert.lastErrorCode = undefined;
    alert.attempts += 1;
    alert.updatedAt = now;
    return { ...alert };
  }

  async markProviderCallStarted(unitId: string, alert: StockAlertRecord, startedAt: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    const stored = this.memory.stockAlerts.find((item) => item.id === alert.id && item.unitId === scopedUnitId);
    if (!stored || stored.status !== "SENDING" || stored.deliveryAttemptId !== alert.deliveryAttemptId) return false;
    if (stored.providerCallStartedAt) return true;
    stored.providerCallStartedAt = startedAt;
    stored.updatedAt = startedAt;
    return true;
  }

  async markSent(unitId: string, alert: StockAlertRecord, sentAt: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    const stored = this.memory.stockAlerts.find((item) => item.id === alert.id && item.unitId === scopedUnitId);
    if (!stored || stored.status !== "SENDING" || stored.deliveryAttemptId !== alert.deliveryAttemptId) return false;
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
      deliveryAttemptId: stored.deliveryAttemptId,
      providerCallStartedAt: stored.providerCallStartedAt,
    }));
    return true;
  }

  async markFailed(unitId: string, alert: StockAlertRecord, input: { errorCode: string; nextAttemptAt?: Date; failedAt: Date }) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    const stored = this.memory.stockAlerts.find((item) => item.id === alert.id && item.unitId === scopedUnitId);
    if (!stored || stored.status !== "SENDING" || stored.deliveryAttemptId !== alert.deliveryAttemptId) return false;
    stored.status = "FAILED";
    stored.failedAt = input.failedAt;
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
      deliveryAttemptId: stored.deliveryAttemptId,
      providerCallStartedAt: stored.providerCallStartedAt,
    }));
    return true;
  }

  async markUncertain(unitId: string, alert: StockAlertRecord, input: { errorCode: string; uncertainAt: Date }) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    const stored = this.memory.stockAlerts.find((item) => item.id === alert.id && item.unitId === scopedUnitId);
    if (!stored || stored.status !== "SENDING" || stored.deliveryAttemptId !== alert.deliveryAttemptId) return false;
    stored.status = "UNCERTAIN";
    stored.uncertainAt = input.uncertainAt;
    stored.lastErrorCode = input.errorCode;
    stored.nextAttemptAt = undefined;
    stored.updatedAt = input.uncertainAt;
    this.memory.auditEvents.push(systemAudit({
      unitId: stored.unitId,
      action: "STOCK_ALERT_UNCERTAIN",
      alertId: stored.id,
      productId: stored.productId,
      alertType: stored.alertType,
      cycle: stored.cycle,
      quantity: stored.quantity,
      minimumStock: stored.minimumStock,
      attempts: stored.attempts,
      errorCode: stored.lastErrorCode,
      deliveryAttemptId: stored.deliveryAttemptId,
      providerCallStartedAt: stored.providerCallStartedAt,
    }));
    return true;
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
      deliveryAttemptId: row.deliveryAttemptId ?? undefined,
      providerCallStartedAt: row.providerCallStartedAt ?? undefined,
      sentAt: row.sentAt ?? undefined,
      failedAt: row.failedAt ?? undefined,
      uncertainAt: row.uncertainAt ?? undefined,
      lastErrorCode: row.lastErrorCode ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } satisfies StockAlertRecord;
  }

  async recoverStale(unitId: string, now: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    return await this.prisma.$transaction(async (tx) => {
      const staleClaimBefore = new Date(now.getTime() - 5 * 60_000);
      const candidates = await tx.stockAlert.findMany({
        where: { unitId: scopedUnitId, status: "SENDING", claimedAt: { not: null, lte: staleClaimBefore } },
        orderBy: { createdAt: "asc" },
      });
      let recovered = 0;
      let uncertain = 0;
      for (const candidate of candidates) {
        if (candidate.providerCallStartedAt) {
          const updated = await tx.stockAlert.updateMany({
            where: {
              id: candidate.id,
              unitId: scopedUnitId,
              status: "SENDING",
              deliveryAttemptId: candidate.deliveryAttemptId,
              providerCallStartedAt: candidate.providerCallStartedAt,
            },
            data: {
              status: "UNCERTAIN",
              uncertainAt: now,
              nextAttemptAt: null,
              lastErrorCode: "stale_provider_call",
            },
          });
          if (updated.count !== 1) continue;
          uncertain += 1;
          await writePrismaAuditEvent(tx, systemAudit({
            unitId: candidate.unitId,
            action: "STOCK_ALERT_UNCERTAIN",
            alertId: candidate.id,
            productId: candidate.productId,
            alertType: candidate.alertType,
            cycle: candidate.cycle,
            quantity: candidate.quantity,
            minimumStock: candidate.minimumStock,
            attempts: candidate.attempts,
            errorCode: "stale_provider_call",
            deliveryAttemptId: candidate.deliveryAttemptId ?? undefined,
            providerCallStartedAt: candidate.providerCallStartedAt,
          }));
          continue;
        }
        const updated = await tx.stockAlert.updateMany({
          where: {
            id: candidate.id,
            unitId: scopedUnitId,
            status: "SENDING",
            deliveryAttemptId: candidate.deliveryAttemptId,
            providerCallStartedAt: null,
          },
          data: {
            status: "PENDING",
            attempts: Math.max(0, candidate.attempts - 1),
            claimedAt: null,
            deliveryAttemptId: null,
          },
        });
        if (updated.count !== 1) continue;
        recovered += 1;
        await writePrismaAuditEvent(tx, systemAudit({
          unitId: candidate.unitId,
          action: "STOCK_ALERT_CLAIM_RECOVERED",
          alertId: candidate.id,
          productId: candidate.productId,
          alertType: candidate.alertType,
          cycle: candidate.cycle,
          quantity: candidate.quantity,
          minimumStock: candidate.minimumStock,
          attempts: Math.max(0, candidate.attempts - 1),
        }));
      }
      return { recovered, uncertain };
    });
  }

  async claimNext(unitId: string, now: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    return await this.prisma.$transaction(async (tx) => {
      const candidates = await tx.stockAlert.findMany({
        where: {
          unitId: scopedUnitId,
          attempts: { lt: tx.stockAlert.fields.maxAttempts },
          OR: [
            { status: "PENDING" },
            { status: "FAILED", nextAttemptAt: { not: null, lte: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 10,
        include: { product: { select: { name: true } } },
      });
      for (const candidate of candidates) {
        if (candidate.attempts >= candidate.maxAttempts) continue;
        const deliveryAttemptId = crypto.randomUUID();
        const claimed = await tx.stockAlert.updateMany({
          where: { id: candidate.id, unitId: scopedUnitId, status: candidate.status, attempts: candidate.attempts },
          data: {
            status: "SENDING",
            attempts: { increment: 1 },
            claimedAt: now,
            deliveryAttemptId,
            providerCallStartedAt: null,
            failedAt: null,
            uncertainAt: null,
            nextAttemptAt: null,
            lastErrorCode: null,
          },
        });
        if (claimed.count !== 1) continue;
        return this.map({
          ...candidate,
          status: "SENDING",
          attempts: candidate.attempts + 1,
          claimedAt: now,
          deliveryAttemptId,
          providerCallStartedAt: null,
          failedAt: null,
          uncertainAt: null,
          nextAttemptAt: null,
          lastErrorCode: null,
        });
      }
      return null;
    });
  }

  async markProviderCallStarted(unitId: string, alert: StockAlertRecord, startedAt: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    const updated = await this.prisma.stockAlert.updateMany({
      where: {
        id: alert.id,
        unitId: scopedUnitId,
        status: "SENDING",
        deliveryAttemptId: alert.deliveryAttemptId,
        providerCallStartedAt: null,
      },
      data: { providerCallStartedAt: startedAt },
    });
    if (updated.count === 1) return true;
    const current = await this.prisma.stockAlert.findFirst({
      where: { id: alert.id, unitId: scopedUnitId },
      select: { status: true, deliveryAttemptId: true, providerCallStartedAt: true },
    });
    return current?.status === "SENDING"
      && current.deliveryAttemptId === alert.deliveryAttemptId
      && Boolean(current.providerCallStartedAt);
  }

  async markSent(unitId: string, alert: StockAlertRecord, sentAt: Date) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockAlert.updateMany({
        where: { id: alert.id, unitId: scopedUnitId, status: "SENDING", deliveryAttemptId: alert.deliveryAttemptId },
        data: { status: "SENT", sentAt, nextAttemptAt: null, lastErrorCode: null },
      });
      if (updated.count !== 1) return false;
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
        deliveryAttemptId: alert.deliveryAttemptId,
        providerCallStartedAt: alert.providerCallStartedAt,
      }));
      return true;
    });
  }

  async markFailed(unitId: string, alert: StockAlertRecord, input: { errorCode: string; nextAttemptAt?: Date; failedAt: Date }) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockAlert.updateMany({
        where: { id: alert.id, unitId: scopedUnitId, status: "SENDING", deliveryAttemptId: alert.deliveryAttemptId },
        data: {
          status: "FAILED",
          failedAt: input.failedAt,
          lastErrorCode: input.errorCode,
          nextAttemptAt: input.nextAttemptAt ?? null,
        },
      });
      if (updated.count !== 1) return false;
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
        deliveryAttemptId: alert.deliveryAttemptId,
        providerCallStartedAt: alert.providerCallStartedAt,
      }));
      return true;
    });
  }

  async markUncertain(unitId: string, alert: StockAlertRecord, input: { errorCode: string; uncertainAt: Date }) {
    const scopedUnitId = requireStockAlertUnitId(unitId);
    if (!alertBelongsToUnit(scopedUnitId, alert) || !alert.deliveryAttemptId) return false;
    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockAlert.updateMany({
        where: { id: alert.id, unitId: scopedUnitId, status: "SENDING", deliveryAttemptId: alert.deliveryAttemptId },
        data: {
          status: "UNCERTAIN",
          uncertainAt: input.uncertainAt,
          lastErrorCode: input.errorCode,
          nextAttemptAt: null,
        },
      });
      if (updated.count !== 1) return false;
      await writePrismaAuditEvent(tx, systemAudit({
        unitId: alert.unitId,
        action: "STOCK_ALERT_UNCERTAIN",
        alertId: alert.id,
        productId: alert.productId,
        alertType: alert.alertType,
        cycle: alert.cycle,
        quantity: alert.quantity,
        minimumStock: alert.minimumStock,
        attempts: alert.attempts,
        errorCode: input.errorCode,
        deliveryAttemptId: alert.deliveryAttemptId,
        providerCallStartedAt: alert.providerCallStartedAt,
      }));
      return true;
    });
  }
}

function safeErrorCode(error: unknown) {
  const reason = error && typeof error === "object" && "reason" in error ? String(error.reason) : "unavailable";
  return [
    "configuration",
    "timeout",
    "http",
    "network",
    "unavailable",
    "claim_lost",
    "attempt_id_missing",
    "isolated_outbound_disabled",
    "isolated_outbound_invalid_mode",
    "isolated_outbound_allowlist_invalid",
    "isolated_outbound_not_allowlisted",
  ].includes(reason) ? reason : "unavailable";
}

function isAmbiguousProviderFailure(errorCode: string, providerCallStarted: boolean) {
  return providerCallStarted && ["timeout", "network", "unavailable"].includes(errorCode);
}

export class StockAlertDispatcher {
  private readonly unitId: string;

  constructor(private readonly input: {
    unitId: string;
    store: StockAlertDeliveryStore;
    send: (phone: string, text: string, attempt?: WhatsappDeliveryAttemptContext) => Promise<void>;
    resolveOwnerPhone: (unitId: string) => string | undefined;
    now?: () => Date;
    baseBackoffMs?: number;
    maxPerRun?: number;
  }) {
    this.unitId = requireStockAlertUnitId(input.unitId);
    if (typeof input.resolveOwnerPhone !== "function") {
      throw new Error("Stock alert dispatcher requires an owner resolver.");
    }
  }

  async dispatchDue() {
    const maxPerRun = Math.max(1, this.input.maxPerRun ?? 20);
    let processed = 0;
    let sent = 0;
    let failed = 0;
    const recovery = await this.input.store.recoverStale(this.unitId, this.input.now?.() ?? new Date());
    let uncertain = recovery.uncertain;
    while (processed < maxPerRun) {
      const now = this.input.now?.() ?? new Date();
      const alert = await this.input.store.claimNext(this.unitId, now);
      if (!alert) break;
      if (alert.unitId !== this.unitId) {
        throw new Error("Stock alert store returned an alert outside the dispatcher unit scope.");
      }
      processed += 1;
      let providerCallStarted = false;
      try {
        const ownerPhone = this.input.resolveOwnerPhone(this.unitId);
        if (!ownerPhone) throw Object.assign(new Error("owner_not_configured"), { reason: "configuration" });
        if (!alert.deliveryAttemptId) {
          throw Object.assign(new Error("stock_alert_attempt_id_missing"), { reason: "attempt_id_missing" });
        }
        await this.input.send(ownerPhone, buildStockAlertMessage({
          type: alert.alertType,
          productName: alert.productName,
          quantity: alert.quantity,
          minimumStock: alert.minimumStock,
        }), {
          attemptId: alert.deliveryAttemptId,
          onProviderCallStarted: async () => {
            if (providerCallStarted) return;
            const startedAt = this.input.now?.() ?? new Date();
            const marked = await this.input.store.markProviderCallStarted(this.unitId, alert, startedAt);
            if (!marked) throw Object.assign(new Error("stock_alert_claim_lost"), { reason: "claim_lost" });
            providerCallStarted = true;
            alert.providerCallStartedAt = startedAt;
          },
        });
        if (await this.input.store.markSent(this.unitId, alert, this.input.now?.() ?? new Date())) sent += 1;
      } catch (error) {
        const failedAt = this.input.now?.() ?? new Date();
        const errorCode = safeErrorCode(error);
        if (isAmbiguousProviderFailure(errorCode, providerCallStarted)) {
          if (await this.input.store.markUncertain(this.unitId, alert, { errorCode, uncertainAt: failedAt })) uncertain += 1;
          continue;
        }
        const canRetry = alert.attempts < alert.maxAttempts;
        const base = Math.max(1, this.input.baseBackoffMs ?? 30_000);
        const nextAttemptAt = canRetry
          ? new Date(failedAt.getTime() + base * 2 ** Math.max(0, alert.attempts - 1))
          : undefined;
        if (await this.input.store.markFailed(this.unitId, alert, {
          errorCode,
          nextAttemptAt,
          failedAt,
        })) failed += 1;
      }
    }
    return { processed, sent, failed, uncertain, recovered: recovery.recovered };
  }
}

export function resolveConfiguredStockAlertOwner(unitId: string) {
  const configuredUnit = String(process.env.AI_WHATSAPP_UNIT_ID ?? "").trim();
  if (!configuredUnit || configuredUnit !== unitId) return undefined;
  const digits = String(process.env.AI_WHATSAPP_OWNER_PHONE ?? "").replace(/\D/g, "");
  return digits || undefined;
}
