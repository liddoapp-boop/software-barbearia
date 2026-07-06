import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function extractFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const headerEnd = source.indexOf(")", start);
  const bodyStart = source.indexOf("{", headerEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Function ${name} body not closed`);
}

function loadAppAgendaHarness() {
  const source = readFileSync("public/app.js", "utf8");
  const names = [
    "normalizeAgendaStatus",
    "normalizeAgendaViewPreference",
    "restoreAgendaViewPreference",
    "persistAgendaViewPreference",
    "getAppointmentDelayInfo",
    "rangeFromPeriod",
    "ensureAgendaInitialPeriod",
    "parseTimeToMinutes",
    "normalizeWorkingHours",
    "updateWorkingHoursFromPayload",
    "getWorkingHoursForDay",
    "getWeekCalendarBounds",
    "isSlotBlockingStatus",
    "isSameLocalDay",
    "isItemInsideWeek",
    "syncWeekCalendarItemsFromAgenda",
    "getAgendaListSourceItems",
    "getAgendaListFilteredItems",
    "assignWcColumns",
    "getWeekCalendarDensity",
    "renderWeekCalendar",
  ];
  let containerTop = 120;
  let bodyTop: number | null = null;
  let headerHeight = 38;
  const container = {
    innerHTML: "",
    getBoundingClientRect: () => ({ top: containerTop }),
    querySelector: (selector: string) => {
      if (selector === ".wc-body-scroll" && bodyTop != null) {
        return { getBoundingClientRect: () => ({ top: bodyTop, height: 0 }) };
      }
      if (selector === ".wc-header-row") {
        return { getBoundingClientRect: () => ({ top: containerTop, height: headerHeight }) };
      }
      return null;
    },
    querySelectorAll: () => [],
    setMetrics: (metrics: Record<string, number | null>) => {
      if (metrics.innerHeight != null) {
        // window lives inside the VM context, so this value is applied through setViewportMetrics below.
      }
      if (metrics.containerTop != null) containerTop = Number(metrics.containerTop);
      if ("bodyTop" in metrics) bodyTop = metrics.bodyTop == null ? null : Number(metrics.bodyTop);
      if (metrics.headerHeight != null) headerHeight = Number(metrics.headerHeight);
    },
  };
  const harness = `
    const SLOT_BLOCKING_STATUSES = new Set(["SCHEDULED", "CONFIRMED", "IN_SERVICE", "BLOCKED"]);
    const financialCustomStart = null;
    const financialCustomEnd = null;
    const state = { viewport: "desktop" };
    const STORAGE_AGENDA_VIEW = "sb.agendaView";
    const storedValues = new Map();
    const localStorage = {
      getItem: (key) => storedValues.has(key) ? storedValues.get(key) : null,
      setItem: (key, value) => { storedValues.set(key, String(value)); },
    };
    let currentWorkingHours = null;
    let wcWeekStart = new Date("2026-07-06T00:00:00");
    let wcItems = [];
    let wcLoaded = false;
    let currentAgenda = [];
    let currentAppointments = [];
    let agendaInitialPeriodPrepared = false;
    let alFilterStatus = { value: "__OPERATIONAL__" };
    let alFilterProfessional = { value: "" };
    let alFilterSearch = { value: "" };
    const clientsById = {};
    let filterPeriod = { value: "today" };
    const weekCalContainer = container;
    const document = {
      body: { classList: { contains: () => false } },
      getElementById: (id) => id === "weekCalContainer" ? weekCalContainer : null,
    };
    const window = {
      innerHeight: 900,
      requestAnimationFrame: (callback) => {
        callback();
        return 1;
      },
      setTimeout: (callback) => {
        callback();
        return 1;
      },
    };
    const viewGridBtn = { classList: { remove: () => {}, add: () => {}, toggle: () => {} } };
    const viewListBtn = viewGridBtn;
    let currentView = restoreAgendaViewPreference();
    let alFocusedAppointmentId = "";
    function renderAgendaView() {}
    async function openAgendaAppointmentDetail() {}
    function animateWeekCalendarTransition() {}
    ${names.map((name) => extractFunction(source, name)).join("\n")}
    module.exports = {
      container,
      rangeFromPeriod,
      ensureAgendaInitialPeriod,
      updateWorkingHoursFromPayload,
      getWeekCalendarBounds,
      renderWeekCalendar,
      isSlotBlockingStatus,
      syncWeekCalendarItemsFromAgenda,
      setFilterPeriod: (value) => { filterPeriod.value = value; },
      getFilterPeriod: () => filterPeriod.value,
      setWeekStart: (value) => { wcWeekStart = new Date(value); },
      setAgenda: (items) => { currentAgenda = items; },
      setAppointments: (items) => { currentAppointments = items; },
      setWcItems: (items) => { wcItems = items; },
      setWcLoaded: (value) => { wcLoaded = value; },
      getWcItems: () => wcItems,
      getWcLoaded: () => wcLoaded,
      setListFilters: (filters = {}) => {
        alFilterStatus.value = filters.status ?? alFilterStatus.value;
        alFilterProfessional.value = filters.professionalId ?? alFilterProfessional.value;
        alFilterSearch.value = filters.search ?? alFilterSearch.value;
      },
      getAgendaListFilteredItems,
      getWeekCalendarDensity: () => getWeekCalendarDensity(container, 12),
      setViewportMetrics: (metrics = {}) => {
        if (metrics.innerHeight != null) window.innerHeight = metrics.innerHeight;
        container.setMetrics(metrics);
      },
      getCurrentView: () => currentView,
      getStoredAgendaView: () => localStorage.getItem(STORAGE_AGENDA_VIEW),
      persistAgendaViewPreference,
    };
  `;
  const context = { module: { exports: {} as Record<string, any> }, container };
  vm.runInNewContext(harness, context, { filename: "agenda-week-harness.js" });
  return context.module.exports;
}

function loadAgendaModule() {
  let source = readFileSync("public/modules/agenda.js", "utf8");
  source = source.replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
  source = source.replace(/export function /g, "function ");
  source += "\nmodule.exports = { normalizeAgendaItems, filterAgendaItems };";
  const context = {
    module: { exports: {} as Record<string, any> },
    renderEmptyState: () => "",
    renderStatusChip: () => "",
    normalizeAppointmentServiceItems: () => [],
    buildServiceSelectionLabel: (_items: any[], fallback = "Servico") => fallback,
  };
  vm.runInNewContext(source, context, { filename: "public/modules/agenda.js" });
  return context.module.exports;
}

function extractNumericStyle(html: string, selector: string, property: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<div class="${escapedSelector}[^"]*"[^>]*style="[^"]*${property}:([0-9.]+)px`);
  const match = html.match(pattern);
  if (!match) throw new Error(`Style ${property} not found for ${selector}`);
  return Number(match[1]);
}

