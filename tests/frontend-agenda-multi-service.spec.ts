import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadSelectionModule() {
  let source = readFileSync("public/modules/appointment-service-selection.js", "utf8");
  source = source.replace(/export const /g, "const ");
  source = source.replace(/export function /g, "function ");
  source += `
    module.exports = {
      APPOINTMENT_SERVICES_MAX,
      addServiceSelection,
      removeServiceSelection,
      clearServiceSelection,
      getSelectedServiceIds,
      validateSelectedServices,
      buildServiceSelectionLabel,
      calculateCatalogTotal,
      interpretBackendSummary,
      isMultiServiceAppointment,
      normalizeAppointmentServiceItems,
      normalizeSelectedServices,
    };
  `;
  const context = { module: { exports: {} as Record<string, any> } };
  vm.runInNewContext(source, context, { filename: "public/modules/appointment-service-selection.js" });
  return context.module.exports;
}

function loadCheckoutModule() {
  let source = readFileSync("public/modules/checkout-flow.js", "utf8");
  source = source.replace(/export const /g, "const ");
  source = source.replace(/export function /g, "function ");
  source += "\nmodule.exports = { validateAppointmentCheckoutTarget, buildCheckoutTotals };";
  const context = { module: { exports: {} as Record<string, any> } };
  vm.runInNewContext(source, context, { filename: "public/modules/checkout-flow.js" });
  return context.module.exports;
}

