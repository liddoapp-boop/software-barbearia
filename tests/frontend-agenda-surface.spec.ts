import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("public/app.js", "utf8");
const indexSource = readFileSync("public/index.html", "utf8");
const agendaCss = readFileSync("public/styles/agenda-surface.css", "utf8");

describe("superficie operacional da Agenda", () => {
  it("carrega a camada exclusiva depois das superficies compartilhadas", () => {
    const recordsIndex = indexSource.indexOf("/styles/record-surfaces.css");
    const agendaIndex = indexSource.indexOf("/styles/agenda-surface.css");

    expect(recordsIndex).toBeGreaterThan(-1);
    expect(agendaIndex).toBeGreaterThan(recordsIndex);
  });

  it("mantem Semana e Lista existentes sem introduzir uma terceira visualizacao", () => {
    expect(indexSource).toContain('id="viewGridBtn"');
    expect(indexSource).toContain('id="viewListBtn"');
    expect(indexSource.match(/class="wc-view-btn/g)).toHaveLength(2);
  });

  it("blocos semanais comunicam identidade, servico, profissional, status e proxima acao", () => {
    expect(appSource).toContain('class="wc-appt-name">${safeText(clientLabel)}</span>');
    expect(appSource).toContain('class="wc-appt-svc">${safeText(serviceLabel)}</span>');
    expect(appSource).toContain('class="wc-appt-professional">${safeText(professionalLabel)}</span>');
    expect(appSource).toContain('class="wc-appt-next">${safeText(nextActionLabel)}</span>');
    expect(appSource).toContain('data-agenda-status="${normalizedStatus.toLowerCase()}"');
  });

  it("torna blocos e bloqueios acessiveis por teclado sem alterar seus IDs", () => {
    expect(appSource).toMatch(/data-wc-appt-id="\$\{safeText\(item\.id\)\}"/);
    expect(appSource).toContain('data-record-interactive="true" role="button" tabindex="0"');
    expect(agendaCss).toContain(".wc-appt:focus-visible");
    expect(agendaCss).toContain(".al-card:focus-visible");
  });

  it("usa status por forma e texto, com esmeralda restrita ao positivo", () => {
    expect(agendaCss).toContain('[data-agenda-status="confirmed"]');
    expect(agendaCss).toContain('[data-agenda-status="in_service"]');
    expect(agendaCss).toContain('[data-agenda-status="completed"]');
    expect(agendaCss).toContain('[data-agenda-status="cancelled"]');
    expect(agendaCss).toContain('[data-agenda-status="no_show"]');
    expect(agendaCss).toContain('[data-agenda-status="blocked"]');
    expect(agendaCss).toContain("--agenda-emerald: #4f8f78");
    expect(agendaCss).not.toContain("#cf2d56");
  });

  it("preserva horarios reais, janela util e rolagem interna ao calendario", () => {
    expect(appSource).toContain("getWeekCalendarBounds()");
    expect(appSource).toContain("getWorkingHoursForDay(d.getDay())");
    expect(appSource).toContain('class="wc-open-window"');
    expect(agendaCss).toMatch(/\.wc-body-scroll\s*\{[\s\S]*?overflow-y: auto !important/);
    expect(agendaCss).toMatch(/\.wc-outer\s*\{[\s\S]*?overflow-x: auto !important/);
  });

  it("compartilha a geometria semanal entre cabecalho e corpo sem tratar domingo como coluna especial", () => {
    expect(agendaCss).toContain("--wc-grid-template: var(--wc-time-column) repeat(7, minmax(var(--wc-day-min), 1fr))");
    expect(agendaCss).toMatch(/\.wc-header-row\s*\{[\s\S]*?grid-template-columns:\s*var\(--wc-grid-template\)/);
    expect(agendaCss).toMatch(/\.wc-body-inner\s*\{[\s\S]*?grid-template-columns:\s*var\(--wc-grid-template\)/);
    expect(agendaCss).toContain("padding-inline-end: var(--wc-scrollbar-gutter)");
    expect(appSource).toContain("bodyScroll.offsetWidth - bodyScroll.clientWidth");
    expect(appSource).toContain('container.style.setProperty("--wc-scrollbar-gutter"');
    expect(appSource).toContain('class="wc-day-col${isToday ? " is-today" : ""}"');
    expect(appSource).toContain('class="wc-day-closed-mask"><span>Fechado</span>');
    expect(appSource).toContain("${gridLines}${openWindow}${dayClosedMask}${nowLine}${appts}");
  });

  it("reposiciona para o horario atual com reduced motion respeitado", () => {
    expect(appSource).toContain("function scrollWeekCalendarToCurrentTime");
    expect(appSource).toContain('behavior: reducedMotion ? "auto" : "smooth"');
    expect(agendaCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(agendaCss).toContain("transition: none !important");
  });

  it("mantem skeleton, erro e vazio dentro da mesma gramatica operacional", () => {
    expect(agendaCss).toContain("#agendaSection .wc-loading");
    expect(agendaCss).toContain("#agendaSection .agenda-kpi-loading");
    expect(agendaCss).toContain("#agendaSection .agenda-error-block");
    expect(agendaCss).toContain("#agendaListMode .al-empty");
  });

  it("compoe Lista como registro continuo e mantem acoes aparentes no mobile", () => {
    expect(appSource).toContain('class="al-chip" data-agenda-status=');
    expect(agendaCss).toContain("border-bottom: 1px solid var(--agenda-line) !important");
    expect(agendaCss).toContain("#agendaListMode .al-card-actions");
    expect(agendaCss).toContain("overflow-x: auto");
  });
});
