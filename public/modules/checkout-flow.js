export const CHECKOUT_FINAL_BUTTON_LABEL = "Confirmar pagamento e concluir";
export const CHECKOUT_SUCCESS_MESSAGE = "Atendimento concluido com sucesso.";

export function validateAppointmentCheckoutTarget(appointment) {
  if (!appointment || !appointment.id) {
    return { ok: false, message: "Atendimento invalido para checkout." };
  }
  if (appointment.status !== "IN_SERVICE") {
    return { ok: false, message: "Checkout disponivel apenas para atendimento em andamento." };
  }
  return { ok: true, message: "" };
}

export function normalizeCheckoutProducts(products = [], productsById = {}) {
  if (!Array.isArray(products)) return [];
  return products
    .map((item) => {
      const productId = String(item?.productId || "").trim();
      const quantity = Math.max(1, Math.trunc(Number(item?.quantity || 1)));
      const product = productsById[productId];
      const unitPrice = Number(product?.salePrice || 0);
      return {
        productId,
        name: product?.name || "",
        quantity,
        unitPrice,
        subtotal: Number((unitPrice * quantity).toFixed(2)),
      };
    })
    .filter((item) => item.productId);
}

export function buildCheckoutTotals(appointment, products = [], productsById = {}) {
  const serviceItems = Array.isArray(appointment?.serviceItems) ? appointment.serviceItems : [];
  const servicePrice = serviceItems.length
    ? serviceItems.reduce((acc, item) => acc + Number(item?.servicePriceSnapshot || item?.price || 0), 0)
    : Number(appointment?.servicePrice || appointment?.totalPriceSnapshot || 0);
  const productRows = normalizeCheckoutProducts(products, productsById);
  const productsSubtotal = productRows.reduce((acc, item) => acc + item.subtotal, 0);
  return {
    servicePrice: Number(servicePrice.toFixed(2)),
    productRows,
    productsSubtotal: Number(productsSubtotal.toFixed(2)),
    total: Number((servicePrice + productsSubtotal).toFixed(2)),
  };
}
