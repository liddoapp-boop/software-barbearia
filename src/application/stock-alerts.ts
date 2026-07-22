export type StockSituation = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export type StockAlertType = "LOW_STOCK" | "OUT_OF_STOCK";
export type StockAlertDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "UNCERTAIN";

export type StockAlertRecord = {
  id: string;
  unitId: string;
  productId: string;
  productName: string;
  alertType: StockAlertType;
  cycle: number;
  status: StockAlertDeliveryStatus;
  quantity: number;
  minimumStock: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: Date;
  claimedAt?: Date;
  deliveryAttemptId?: string;
  providerCallStartedAt?: Date;
  sentAt?: Date;
  failedAt?: Date;
  uncertainAt?: Date;
  lastErrorCode?: string;
  createdAt: Date;
  updatedAt: Date;
};

export function classifyStockSituation(quantity: number, minimumStock: number): StockSituation {
  const current = Math.trunc(Number(quantity) || 0);
  const minimum = Math.max(0, Math.trunc(Number(minimumStock) || 0));
  if (current <= 0) return "OUT_OF_STOCK";
  if (minimum > 0 && current <= minimum) return "LOW_STOCK";
  return "IN_STOCK";
}

export function evaluateStockTransition(input: {
  previousQuantity: number;
  currentQuantity: number;
  minimumStock: number;
  previousMinimumStock?: number;
  cycleActive: boolean;
}) {
  const previousSituation = classifyStockSituation(
    input.previousQuantity,
    input.previousMinimumStock ?? input.minimumStock,
  );
  const currentSituation = classifyStockSituation(input.currentQuantity, input.minimumStock);
  const resetsCycle = input.cycleActive && currentSituation === "IN_STOCK";
  const startsCycle = !input.cycleActive
    && previousSituation === "IN_STOCK"
    && currentSituation !== "IN_STOCK";

  let alertType: StockAlertType | null = null;
  if (startsCycle) {
    alertType = currentSituation as StockAlertType;
  } else if (
    input.cycleActive
    && previousSituation === "LOW_STOCK"
    && currentSituation === "OUT_OF_STOCK"
  ) {
    alertType = "OUT_OF_STOCK";
  }

  return {
    previousSituation,
    currentSituation,
    alertType,
    startsCycle,
    resetsCycle,
  };
}

export function buildStockAlertMessage(input: {
  type: StockAlertType;
  productName: string;
  quantity: number;
  minimumStock: number;
}) {
  if (input.type === "OUT_OF_STOCK") {
    return [
      "🚨 Produto sem estoque",
      "",
      `Produto: ${input.productName}`,
      "Estoque atual: 0 unidades",
      `Estoque mínimo: ${input.minimumStock}`,
    ].join("\n");
  }
  return [
    "⚠️ Estoque baixo",
    "",
    `Produto: ${input.productName}`,
    `Estoque atual: ${input.quantity}`,
    `Estoque mínimo: ${input.minimumStock}`,
    "",
    "Considere realizar uma nova compra.",
  ].join("\n");
}

export function stockAlertIdempotencyKey(input: {
  unitId: string;
  productId: string;
  alertType: StockAlertType;
  cycle: number;
}) {
  return `${input.unitId}:${input.productId}:${input.alertType}:${input.cycle}`;
}