describe("agenda interna multi-servico", () => {
  const corte = { id: "svc-corte", name: "Corte", price: 30, durationMin: 30, active: true };
  const barba = { id: "svc-barba", name: "Barba", price: 20, durationMin: 30, active: true };

  it("seleciona de 1 a 6 servicos preservando ordem, sem duplicar e com remocao/limpeza", () => {
    const selection = loadSelectionModule();
    let state: any[] = [];
    state = selection.addServiceSelection(state, corte).selected;
    state = selection.addServiceSelection(state, barba).selected;
    expect(selection.getSelectedServiceIds(state)).toEqual(["svc-corte", "svc-barba"]);
    expect(selection.addServiceSelection(state, corte)).toMatchObject({
      ok: false,
      selected: state,
    });
    for (let index = 3; index <= 6; index += 1) {
      state = selection.addServiceSelection(state, {
        id: `svc-${index}`,
        name: `Servico ${index}`,
        price: index,
        durationMin: 15,
        active: true,
      }).selected;
    }
    expect(state).toHaveLength(6);
    expect(selection.addServiceSelection(state, { id: "svc-7", name: "Setimo", active: true })).toMatchObject({
      ok: false,
    });
    state = selection.removeServiceSelection(state, "svc-barba");
    expect(selection.getSelectedServiceIds(state)).toEqual(["svc-corte", "svc-3", "svc-4", "svc-5", "svc-6"]);
    expect(selection.clearServiceSelection()).toEqual([]);
    expect(selection.validateSelectedServices([])).toMatchObject({ ok: false });
  });

  it("calcula apenas previa visual e interpreta duracao/regra vindas do backend", () => {
    const selection = loadSelectionModule();
    const selected = [corte, barba];
    expect(selection.calculateCatalogTotal(selected)).toBe(50);
    const summary = selection.interpretBackendSummary({
      summary: {
        serviceItems: [
          { serviceId: "svc-corte", position: 0, serviceNameSnapshot: "Corte", servicePriceSnapshot: 30, serviceDurationMinSnapshot: 30 },
          { serviceId: "svc-barba", position: 1, serviceNameSnapshot: "Barba", servicePriceSnapshot: 20, serviceDurationMinSnapshot: 30 },
        ],
        totalPriceSnapshot: 50,
        effectiveDurationMin: 45,
        ruleLabel: "Duracao otimizada pela combinacao Corte + Barba",
      },
    }, selected);
    expect(summary).toMatchObject({
      totalPrice: 50,
      effectiveDurationMin: 45,
      ruleLabel: "Duracao otimizada pela combinacao Corte + Barba",
    });
    expect(selection.buildServiceSelectionLabel(summary.serviceItems)).toBe("Corte + Barba");
  });

  it("normaliza serviceItems e fallback legado por serviceId", () => {
    const selection = loadSelectionModule();
    const composite = selection.normalizeAppointmentServiceItems({
      serviceItems: [
        { serviceId: "svc-barba", position: 1, serviceNameSnapshot: "Barba", servicePriceSnapshot: 20, serviceDurationMinSnapshot: 30 },
        { serviceId: "svc-corte", position: 0, serviceNameSnapshot: "Corte", servicePriceSnapshot: 30, serviceDurationMinSnapshot: 30 },
      ],
    });
    expect(composite.map((item: any) => item.name)).toEqual(["Corte", "Barba"]);
    expect(selection.isMultiServiceAppointment({ serviceItems: composite })).toBe(true);
    expect(selection.normalizeAppointmentServiceItems({
      serviceId: "svc-corte",
      serviceNameSnapshot: "Corte legado",
      servicePriceSnapshot: 30,
      serviceDurationMinSnapshot: 30,
    })).toMatchObject([{ serviceId: "svc-corte", name: "Corte legado" }]);
  });

  it("payload novo usa serviceIds e nao envia serviceId/preco/duracao como verdade", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    expect(appSource).toContain("serviceIds,");
    expect(appSource).toContain('callJson(`${API}/appointments`, "POST", { unitId, ...payload })');
    expect(appSource).toContain('callJson(`${API}/appointments/${editingAppointmentId}`, "PATCH", payload)');
    expect(appSource).not.toContain("serviceId: serviceId.value");
    expect(appSource).not.toContain("servicePrice:");
    expect(appSource).not.toContain("serviceDurationMin:");
  });

  it("ignora resposta antiga com contador e consulta horarios com serviceIds", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    expect(appSource).toContain("++appointmentServiceSummaryRequestId");
    expect(appSource).toContain("requestId !== appointmentServiceSummaryRequestId");
    expect(appSource).toContain('callJson(`${API}/appointments/suggestions`, "POST"');
    expect(appSource).toContain("serviceIds,");
  });

  it("profissional incompativel e lista vazia sao tratados no frontend", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    expect(appSource).toContain("compatibleProfessionalsForSelection");
    expect(appSource).toContain("eligibleProfessionalIds");
    expect(appSource).toContain("validateOperationalProfessionalSelection");
    expect(appSource).toContain("professionalSelectionMount");
    expect(appSource).toContain("Ha mais de um profissional compativel. Ajuste o cadastro operacional antes de agendar.");
    expect(appSource).toContain("Nenhum profissional ativo atende todos os servicos selecionados.");
  });

  it("ux final mostra etapas claras, profissional automatico e resumo independente", () => {
    const html = readFileSync("public/index.html", "utf8");
    const appSource = readFileSync("public/app.js", "utf8");
    expect(html.indexOf("appointmentServicesTitle")).toBeLessThan(html.indexOf("appointmentProfessionalTitle"));
    expect(html.indexOf("appointmentProfessionalTitle")).toBeLessThan(html.indexOf("startsAt"));
    expect(html.indexOf("startsAt")).toBeLessThan(html.indexOf("appointmentSummaryTitle"));
    expect(appSource).toContain("Adicionar");
    expect(appSource).toContain("Selecionado");
    expect(appSource).toContain("renderAppointmentSummaryStep");
    expect(appSource).toContain("Servicos</small><strong>${appointmentSelectedServices.length}</strong>");
    expect(appSource).toContain("selecionados - ${filtered.length} disponiveis");
  });

  it("checkout single-service e multi-service ficam disponiveis quando o atendimento esta em andamento", () => {
    const checkout = loadCheckoutModule();
    expect(checkout.validateAppointmentCheckoutTarget({ id: "a1", status: "IN_SERVICE", serviceItems: [{ serviceId: "svc-corte" }] })).toEqual({
      ok: true,
      message: "",
    });
    expect(checkout.validateAppointmentCheckoutTarget({
      id: "a2",
      status: "IN_SERVICE",
      serviceItems: [{ serviceId: "svc-corte" }, { serviceId: "svc-barba" }],
    })).toEqual({ ok: true, message: "" });
  });

  it("css mobile contem regras de contencao para linhas de servico", () => {
    const css = readFileSync("public/styles/layout.css", "utf8");
    expect(css).toContain(".svc-select-shell");
    expect(css).toContain("width: min(720px, calc(100vw - 24px))");
    expect(css).toContain(".svc-selection-layout");
    expect(css).toContain(".svc-summary-metrics");
    expect(css).toContain(".professional-auto-card");
    expect(css).toContain("grid-template-columns: minmax(220px, 1fr) minmax(240px, 0.9fr)");
    expect(css).toContain("@media (max-width: 640px)");
  });
});
