import { Prisma, PrismaClient } from "@prisma/client";
import { InMemoryStore } from "../infrastructure/in-memory-store";
import { hashIdempotencyPayload } from "./idempotency";
import {
  STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
  StockEntryPreview,
  StockEntryPreviewRecord,
  StockEntryPreviewStatus,
  buildStockEntryPreviewAction,
  buildStockEntryPreviewStorageKey,
  stockEntryPreviewSchema,
} from "./stock-entry";

function parseRecord(input: {
  action: string;
  payloadHash: string;
  status: string;
  responseJson: unknown;
}) {
  const response = input.responseJson && typeof input.responseJson === "object" && !Array.isArray(input.responseJson)
    ? input.responseJson as Record<string, unknown>
    : {};
  const preview = stockEntryPreviewSchema.safeParse(response.preview);
  if (!preview.success) return null;
  return {
    action: input.action,
    key: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
    payloadHash: input.payloadHash,
    status: input.status as StockEntryPreviewStatus,
    preview: preview.data,
    response: response.result as StockEntryPreviewRecord["response"],
  } satisfies StockEntryPreviewRecord;
}

export class StockEntryPreviewRepository {
  constructor(
    private readonly input: {
      backend: "memory" | "prisma";
      memoryStore: InMemoryStore;
      prisma?: PrismaClient;
    },
  ) {}

  private action(preview: Pick<StockEntryPreview, "actorId" | "phoneFingerprint">) {
    return buildStockEntryPreviewAction(preview);
  }

  async save(preview: StockEntryPreview) {
    const action = this.action(preview);
    const payloadHash = hashIdempotencyPayload(preview);
    const record: StockEntryPreviewRecord = {
      action,
      key: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
      payloadHash,
      status: "PENDING",
      preview,
    };
    if (this.input.backend === "memory") {
      this.input.memoryStore.aiWhatsappStockEntryPreviews.set(buildStockEntryPreviewStorageKey(preview.unitId, action), record);
      return record;
    }
    await this.input.prisma!.idempotencyRecord.upsert({
      where: {
        unitId_action_idempotencyKey: {
          unitId: preview.unitId,
          action,
          idempotencyKey: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
        },
      },
      create: {
        id: preview.id,
        unitId: preview.unitId,
        action,
        idempotencyKey: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
        payloadHash,
        status: "PENDING",
        responseJson: { preview } as Prisma.InputJsonValue,
        resolution: preview.id,
        expiresAt: new Date(preview.expiresAt),
      },
      update: {
        payloadHash,
        status: "PENDING",
        responseJson: { preview } as Prisma.InputJsonValue,
        resolution: preview.id,
        expiresAt: new Date(preview.expiresAt),
      },
    });
    return record;
  }

  async find(input: { unitId: string; actorId: string; phoneFingerprint: string }) {
    const action = buildStockEntryPreviewAction(input);
    let record: StockEntryPreviewRecord | null;
    if (this.input.backend === "memory") {
      record = (this.input.memoryStore.aiWhatsappStockEntryPreviews.get(buildStockEntryPreviewStorageKey(input.unitId, action)) as StockEntryPreviewRecord | undefined) ?? null;
    } else {
      const row = await this.input.prisma!.idempotencyRecord.findUnique({
        where: {
          unitId_action_idempotencyKey: {
            unitId: input.unitId,
            action,
            idempotencyKey: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
          },
        },
        select: { action: true, payloadHash: true, status: true, responseJson: true },
      });
      record = row ? parseRecord(row) : null;
    }
    if (!record) return null;
    if (record.status === "PENDING" && new Date(record.preview.expiresAt).getTime() <= Date.now()) {
      if (this.input.backend === "memory") {
        record.status = "EXPIRED";
      } else {
        await this.input.prisma!.idempotencyRecord.updateMany({
          where: {
            unitId: input.unitId,
            action,
            idempotencyKey: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
            payloadHash: record.payloadHash,
            status: "PENDING",
          },
          data: { status: "EXPIRED" },
        });
        record = { ...record, status: "EXPIRED" };
      }
    }
    return record;
  }

  async cancel(record: StockEntryPreviewRecord) {
    if (this.input.backend === "memory") {
      const stored = this.input.memoryStore.aiWhatsappStockEntryPreviews.get(
        buildStockEntryPreviewStorageKey(record.preview.unitId, record.action),
      ) as StockEntryPreviewRecord | undefined;
      if (!stored || stored.preview.id !== record.preview.id || stored.status !== "PENDING") return false;
      stored.status = "CANCELLED";
      return true;
    }
    const updated = await this.input.prisma!.idempotencyRecord.updateMany({
      where: {
        unitId: record.preview.unitId,
        action: record.action,
        idempotencyKey: STOCK_ENTRY_PREVIEW_ACTIVE_KEY,
        payloadHash: record.payloadHash,
        resolution: record.preview.id,
        status: "PENDING",
      },
      data: { status: "CANCELLED" },
    });
    return updated.count === 1;
  }
}