function extractHourLabels(html: string) {
  return Array.from(html.matchAll(/class="wc-time-slot"[^>]*>(\d{2}h)<\/div>/g)).map((match) => match[1]);
}

function extractAppointmentBox(html: string, id: string) {
  const pattern = new RegExp(`data-wc-appt-id="${id}"[\\s\\S]*?style="[^"]*top:([0-9.]+)px;height:([0-9.]+)px`);
  const match = html.match(pattern);
  if (!match) throw new Error(`Appointment ${id} style not found`);
  return { top: Number(match[1]), height: Number(match[2]) };
}

function cssBlocksFor(selector: string) {
  const css = readFileSync("public/styles/layout.css", "utf8");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))).map((match) => match[1]);
}

describe("agenda semanal e carregamento inicial", () => {
  it("prepara Semana antes da primeira busca da Agenda", () => {
    const app = loadAppAgendaHarness();
    expect(app.getFilterPeriod()).toBe("today");
    app.ensureAgendaInitialPeriod();
    expect(app.getFilterPeriod()).toBe("week");
  });

  it("Semana e Lista consomem o mesmo periodo semanal carregado inicialmente", () => {
    const app = loadAppAgendaHarness();
    app.setFilterPeriod("week");
    const range = app.rangeFromPeriod("week");
    app.setWeekStart(range.start);
    const insideStart = new Date(range.start);
    insideStart.setDate(insideStart.getDate() + 2);
    insideStart.setHours(18, 0, 0, 0);
    const outsideStart = new Date(range.end.getTime() + 60_000);
    app.setAgenda([
      { id: "inside", startsAt: insideStart, endsAt: new Date(insideStart.getTime() + 30 * 60_000), status: "SCHEDULED" },
      { id: "outside", startsAt: outsideStart, endsAt: new Date(outsideStart.getTime() + 30 * 60_000), status: "SCHEDULED" },
    ]);
    expect(app.syncWeekCalendarItemsFromAgenda()).toBe(true);
    expect(app.getWcLoaded()).toBe(true);
    expect(app.getWcItems().map((item: any) => item.id)).toEqual(["inside"]);
  });

  it("Semana persiste apos reinicializacao simulada", () => {
    const app = loadAppAgendaHarness();
    app.persistAgendaViewPreference("cards");
    expect(app.getCurrentView()).toBe("cards");
    expect(app.getStoredAgendaView()).toBe("cards");
  });

  it("Lista persiste apos reinicializacao simulada", () => {
    const app = loadAppAgendaHarness();
    app.persistAgendaViewPreference("list");
    expect(app.getCurrentView()).toBe("list");
    expect(app.getStoredAgendaView()).toBe("list");
  });

  it("carregamento inicial nao sobrescreve preferencia de visualizacao", () => {
    const source = readFileSync("public/app.js", "utf8");
    expect(source).toContain("let currentView = restoreAgendaViewPreference();");
    expect(source).not.toContain('let currentView = "cards";');
    expect(source).toContain("persistAgendaViewPreference(\"list\")");
    expect(source).toContain("persistAgendaViewPreference(\"cards\")");
  });

  it("expediente 08:00-20:00 renderiza agenda ate 20:00 e mostra appointments as 18:00 e 19:30", () => {
    const app = loadAppAgendaHarness();
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    expect(app.getWeekCalendarBounds()).toEqual({ startHour: 8, endHour: 20 });
    app.setWcItems([
      { id: "appt-18", client: "Cliente 18", service: "Corte", servicePrice: 60, serviceDurationMin: 30, status: "SCHEDULED", startsAt: new Date("2026-07-06T18:00:00"), endsAt: new Date("2026-07-06T18:30:00") },
      { id: "appt-1930", client: "Cliente 1930", service: "Barba", servicePrice: 40, serviceDurationMin: 30, status: "CONFIRMED", startsAt: new Date("2026-07-06T19:30:00"), endsAt: new Date("2026-07-06T20:00:00") },
    ]);
    app.renderWeekCalendar();
    expect(extractHourLabels(app.container.innerHTML)).toEqual([
      "08h",
      "09h",
      "10h",
      "11h",
      "12h",
      "13h",
      "14h",
      "15h",
      "16h",
      "17h",
      "18h",
      "19h",
      "20h",
    ]);
    expect(app.container.innerHTML).toContain('data-wc-appt-id="appt-18"');
    expect(app.container.innerHTML).toContain('data-wc-appt-id="appt-1930"');
  });

  it("ultima faixa da grade e renderizada com a mesma altura logica", () => {
    const app = loadAppAgendaHarness();
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    app.renderWeekCalendar();
    expect(app.container.innerHTML).toContain("wc-body-inner\" style=\"height:");
    expect(app.container.innerHTML).toContain("wc-times-col\" style=\"position:relative;height:");
    expect(app.container.innerHTML).toContain("transform:translateY(-50%)");
  });

  it("horas linhas e cards usam o mesmo calculo vertical", () => {
    const source = readFileSync("public/app.js", "utf8");
    expect(source).toContain("const HOUR_H =");
    expect(source).toContain("getWeekCalendarDensity(container, HOURS)");
    expect(source).toContain("availableGridHeight - trackPad * 2");
    expect(source).toContain("const minuteToY =");
    expect(source).toContain("const TOTAL_H = HOURS * HOUR_H + TRACK_PAD * 2");
    expect(source).toContain("top:${minuteToY(hour * 60)}px");
    expect(source).toContain("top:${minuteToY((HOUR_START + i) * 60 + 30)}px");
    expect(source).toContain("nowLine = `<div class=\"wc-now-line\" style=\"top:${minuteToY(mins)}px\"></div>`");
    expect(source).toContain("const top = minuteToY(startMins)");
    expect(source).toContain("style=\"top:${top}px;height:${ht}px");
    expect(source).toContain("height:${TOTAL_H}px");
  });

  it("calcula altura da hora pelo topo real do corpo da grade e limites seguros", () => {
    const app = loadAppAgendaHarness();
    app.setViewportMetrics({ innerHeight: 900, containerTop: 250, bodyTop: 290 });
    const density = app.getWeekCalendarDensity();
    expect(density.minHourHeight).toBe(46);
    expect(density.maxHourHeight).toBe(58);
    expect(density.bodyTop).toBe(290);
    expect(density.availableGridHeight).toBe(594);
    expect(density.hourHeight).toBe(47);

    app.setViewportMetrics({ innerHeight: 900, containerTop: 90, bodyTop: 130 });
    expect(app.getWeekCalendarDensity().hourHeight).toBe(58);

    app.setViewportMetrics({ innerHeight: 650, containerTop: 360, bodyTop: 400 });
    expect(app.getWeekCalendarDensity().hourHeight).toBe(46);
  });

  it("viewport desktop 1920x900 comporta 08h-20h usando densidade responsiva", () => {
    const app = loadAppAgendaHarness();
    app.setViewportMetrics({ innerHeight: 900, containerTop: 250, bodyTop: 290 });
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    app.renderWeekCalendar();
    const bodyHeight = extractNumericStyle(app.container.innerHTML, "wc-body-inner", "height");
    const hourHeight = (bodyHeight - 20) / 12;

    expect(hourHeight).toBe(47);
    expect(290 + bodyHeight).toBeLessThanOrEqual(900);
    expect(extractHourLabels(app.container.innerHTML)).toEqual([
      "08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h", "19h", "20h",
    ]);
  });

  it("viewport menor mantem grade completa sem scroll vertical interno", () => {
    const app = loadAppAgendaHarness();
    app.setViewportMetrics({ innerHeight: 768, containerTop: 250, bodyTop: 290 });
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    app.renderWeekCalendar();
    const labels = extractHourLabels(app.container.innerHTML);
    const bodyHeight = extractNumericStyle(app.container.innerHTML, "wc-body-inner", "height");

    expect(labels).toHaveLength(13);
    expect(labels[0]).toBe("08h");
    expect(labels[12]).toBe("20h");
    expect((bodyHeight - 20) / 12).toBe(46);
    expect(app.container.innerHTML).toContain("wc-body-scroll");
  });

  it("coluna de horas e colunas dos dias compartilham altura total", () => {
    const app = loadAppAgendaHarness();
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: day === 0 })),
    });
    app.renderWeekCalendar();
    const html = app.container.innerHTML;
    const bodyHeight = extractNumericStyle(html, "wc-body-inner", "height");
    const timesHeight = extractNumericStyle(html, "wc-times-col", "height");
    const dayHeight = extractNumericStyle(html, "wc-day-col", "height");
    expect(timesHeight).toBe(bodyHeight);
    expect(dayHeight).toBe(bodyHeight);
    expect(html).toContain("wc-day-closed-mask");
  });

  it("marcas linhas e appointments depois das 17h usam uma unica escala vertical", () => {
    const app = loadAppAgendaHarness();
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    app.setWcItems([
      { id: "appt-1730", client: "Cliente 17", service: "Corte", servicePrice: 60, serviceDurationMin: 30, status: "SCHEDULED", startsAt: new Date("2026-07-06T17:30:00"), endsAt: new Date("2026-07-06T18:00:00") },
    ]);
    app.renderWeekCalendar();
    const html = app.container.innerHTML;
    const labels = extractHourLabels(html);
    expect(labels).toHaveLength(13);
    expect(labels).toContain("17h");
    expect(labels).toContain("19h");
    expect(labels).toContain("20h");
    expect(html).toContain('data-wc-appt-id="appt-1730"');
    expect(html).toMatch(/wc-time-slot" style="position:absolute;top:\d+px;height:20px;transform:translateY\(-50%\);">20h/);
    expect(html).toMatch(/wc-hline" style="top:\d+px/);
    expect(html).toMatch(/data-wc-appt-id="appt-1730"[\s\S]*style="top:\d+px;height:\d+px/);
  });

  it("cartao de 30 minutos nao recebe altura minima maior que o slot", () => {
    const app = loadAppAgendaHarness();
    app.setViewportMetrics({ innerHeight: 900, containerTop: 250, bodyTop: 290 });
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    app.setWcItems([
      { id: "appt-30", client: "Cliente Teste", service: "Corte", servicePrice: 30, serviceDurationMin: 30, status: "SCHEDULED", startsAt: new Date("2026-07-06T10:00:00"), endsAt: new Date("2026-07-06T10:30:00") },
    ]);
    app.renderWeekCalendar();
    const box = extractAppointmentBox(app.container.innerHTML, "appt-30");
    const hourHeight = (extractNumericStyle(app.container.innerHTML, "wc-body-inner", "height") - 20) / 12;

    expect(box.height).toBe(hourHeight / 2);
    expect(box.height).toBeLessThan(34);
  });

  it("cartoes consecutivos nao se sobrepoem e usam conteudo compacto", () => {
    const app = loadAppAgendaHarness();
    app.setViewportMetrics({ innerHeight: 900, containerTop: 250, bodyTop: 290 });
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "08:00", end: "20:00", isClosed: false })),
    });
    app.setWcItems([
      { id: "appt-a", client: "Cliente A", service: "Corte", servicePrice: 30, serviceDurationMin: 30, status: "SCHEDULED", startsAt: new Date("2026-07-06T10:00:00"), endsAt: new Date("2026-07-06T10:30:00") },
      { id: "appt-b", client: "Cliente B", service: "Barba", servicePrice: 20, serviceDurationMin: 30, status: "CONFIRMED", startsAt: new Date("2026-07-06T10:30:00"), endsAt: new Date("2026-07-06T11:00:00") },
    ]);
    app.renderWeekCalendar();
    const first = extractAppointmentBox(app.container.innerHTML, "appt-a");
    const second = extractAppointmentBox(app.container.innerHTML, "appt-b");

    expect(second.top).toBeGreaterThanOrEqual(first.top + first.height);
    expect(app.container.innerHTML).not.toContain("wc-appt-svc");
    expect(app.container.innerHTML).toContain("title=\"10:00");
    expect(app.container.innerHTML).toContain("Corte");
    expect(app.container.innerHTML).toContain("R$");
  });

  it("resize agenda recalcule densidade sem loop e sem alterar Semana Lista", () => {
    const source = readFileSync("public/app.js", "utf8");
    const resizeStart = source.indexOf('window.addEventListener("resize"');
    const resizeBlock = source.slice(resizeStart, source.indexOf("async function init", resizeStart));
    expect(source).toContain("let wcDensityRenderFrame = 0");
    expect(source).toContain("function scheduleWeekCalendarDensityRefresh()");
    expect(source).toContain("if (wcDensityRenderFrame) return;");
    expect(source).toContain("window.requestAnimationFrame");
    expect(resizeBlock).toContain("scheduleWeekCalendarDensityRefresh();");
    expect(resizeBlock).not.toContain("persistAgendaViewPreference");
    expect(resizeBlock).not.toContain("currentView =");
  });

  it("wrapper semanal nao cria rolagem vertical interna nem limita a altura", () => {
    const bodyScrollBlocks = cssBlocksFor("#agendaSection .wc-body-scroll");
    expect(bodyScrollBlocks.length).toBeGreaterThan(0);
    expect(bodyScrollBlocks.join("\n")).not.toMatch(/max-height:\s*(?:clamp|min|calc|\d)/);
    expect(bodyScrollBlocks.join("\n")).not.toMatch(/overflow-y:\s*(?:auto|hidden|scroll)/);
    expect(bodyScrollBlocks.join("\n")).toContain("max-height: none !important");
    expect(bodyScrollBlocks.join("\n")).toContain("overflow: visible !important");

    const outerBlocks = cssBlocksFor("#agendaSection .wc-outer");
    expect(outerBlocks.length).toBeGreaterThan(0);
    expect(outerBlocks.join("\n")).toContain("overflow-x: auto !important");
    expect(outerBlocks.join("\n")).not.toMatch(/overflow-y:\s*(?:auto|hidden|scroll)/);
  });

  it("ancestrais da Agenda nao cortam a rolagem vertical normal da pagina", () => {
    const appMainBlocks = cssBlocksFor("#appMain");
    const appContentBlocks = cssBlocksFor("#appContent");

    expect(appMainBlocks.join("\n")).toContain("height: auto !important");
    expect(appMainBlocks.join("\n")).toContain("overflow: visible !important");
    expect(appContentBlocks.join("\n")).toContain("overflow-y: visible !important");
  });

  it("mobile mantem rolagem vertical da pagina e apenas eixo horizontal no calendario", () => {
    const css = readFileSync("public/styles/layout.css", "utf8");
    const mobileBlockStart = css.indexOf("@media (max-width: 767px)");
    expect(mobileBlockStart).toBeGreaterThanOrEqual(0);
    const mobileCss = css.slice(mobileBlockStart);
    expect(mobileCss).not.toMatch(/#agendaSection \.wc-body-scroll\s*\{[^}]*max-height:\s*clamp/);
    expect(mobileCss).not.toMatch(/#agendaSection \.wc-body-scroll\s*\{[^}]*overflow-y:\s*(?:auto|hidden|scroll)/);
    expect(mobileCss).not.toMatch(/#agendaSection \.wc-outer\s*\{[^}]*overflow-y:\s*(?:auto|hidden|scroll)/);
    expect(mobileCss).toMatch(/#agendaSection \.wc-outer\s*\{[^}]*overflow-x:\s*auto !important/);
  });

  it("nao limita a grade semanal de forma fixa em 17:00", () => {
    const source = readFileSync("public/app.js", "utf8");
    expect(source).not.toContain("1020");
    expect(source).not.toContain("17:00");
    expect(source).toContain("getWeekCalendarBounds()");
  });

  it("Operacionais oculta CANCELLED", () => {
    const app = loadAppAgendaHarness();
    expect(app.isSlotBlockingStatus("SCHEDULED")).toBe(true);
    expect(app.isSlotBlockingStatus("CONFIRMED")).toBe(true);
    expect(app.isSlotBlockingStatus("CANCELLED")).toBe(false);

    app.setAgenda([
      { id: "scheduled", status: "SCHEDULED", startsAt: "2026-07-06T12:00:00.000Z", endsAt: "2026-07-06T12:30:00.000Z", professionalId: "pro" },
      { id: "cancelled", status: "CANCELLED", startsAt: "2026-07-06T13:00:00.000Z", endsAt: "2026-07-06T13:30:00.000Z", professionalId: "pro" },
    ]);
    app.setListFilters({ status: "__OPERATIONAL__" });
    expect(app.getAgendaListFilteredItems().map((item: any) => item.id)).toEqual(["scheduled"]);
  });

  it("Operacionais oculta NO_SHOW", () => {
    const app = loadAppAgendaHarness();
    expect(app.isSlotBlockingStatus("NO_SHOW")).toBe(false);

    app.setAgenda([
      { id: "confirmed", status: "CONFIRMED", startsAt: "2026-07-06T12:00:00.000Z", endsAt: "2026-07-06T12:30:00.000Z", professionalId: "pro" },
      { id: "noshow", status: "NO_SHOW", startsAt: "2026-07-06T13:00:00.000Z", endsAt: "2026-07-06T13:30:00.000Z", professionalId: "pro" },
    ]);
    app.setListFilters({ status: "__OPERATIONAL__" });
    expect(app.getAgendaListFilteredItems().map((item: any) => item.id)).toEqual(["confirmed"]);
  });

  it("Todos os status exibe CANCELLED, NO_SHOW e COMPLETED", () => {
    const app = loadAppAgendaHarness();
    app.setAgenda([
      { id: "cancelled", status: "cancelled", startsAt: "2026-07-06T12:00:00.000Z", endsAt: "2026-07-06T12:30:00.000Z", professionalId: "pro" },
      { id: "noshow", status: "no_show", startsAt: "2026-07-06T13:00:00.000Z", endsAt: "2026-07-06T13:30:00.000Z", professionalId: "pro" },
      { id: "completed", status: "completed", startsAt: "2026-07-06T14:00:00.000Z", endsAt: "2026-07-06T14:30:00.000Z", professionalId: "pro" },
    ]);
    app.setListFilters({ status: "" });
    expect(app.getAgendaListFilteredItems().map((item: any) => item.id)).toEqual([
      "cancelled",
      "noshow",
      "completed",
    ]);
  });

  it("registro fora do expediente aparece na Lista", () => {
    const app = loadAppAgendaHarness();
    app.updateWorkingHoursFromPayload({
      timezone: "America/Sao_Paulo",
      weekly: Array.from({ length: 7 }, (_item, day) => ({ day, start: "09:00", end: "17:00", isClosed: day === 0 })),
    });
    app.setAgenda([
      { id: "closed-day-terminal", status: "NO_SHOW", startsAt: "2026-07-05T23:30:00.000Z", endsAt: "2026-07-06T00:00:00.000Z", professionalId: "pro" },
    ]);
    app.setListFilters({ status: "" });
    expect(app.getAgendaListFilteredItems().map((item: any) => item.id)).toEqual(["closed-day-terminal"]);
  });

  it("Lista prefere currentAgenda atual em vez de wcItems antigo", () => {
    const app = loadAppAgendaHarness();
    app.setWcLoaded(true);
    app.setWcItems([
      { id: "stale", status: "SCHEDULED", startsAt: "2026-07-06T12:00:00.000Z", endsAt: "2026-07-06T12:30:00.000Z", professionalId: "pro-old" },
    ]);
    app.setAgenda([
      { id: "fresh", status: "NO_SHOW", startsAt: "2026-07-06T13:00:00.000Z", endsAt: "2026-07-06T13:30:00.000Z", professionalId: "pro" },
    ]);
    app.setListFilters({ status: "" });
    expect(app.getAgendaListFilteredItems().map((item: any) => item.id)).toEqual(["fresh"]);
  });

  it("contador e lista usam a mesma colecao filtrada no modo Lista", () => {
    const source = readFileSync("public/app.js", "utf8");
    expect(source).toContain("const visibleItems = getAgendaListFilteredItems();");
    expect(source).toContain("renderAgendaData(agendaElements, visibleItems, visibleItems, \"list\"");
    expect(source).toContain('alFilterStatus) alFilterStatus.addEventListener("change", renderAgendaView)');
  });

  it("filtro explicito consegue exibir estados terminais no modulo compartilhado", () => {
    const agenda = loadAgendaModule();
    const items = agenda.normalizeAgendaItems({
      appointments: [
        { id: "cancelled", status: "cancelled", startsAt: "2026-07-06T12:00:00.000Z", endsAt: "2026-07-06T12:30:00.000Z", client: { fullName: "Cancelado" }, professional: { id: "pro", name: "Geovane" }, service: { id: "svc", name: "Corte" } },
        { id: "noshow", status: "no_show", startsAt: "2026-07-06T13:00:00.000Z", endsAt: "2026-07-06T13:30:00.000Z", client: { fullName: "Falta" }, professional: { id: "pro", name: "Geovane" }, service: { id: "svc", name: "Corte" } },
      ],
    });
    expect(agenda.filterAgendaItems(items, { status: "CANCELLED" }).map((item: any) => item.id)).toEqual(["cancelled"]);
    expect(agenda.filterAgendaItems(items, { status: "NO_SHOW" }).map((item: any) => item.id)).toEqual(["noshow"]);
  });

  it("descarta resposta semanal antiga antes de sobrescrever a mais recente", () => {
    const source = readFileSync("public/app.js", "utf8");
    expect(source).toContain("let wcLoadRunId = 0");
    expect(source).toContain("const runId = ++wcLoadRunId");
    expect(source).toContain("requestWeekStart");
    expect(source).toContain("runId !== wcLoadRunId");
  });

  it("resposta antiga nao muda Semana para Lista", () => {
    const source = readFileSync("public/app.js", "utf8");
    const start = source.indexOf('container.querySelectorAll("[data-wc-appt-id]")');
    const weekClickFlow = source.slice(
      start,
      source.indexOf("function changeWeekCalendar", start),
    );
    expect(weekClickFlow).not.toContain('currentView = "list"');
    expect(weekClickFlow).not.toContain("persistAgendaViewPreference(\"list\")");
    expect(weekClickFlow).toContain("await openAgendaAppointmentDetail(appointmentId)");
  });
});
