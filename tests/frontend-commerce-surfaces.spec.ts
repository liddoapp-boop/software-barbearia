import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync("public/index.html", "utf8");
const appSource = readFileSync("public/app.js", "utf8");
const commerceCss = readFileSync("public/styles/commerce-surfaces.css", "utf8");
const checkoutSource = readFileSync("public/modules/checkout-flow.js", "utf8");

function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const signatureEnd = source.indexOf(") {", start);
  expect(signatureEnd).toBeGreaterThanOrEqual(0);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Function not closed: ${name}`);
}

function loadModule(path: string, exports: string[]) {
  let source = readFileSync(path, "utf8");
  source = source.replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
  source = source.replace(/export const /g, "const ");
  source = source.replace(/export function /g, "function ");
  source += `\nmodule.exports = { ${exports.join(", ")} };`;
  const context = {
    module: { exports: {} as Record<string, any> },
    renderInlineFeedback: () => {},
  };
  vm.runInNewContext(source, context, { filename: path });
  return context.module.exports;
}

describe("superficies operacionais de PDV e checkout", () => {
  it("organiza o PDV real em selecao, conferencia e liquidacao preservando contratos", () => {
    expect(indexSource).toContain("commerce-zone-selection");
    expect(indexSource).toContain("commerce-zone-review");
    expect(indexSource).toContain("pdv-liquidation-zone");
    expect(indexSource).toContain('id="pdvProductSearch"');
    expect(indexSource).toContain('id="saleCategoryList"');
    expect(indexSource).toContain('id="saleProductRail"');
    expect(indexSource).toContain('id="saleCartList"');
    expect(indexSource).toContain('id="saleCheckoutActionMount"');
    expect(indexSource).toContain('id="saleFeedback"');
  });

  it("carrega a camada dedicada por ultimo e mantem o escopo no PDV e checkout", () => {
    expect(indexSource.indexOf("/styles/interaction-surfaces.css")).toBeGreaterThan(
      indexSource.indexOf("/styles/commerce-surfaces.css"),
    );
    expect(commerceCss).toContain("#operationSection");
    expect(commerceCss).toContain("#appointmentCheckoutModal");
    expect(commerceCss).not.toMatch(/#agendaSection|#clientsSection|#financeiroSection|#appSidebar/);
  });

  it("preserva o unico endpoint oficial, a idempotencia e bloqueia reenvio em processamento", () => {
    const submitCheckout = functionBody(appSource, "submitCheckoutModal");
    expect(submitCheckout).toContain("if (checkoutModalState.submitting) return");
    expect(submitCheckout).toContain('buildOperationIdempotencyKey("appointment-checkout")');
    expect(submitCheckout).toContain("`${API}/appointments/${appointment.id}/checkout`");
    expect(submitCheckout).toContain('completedAppointment.status !== "COMPLETED"');
    expect(submitCheckout).not.toContain("/complete");
    expect(appSource).toContain("if (saleSubmitting) return");
    expect(appSource).toContain('buildOperationIdempotencyKey("product-sale")');
  });

  it("mantem formas existentes, total calculado e sem criar desconto comercial", () => {
    const ensureCheckout = functionBody(appSource, "ensureCheckoutModal");
    const recompute = functionBody(appSource, "recomputeCheckoutTotal");
    expect(ensureCheckout).toContain('id="checkoutPaymentMethod"');
    expect(ensureCheckout).toContain('id="checkoutTotal"');
    expect(ensureCheckout).toContain("checkout-consequence");
    expect(recompute).toContain("buildCheckoutTotals");
    expect(recompute).toContain("data-checkout-line-subtotal");
    expect(ensureCheckout.toLowerCase()).not.toContain("desconto");
  });

  it("explicita indisponibilidade e risco de estoque sem remover a validacao oficial", () => {
    const catalog = functionBody(appSource, "renderSaleProductCatalog");
    const checkoutProducts = functionBody(appSource, "renderCheckoutProducts");
    const submitCheckout = functionBody(appSource, "submitCheckoutModal");
    expect(catalog).toContain("is-out-of-stock");
    expect(catalog).toContain("Sem estoque");
    expect(catalog).toContain("disabled");
    expect(checkoutProducts).toContain("is-stock-insufficient");
    expect(checkoutProducts).toContain("aria-invalid");
    expect(submitCheckout).toContain("Quantidade maior que o estoque");
  });

  it("mantem calculos de um item, varios itens, quantidade, remocao e estoque insuficiente", () => {
    const pdv = loadModule("public/modules/pdv.js", [
      "addItemToCart",
      "updateCartItemQty",
      "removeCartItem",
      "computeCartTotals",
    ]);
    const pomada = { id: "pomada", name: "Pomada", salePrice: 25, stockQty: 4 };
    const shampoo = { id: "shampoo", name: "Shampoo", salePrice: 18.5, stockQty: 3 };

    let cart = pdv.addItemToCart([], pomada, 1);
    expect(pdv.computeCartTotals(cart)).toEqual({ totalAmount: 25, totalItems: 1 });
    cart = pdv.addItemToCart(cart, shampoo, 2);
    expect(pdv.computeCartTotals(cart)).toEqual({ totalAmount: 62, totalItems: 3 });
    cart = pdv.updateCartItemQty(cart, "pomada", 3);
    expect(pdv.computeCartTotals(cart)).toEqual({ totalAmount: 112, totalItems: 5 });
    cart = pdv.removeCartItem(cart, "shampoo");
    expect(pdv.computeCartTotals(cart)).toEqual({ totalAmount: 75, totalItems: 3 });
    expect(() => pdv.updateCartItemQty(cart, "pomada", 5)).toThrow(/Estoque insuficiente/);
  });

  it("mantem checkout de servico e de servico com produto", () => {
    const checkout = loadModule("public/modules/checkout-flow.js", ["buildCheckoutTotals"]);
    const products = { pomada: { id: "pomada", name: "Pomada", salePrice: 25 } };
    const appointment = {
      serviceItems: [
        { serviceNameSnapshot: "Corte", servicePriceSnapshot: 40 },
        { serviceNameSnapshot: "Barba", servicePriceSnapshot: 20 },
      ],
    };
    expect(checkout.buildCheckoutTotals(appointment, [], products)).toMatchObject({
      servicePrice: 60,
      productsSubtotal: 0,
      total: 60,
    });
    expect(checkout.buildCheckoutTotals(appointment, [{ productId: "pomada", quantity: 2 }], products))
      .toMatchObject({ servicePrice: 60, productsSubtotal: 50, total: 110 });
  });

  it("preserva teclado, mobile, alvos de toque e reduced motion", () => {
    expect(commerceCss).toContain(":focus-visible");
    expect(commerceCss).toContain("@media (max-width: 860px)");
    expect(commerceCss).toContain("@media (max-width: 640px)");
    expect(commerceCss).toContain("position: sticky");
    expect(commerceCss).toContain("overscroll-behavior: contain");
    expect(commerceCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(commerceCss).toContain("min-height: 44px");
    expect(checkoutSource).toContain('CHECKOUT_FINAL_BUTTON_LABEL = "Confirmar pagamento e concluir"');
  });
});
