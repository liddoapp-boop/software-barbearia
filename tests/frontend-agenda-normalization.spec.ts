import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadBrowserModuleFunctions(file: string, names: string[]) {
  let source = readFileSync(file, "utf8");
  source = source.replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
  source = source.replace(/export function /g, "function ");
  source += `\nmodule.exports = { ${names.join(", ")} };`;
  const context = {
    module: { exports: {} as Record<string, unknown> },
    renderEmptyState: () => "",
    renderStatusChip: (status: string) => `<span>${status}</span>`,
    renderTechnicalTrace: () => "",
    renderEntityDrawer: () => "",
    bindEntityDrawers: () => {},
    escapeHtml: (value: unknown) => String(value ?? ""),
  };
  vm.runInNewContext(source, context, { filename: file });
  return context.module.exports as Record<string, (...args: any[]) => any>;
}

describe("normalizacao frontend da agenda", () => {
  it("normaliza resposta aninhada da API sem cair em Cliente/Servico genericos", () => {
    const { normalizeAgendaItems } = loadBrowserModuleFunctions("public/modules/agenda.js", [
      "normalizeAgendaItems",
    ]);
    const [item] = normalizeAgendaItems({
      appointments: [
        {
          id: "appt-nested",
          unitId: "unit-01",
          client: { id: "cli-01", fullName: "CLIENTE TESTE VISUAL SPRINT 228.3", phone: "11999990000" },
          professional: { id: "pro-01", name: "PROFISSIONAL TESTE VISUAL SPRINT 228.3" },
          service: { id: "svc-01", name: "Corte", price: 30, durationMin: 30 },
          startsAt: "2026-07-03T20:51:00.000Z",
          endsAt: "2026-07-03T21:21:00.000Z",
          status: "COMPLETED",
        },
      ],
    });

    expect(item).toMatchObject({
      id: "appt-nested",
      clientId: "cli-01",
      client: "CLIENTE TESTE VISUAL SPRINT 228.3",
      professionalId: "pro-01",
      professional: "PROFISSIONAL TESTE VISUAL SPRINT 228.3",
      serviceId: "svc-01",
      service: "Corte",
      servicePrice: 30,
      serviceDurationMin: 30,
      status: "COMPLETED",
    });
  });

  it("normaliza central de agendamentos e nunca oferece checkout para COMPLETED", () => {
    const { normalizeAppointmentsPayload, renderAppointmentsData } = loadBrowserModuleFunctions(
      "public/modules/agendamentos.js",
      ["normalizeAppointmentsPayload", "renderAppointmentsData"],
    );
    const [item] = normalizeAppointmentsPayload([
      {
        id: "appt-completed",
        unitId: "unit-01",
        client: { id: "cli-01", fullName: "CLIENTE TESTE VISUAL SPRINT 228.3", phone: "11999990000" },
        professional: { id: "pro-01", name: "PROFISSIONAL TESTE VISUAL SPRINT 228.3" },
        service: { id: "svc-01", name: "Corte", price: 30, durationMin: 30 },
        startsAt: "2026-07-03T20:51:00.000Z",
        endsAt: "2026-07-03T21:21:00.000Z",
        status: "COMPLETED",
      },
    ]);
    const fakeClassList = { add: () => {}, remove: () => {} };
    const fakeElement = () => ({
      innerHTML: "",
      textContent: "",
      className: "",
      classList: fakeClassList,
      querySelectorAll: () => [],
      querySelector: () => null,
    });
    const elements = {
      summary: fakeElement(),
      tableBody: fakeElement(),
      mobileList: fakeElement(),
      periodSummary: fakeElement(),
      detail: fakeElement(),
      feedback: fakeElement(),
      empty: fakeElement(),
      tableWrap: fakeElement(),
    };

    renderAppointmentsData(elements, [item], {
      now: new Date("2026-07-03T12:00:00.000Z"),
      canCheckout: true,
      onAction: () => {},
    });

    const html = `${elements.tableBody.innerHTML}\n${elements.mobileList.innerHTML}`;
    expect(item).toMatchObject({
      client: "CLIENTE TESTE VISUAL SPRINT 228.3",
      service: "Corte",
      servicePrice: 30,
      serviceDurationMin: 30,
    });
    expect(html).toContain("COMPLETED");
    expect(html).not.toContain('data-action="COMPLETE"');
    expect(html).not.toContain(">Checkout<");
  });

  it("nao renderiza checkout para profissional em atendimento", () => {
    const { normalizeAgendaItems, renderAgendaData } = loadBrowserModuleFunctions("public/modules/agenda.js", [
      "normalizeAgendaItems",
      "renderAgendaData",
    ]);
    const [item] = normalizeAgendaItems({
      appointments: [
        {
          id: "appt-in-service-professional",
          unitId: "unit-01",
          client: { id: "cli-01", fullName: "CLIENTE TESTE VISUAL SPRINT 228.3", phone: "11999990000" },
          professional: { id: "pro-01", name: "PROFISSIONAL TESTE VISUAL SPRINT 228.3" },
          service: { id: "svc-01", name: "Corte", price: 30, durationMin: 30 },
          startsAt: "2026-07-03T20:51:00.000Z",
          endsAt: "2026-07-03T21:21:00.000Z",
          status: "IN_SERVICE",
        },
      ],
    });
    const fakeClassList = { add: () => {}, remove: () => {} };
    const fakeElement = () => ({
      innerHTML: "",
      textContent: "",
      className: "",
      classList: fakeClassList,
      querySelectorAll: () => [],
      querySelector: () => null,
    });
    const elements = {
      metricsGrid: fakeElement(),
      queue: fakeElement(),
      list: fakeElement(),
      empty: fakeElement(),
      tableWrap: fakeElement(),
    };

    renderAgendaData(elements, [item], [item], "list", {
      canCheckout: false,
      onAction: () => {},
    });

    const html = elements.list.innerHTML;
    expect(html).toContain("IN_SERVICE");
    expect(html).not.toContain('data-action="COMPLETE"');
    expect(html).not.toContain("Finalizar atendimento");
  });
});
