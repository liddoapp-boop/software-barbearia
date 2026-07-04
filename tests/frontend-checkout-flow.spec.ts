import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadCheckoutFlow() {
  let source = readFileSync("public/modules/checkout-flow.js", "utf8");
  source = source.replace(/export const /g, "const ");
  source = source.replace(/export function /g, "function ");
  source += `
module.exports = {
  CHECKOUT_FINAL_BUTTON_LABEL,
  CHECKOUT_SUCCESS_MESSAGE,
  validateAppointmentCheckoutTarget,
  normalizeCheckoutProducts,
  buildCheckoutTotals,
};`;
  const context = { module: { exports: {} as Record<string, unknown> } };
  vm.runInNewContext(source, context, { filename: "public/modules/checkout-flow.js" });
  return context.module.exports as Record<string, any>;
}

function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const signatureEnd = source.indexOf(") {", start);
  expect(signatureEnd).toBeGreaterThanOrEqual(0);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Function not closed: ${name}`);
}

describe("fluxo frontend de checkout do atendimento", () => {
  it("valida que checkout so abre para atendimento IN_SERVICE", () => {
    const { validateAppointmentCheckoutTarget } = loadCheckoutFlow();

    expect(validateAppointmentCheckoutTarget({ id: "appt-1", status: "IN_SERVICE" })).toEqual({
      ok: true,
      message: "",
    });
    expect(validateAppointmentCheckoutTarget({ id: "appt-1", status: "COMPLETED" })).toMatchObject({
      ok: false,
    });
    expect(validateAppointmentCheckoutTarget({ status: "IN_SERVICE" })).toMatchObject({
      ok: false,
    });
    expect(validateAppointmentCheckoutTarget({
      id: "appt-multi",
      status: "IN_SERVICE",
      serviceItems: [{ serviceId: "svc-corte" }, { serviceId: "svc-barba" }],
    })).toEqual({ ok: true, message: "" });
    expect(validateAppointmentCheckoutTarget({
      id: "appt-rule",
      status: "IN_SERVICE",
      ruleLabel: "Corte + Barba",
    })).toEqual({ ok: true, message: "" });
    expect(validateAppointmentCheckoutTarget({
      id: "appt-label",
      status: "IN_SERVICE",
      service: "Corte + Barba",
    })).toEqual({ ok: true, message: "" });
  });

  it("calcula produtos, subtotal e total sem confiar no backend do teste", () => {
    const { buildCheckoutTotals } = loadCheckoutFlow();
    const productsById = {
      pomada: { id: "pomada", name: "Pomada", salePrice: 25 },
      shampoo: { id: "shampoo", name: "Shampoo", salePrice: 18.5 },
    };

    const withProduct = buildCheckoutTotals(
      {
        serviceItems: [
          { serviceNameSnapshot: "Corte", servicePriceSnapshot: 30 },
          { serviceNameSnapshot: "Barba", servicePriceSnapshot: 20 },
        ],
      },
      [{ productId: "pomada", quantity: 1 }],
      productsById,
    );
    expect(withProduct).toMatchObject({
      servicePrice: 50,
      productsSubtotal: 25,
      total: 75,
    });

    const afterRemove = buildCheckoutTotals({ servicePrice: 30 }, [], productsById);
    expect(afterRemove).toMatchObject({
      productsSubtotal: 0,
      total: 30,
    });
  });

  it("monta opcoes de produto do checkout a partir do catalogo carregado, sem filtro fixo por Pomada", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const renderProductsFlow = functionBody(appSource, "renderCheckoutProducts");

    expect(renderProductsFlow).toContain("Object.values(productsById)");
    expect(renderProductsFlow).toContain("item.stockQty");
    expect(renderProductsFlow).not.toContain("prd-pomada");
    expect(renderProductsFlow).not.toContain(".slice(0, 1)");
    expect(renderProductsFlow).not.toContain("limit=1");
  });

  it("mantem o checkout na Agenda, fecha detalhe antes de abrir e nao navega para Financeiro", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const openFlow = functionBody(appSource, "openAppointmentCheckout");
    const submitFlow = functionBody(appSource, "submitCheckoutModal");
    const closeFlow = functionBody(appSource, "closeCheckoutModal");

    expect(openFlow.indexOf("validateAppointmentCheckoutTarget")).toBeGreaterThanOrEqual(0);
    expect(openFlow).toContain("renderInlineAppointmentActionMessage");
    expect(openFlow.indexOf("closeAppointmentDetailPanel();")).toBeGreaterThanOrEqual(0);
    expect(openFlow.indexOf("closeAppointmentDetailPanel();")).toBeLessThan(
      openFlow.indexOf("openCheckoutModal(appointment"),
    );
    expect(closeFlow).toContain("resetCheckoutModalState()");
    expect(appSource).toContain("closeScheduleDrawer();");
    expect(openFlow).not.toContain('navigate("financeiro"');
    expect(submitFlow).not.toContain('navigate("financeiro"');
    expect(closeFlow).not.toContain("callJson(");
  });

  it("carrega detalhe fresco antes de concluir pela Agenda e pela Central sem bloqueio multi-servico", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const appointmentsSource = readFileSync("public/modules/agendamentos.js", "utf8");
    expect(appSource).toContain('ensureAppointmentLoaded(item.id, { force: true })');
    expect(appSource).not.toContain("isMultiServiceCheckoutBlocked");
    expect(appSource).not.toContain("Concluir indisponivel");
    expect(appointmentsSource).not.toContain("Concluir indisponivel");
    expect(appointmentsSource).not.toContain("appointment-checkout-disabled");
  });

  it("usa o texto financeiro claro e so fecha quando a API confirma COMPLETED", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const checkoutSource = readFileSync("public/modules/checkout-flow.js", "utf8");
    const submitFlow = functionBody(appSource, "submitCheckoutModal");

    expect(checkoutSource).toContain(
      'CHECKOUT_FINAL_BUTTON_LABEL = "Confirmar pagamento e concluir"',
    );
    expect(appSource).toContain('select id="checkoutPaymentMethod" class="ds-input" required');
    expect(appSource).toContain("Servicos realizados");
    expect(appSource).toContain("Subtotal dos servicos");
    expect(submitFlow).toContain('completedAppointment.id !== appointment.id');
    expect(submitFlow).toContain('completedAppointment.status !== "COMPLETED"');
    expect(submitFlow).toContain("closeCheckoutModal({ returnFocus: false })");
    expect(submitFlow).toContain("CHECKOUT_SUCCESS_MESSAGE");
  });

  it("preserva um unico modal oficial, cancelamento limpo e layout mobile sem overflow estrutural", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const cssSource = readFileSync("public/styles/layout.css", "utf8").replace(/\r\n/g, "\n");

    expect(appSource).toContain('document.getElementById("appointmentCheckoutModal")');
    expect(appSource).toContain("resetCheckoutModalState()");
    expect(appSource).toContain("checkoutModalState.submitting");
    expect(cssSource).toContain(".checkout-modal {\n  max-height:");
    expect(cssSource).toContain(".checkout-product-row {\n    grid-template-columns: 1fr;");
  });
});
