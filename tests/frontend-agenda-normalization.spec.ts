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
    buildServiceSelectionLabel: (items: Array<Record<string, unknown>>, fallback = "Servico") => {
      const names = items.map((item) => String(item.name || item.serviceNameSnapshot || "").trim()).filter(Boolean);
      return names.length ? names.join(" + ") : fallback;
    },
    normalizeAppointmentServiceItems: (appointment: Record<string, any>) => {
      if (Array.isArray(appointment.serviceItems) && appointment.serviceItems.length) {
        return [...appointment.serviceItems]
          .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
          .map((item) => ({
            serviceId: String(item.serviceId || ""),
            name: String(item.serviceNameSnapshot || item.name || "Servico"),
            price: Number(item.servicePriceSnapshot || item.price || 0),
            durationMin: Number(item.serviceDurationMinSnapshot || item.durationMin || 0),
          }));
      }
      return [];
    },
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

  it("normaliza blockEvents ativos sem converter em appointment falso", () => {
    const { normalizeAgendaItems, filterAgendaItems } = loadBrowserModuleFunctions("public/modules/agenda.js", [
      "normalizeAgendaItems",
      "filterAgendaItems",
    ]);
    const items = normalizeAgendaItems({
      appointments: [],
      blockEvents: [
        {
          id: "block-1600",
          unitId: "unit-01",
          professionalId: "pro-01",
          startsAt: "2026-07-07T19:00:00.000Z",
          endsAt: "2026-07-07T20:00:00.000Z",
          status: "BLOCKED",
          label: "Horario bloqueado",
          reason: "teste",
          isFullDay: false,
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "block:block-1600",
      blockId: "block-1600",
      agendaKind: "block-time",
      clientId: "",
      serviceId: "",
      servicePrice: 0,
      service: "Horario bloqueado",
      reason: "teste",
      status: "BLOCKED",
    });
    expect(filterAgendaItems(items, { serviceId: "svc-01", search: "teste" }).map((item: any) => item.id)).toEqual([
      "block:block-1600",
    ]);
  });

  it("ignora blocks cancelados e nao infla contadores de atendimentos", () => {
    const { normalizeAgendaItems, renderAgendaData } = loadBrowserModuleFunctions("public/modules/agenda.js", [
      "normalizeAgendaItems",
      "renderAgendaData",
    ]);
    const items = normalizeAgendaItems({
      appointments: [
        {
          id: "appt-01",
          unitId: "unit-01",
          client: { id: "cli-01", fullName: "Cliente Um" },
          professional: { id: "pro-01", name: "Profissional" },
          service: { id: "svc-01", name: "Corte", price: 30 },
          startsAt: "2026-07-07T18:00:00.000Z",
          endsAt: "2026-07-07T18:30:00.000Z",
          status: "SCHEDULED",
        },
      ],
      blocks: [
        {
          id: "active-block",
          unitId: "unit-01",
          startsAt: "2026-07-07T19:00:00.000Z",
          endsAt: "2026-07-07T20:00:00.000Z",
          status: "ACTIVE",
          reason: "teste",
        },
        {
          id: "cancelled-block",
          unitId: "unit-01",
          startsAt: "2026-07-07T20:00:00.000Z",
          endsAt: "2026-07-07T21:00:00.000Z",
          status: "CANCELLED",
          reason: "cancelado",
        },
      ],
    });
    const fakeElement = () => ({
      innerHTML: "",
      querySelectorAll: () => [],
      querySelector: () => null,
    });
    const elements = {
      metricsGrid: fakeElement(),
      queue: fakeElement(),
      list: fakeElement(),
    };

    renderAgendaData(elements, items, items, "list", {
      canCheckout: true,
      onAction: () => {},
    });

    expect(items.map((item: any) => item.id)).toEqual(["appt-01", "block:active-block"]);
    expect(elements.metricsGrid.innerHTML).toContain("<div class=\"ux-value-sm\">1</div>");
    expect(elements.list.innerHTML).toContain("Horario bloqueado");
    expect(elements.list.innerHTML).toContain("teste");
    expect(elements.list.innerHTML).not.toContain("cancelado");
    expect(elements.list.innerHTML).not.toContain("Iniciar atendimento");
    expect(elements.list.innerHTML).not.toContain("Checkout");
  });
});
