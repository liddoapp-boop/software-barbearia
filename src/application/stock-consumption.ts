import {
  Product,
  ServiceStockConsumptionItem,
  StockMovement,
  StockReplenishmentSuggestion,
} from "../domain/types";

function toFixedNumber(value: number, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

export function normalizeConsumptionItems(
  items: ServiceStockConsumptionItem[],
): ServiceStockConsumptionItem[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: String(item.productId || "").trim(),
      quantityPerService: Number(item.quantityPerService),
      wastePct: item.wastePct == null ? 0 : Number(item.wastePct),
      isCritical: Boolean(item.isCritical),
    }))
    .filter(
      (item) =>
        Boolean(item.productId) &&
        Number.isFinite(item.quantityPerService) &&
        item.quantityPerService > 0 &&
        Number.isFinite(item.wastePct) &&
        item.wastePct >= 0,
    )
    .map((item) => ({
      ...item,
      quantityPerService: toFixedNumber(item.quantityPerService, 3),
      wastePct: toFixedNumber(item.wastePct ?? 0, 2),
    }));
}

export function computeEffectiveConsumptionQty(item: ServiceStockConsumptionItem) {
  const quantityPerService = Number(item.quantityPerService ?? 0);
  const wastePct = Number(item.wastePct ?? 0);
  const effective = quantityPerService * (1 + wastePct / 100);
  if (!Number.isFinite(effective) || effective <= 0) return 0;
  return Math.max(1, Math.ceil(effective));
}

function calculateUrgency(stockQty: number, minStockAlert: number) {
  if (stockQty <= 0) return "CRITICAL" as const;
  if (stockQty <= Math.max(1, Math.floor(minStockAlert * 0.5))) return "HIGH" as const;
  if (stockQty <= minStockAlert) return "MEDIUM" as const;
  return "LOW" as const;
}

export function buildReplenishmentSuggestions(input: {
  products: Array<Pick<Product, "id" | "name" | "stockQty" | "minStockAlert" | "active">>;
  stockMovements: Array<
    Pick<StockMovement, "productId" | "movementType" | "quantity" | "occurredAt" | "referenceType">
  >;
  limit?: number;
}): StockReplenishmentSuggestion[] {
  const now = Date.now();
  const horizonStart = now - 30 * 24 * 60 * 60 * 1000;
  const movementsByProduct = new Map<
    string,
    Array<Pick<StockMovement, "movementType" | "quantity" | "occurredAt" | "referenceType">>
  >();

  for (const movement of input.stockMovements) {
    if (!movement?.productId) continue;
    if (!movementsByProduct.has(movement.productId)) {
      movementsByProduct.set(movement.productId, []);
    }
    movementsByProduct.get(movement.productId)?.push({
      movementType: movement.movementType,
      quantity: Number(movement.quantity ?? 0),
      occurredAt: movement.occurredAt,
      referenceType: movement.referenceType,
    });
  }

  const suggestions = input.products
    .filter((product) => product.active)
    .map((product) => {
      const stockQty = Number(product.stockQty ?? 0);
      const minStockAlert = Number(product.minStockAlert ?? 0);
      const productMovements = movementsByProduct.get(product.id) ?? [];

      let monthlyOutflow = 0;
      let lastConsumptionAt: Date | null = null;
      for (const movement of productMovements) {
        const occurredAtMs = new Date(movement.occurredAt).getTime();
        if (!Number.isFinite(occurredAtMs) || occurredAtMs < horizonStart) continue;
        if (
          movement.movementType === "OUT" ||
          movement.movementType === "LOSS" ||
          movement.movementType === "INTERNAL_USE"
        ) {
          monthlyOutflow += Number(movement.quantity ?? 0);
          if (
            movement.referenceType === "SERVICE_CONSUMPTION" &&
            (!lastConsumptionAt || new Date(movement.occurredAt) > lastConsumptionAt)
          ) {
            lastConsumptionAt = new Date(movement.occurredAt);
          }
        }
      }

      const dailyOutflow = monthlyOutflow > 0 ? monthlyOutflow / 30 : 0;
      const estimatedDaysToRupture =
        stockQty <= 0 ? 0 : dailyOutflow > 0 ? Math.max(0, Math.floor(stockQty / dailyOutflow)) : 999;
      const urgency = calculateUrgency(stockQty, minStockAlert);
      const baseTarget = Math.max(minStockAlert * 2, minStockAlert + 1);
      const outflowSafety = Math.ceil(dailyOutflow * 14);
      const targetStock = Math.max(baseTarget, minStockAlert + outflowSafety);
      const recommendedPurchaseQty = Math.max(0, Math.ceil(targetStock - stockQty));

      return {
        productId: product.id,
        productName: product.name,
        currentQty: stockQty,
        minStockAlert,
        urgency,
        recommendedPurchaseQty,
        estimatedDaysToRupture,
        lastConsumptionAt: lastConsumptionAt?.toISOString(),
      };
    })
    .filter(
      (item) =>
        item.urgency !== "LOW" ||
        item.recommendedPurchaseQty > 0 ||
        item.estimatedDaysToRupture <= 7,
    )
    .sort((a, b) => {
      const weight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const urgencyDiff = weight[b.urgency] - weight[a.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      if (a.estimatedDaysToRupture !== b.estimatedDaysToRupture) {
        return a.estimatedDaysToRupture - b.estimatedDaysToRupture;
      }
      return b.recommendedPurchaseQty - a.recommendedPurchaseQty;
    });

  return suggestions.slice(0, Math.min(Math.max(input.limit ?? 12, 1), 50));
}
