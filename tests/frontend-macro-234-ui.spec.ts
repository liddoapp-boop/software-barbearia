import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

function functionBody(src: string, name: string) {
  const start = src.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const signatureEnd = src.indexOf(") {", start);
  expect(signatureEnd).toBeGreaterThanOrEqual(0);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < src.length; index += 1) {
    const char = src[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, index + 1);
    }
  }
  throw new Error(`Function not closed: ${name}`);
}

describe("Macro 234 - release candidate owner-only", () => {
  it("sidebar e mobile escondem modulos fora do escopo principal", async () => {
    const menu = await import(pathToFileURL(`${process.cwd()}/public/components/menu-config.js`).href);
    const visible = menu.MENU_GROUPS.flatMap((group: any) => group.modules.map((module: any) => module.id));

    expect(visible).toEqual(["agenda", "clientes", "financeiro", "estoque", "atendente-ia", "servicos", "configuracoes", "auditoria"]);
    expect(visible).not.toEqual(expect.arrayContaining(["dashboard", "operacao", "profissionais", "comissoes", "metas", "fidelizacao", "automacoes", "relatorios", "whatsapp", "agendamento-link"]));
    expect(menu.MOBILE_TABS.map((tab: any) => tab.moduleId)).toEqual(["agenda", "clientes", null]);
    expect(menu.MOBILE_TABS.map((tab: any) => tab.label)).not.toContain("Hoje");
    expect(menu.getDefaultModuleForRole("owner")).toBe("agenda");
  });

  it("organiza navegacao principal, administracao e perfil sem alterar os contratos dos itens", async () => {
    const menu = await import(pathToFileURL(`${process.cwd()}/public/components/menu-config.js`).href);
    const sidebar = await import(pathToFileURL(`${process.cwd()}/public/components/sidebar.js`).href);
    const groups = menu.filterMenuGroupsByRole(menu.MENU_GROUPS, "owner");
    const html = sidebar.renderSidebar({
      groups,
      activeModule: "servicos",
      user: { name: "Geovane Borges", role: "owner" },
    });

    const primary = html.slice(
      html.indexOf('data-sidebar-area="primary"'),
      html.indexOf('data-sidebar-area="administrative"'),
    );
    const administrative = html.slice(
      html.indexOf('data-sidebar-area="administrative"'),
      html.indexOf('<div class="sb-footer">'),
    );

    expect(
      [...primary.matchAll(/data-sidebar-module="([^"]+)"/g)].map((match) => match[1]),
    ).toEqual(["agenda", "clientes", "financeiro", "estoque", "servicos"]);
    expect(
      [...administrative.matchAll(/data-sidebar-module="([^"]+)"/g)].map((match) => match[1]),
    ).toEqual(["configuracoes", "auditoria"]);
    expect(html).toContain("Geovane Borges");
    expect(html).toContain("Proprietário");
    expect(html.match(/data-sidebar-module="servicos"/g)).toHaveLength(1);
    expect(html).toContain('data-sidebar-module="servicos"');
    expect(html).toContain("sb-brand-kicker");
    expect(html).toContain("LIDDO / BARBER OS");
    expect(html).toContain("sb-item-index");
    expect(html).toContain("sb-item-terminus");
    expect(html).toContain("sb-account-chevron");
  });

  it("Agenda usa uma acao principal e secundarias em Mais opcoes", () => {
    const appointments = source("public/modules/agendamentos.js");
    const agenda = source("public/modules/agenda.js");
    const app = source("public/app.js");

    expect(functionBody(appointments, "actionsForStatus")).toContain('return ["CONFIRMED", options.canEdit ? "RESCHEDULE" : "", "CANCELLED"]');
    expect(functionBody(appointments, "actionsForStatus")).toContain('return ["IN_SERVICE", "DELAY", options.canEdit ? "RESCHEDULE" : "", "CANCELLED", options.canNoShow ? "NO_SHOW" : ""]');
    expect(functionBody(appointments, "actionsForStatus")).toContain('return canCheckout\n      ? ["COMPLETE", "SERVICES"]');
    expect(functionBody(appointments, "renderAppointmentActions")).toContain("appointment-secondary-actions");
    expect(functionBody(agenda, "renderActionHierarchy")).toContain("Mais opcoes");
    expect(functionBody(app, "renderAgendaActionHierarchy")).toContain("Mais opcoes");
  });

  it("linguagem operacional central cobre enums criticas", async () => {
    const language = await import(pathToFileURL(`${process.cwd()}/public/modules/operational-language.js`).href);

    expect(language.statusLanguage("IN_SERVICE").label).toBe("Em atendimento");
    expect(language.statusLanguage("NO_SHOW").label).toBe("Falta");
    expect(language.statusLanguage("WALK_IN").label).toBe("Atendimento sem agendamento");
    expect(language.statusLanguage("APPOINTMENT_BLOCK").label).toBe("Horario bloqueado");
    expect(language.actionLanguage("COMPLETE")).toBe("Ir para checkout");
    expect(language.actionLanguage("NO_SHOW")).toBe("Marcar falta");
  });

  it("remove dependencias externas frageis nao essenciais do frontend principal e booking", () => {
    const index = source("public/index.html");
    const booking = source("public/booking.html");

    expect(index).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(booking).not.toMatch(/fonts\.googleapis|fonts\.gstatic|unpkg\.com\/imask/);
    expect(booking).toContain("typeof IMask !== 'undefined'");
  });

  it("aplica arquitetura de marca Liddo produto e barbearia como operacao", async () => {
    const sidebar = await import(pathToFileURL(`${process.cwd()}/public/components/sidebar.js`).href);
    const app = source("public/app.js");
    const booking = source("public/booking.html");
    const login = source("public/login.html");
    const settings = source("public/modules/configuracoes.js");

    const sidebarHtml = sidebar.renderSidebar({
      groups: [{ id: "main", label: "Main", modules: [{ id: "agenda", label: "Agenda" }] }],
      activeModule: "agenda",
      operationName: "Barbearia Geovane Borges",
    });

    expect(sidebarHtml).not.toContain("Sistema de gestao");
    expect(sidebarHtml).toContain("Barbearia Geovane Borges");
    expect(app).toContain("function normalizeOperationName");
    expect(app).toContain('placeholder === "unidade padrao"');
    expect(booking).toContain("Barbearia Geovane Borges");
    expect(booking).toContain("Tecnologia Liddo");
    expect(login).toContain('class="auth-provider-name">LIDDO SYSTEM</div>');
    expect(login).not.toContain("Sistema de gestao");
    expect([sidebarHtml, booking, login, settings].join("\n")).not.toMatch(/LIDDO BARBER|Barbearia Premium/);
  });

  it("remove Hoje da interface ativa e usa Agenda como inicio", () => {
    const index = source("public/index.html");
    const app = source("public/app.js");

    expect(index).not.toContain("dashboardSection");
    expect(index).not.toContain("dashboardNextAppointment");
    expect(index).not.toContain("Proximo atendimento");
    expect(index).not.toContain("Situacao do dia");
    expect(index).not.toContain("Agenda restante");
    expect(index).not.toContain("Movimento do dia");
    expect(index).not.toContain("today-first-fold");
    expect(app).not.toContain("./modules/dashboard.js");
    expect(app).not.toContain("renderDashboardData");
    expect(app).not.toContain("loadDashboard");
    expect(app).not.toContain("data-dashboard-new-appointment");
    expect(app).toContain('if (stored === "dashboard") return "agenda"');
    expect(app).toContain('moduleId === "agendamentos" || moduleId === "dashboard" ? "agenda" : moduleId');
    expect(index).toContain('id="agendaSection"');
    expect(app).toContain('const agendaNewAppointmentBtn = document.getElementById("agendaNewAppointmentBtn")');
  });

  it("trava contrato global de scroll no CSS final do shell", () => {
    const css = source("public/styles/design-system.css");
    const shellBlock = css.slice(css.indexOf("#appShell,"), css.indexOf(".sidebar-wrap,", css.indexOf("#appShell,")));

    expect(css).toContain("html,\nbody");
    expect(css).toContain("overflow-y: auto !important");
    expect(shellBlock).toContain("height: auto !important");
    expect(shellBlock).toContain("max-height: none !important");
    expect(shellBlock).toContain("overflow-y: visible !important");
    expect(css).toContain("#appContent,\n#appShell.settings-mode #appContent");
    expect(css).toContain("overflow-y: visible !important");
    expect(css).toContain("height: 100dvh !important");
    expect(css).toContain("max-height: 100dvh !important");
    expect(css).not.toContain(".today-first-fold");
    expect(css).not.toContain(".today-workbench");
  });

  it("renderiza cabecalhos operacionais com identidade e contratos preservados", async () => {
    const operationalUi = await import(
      pathToFileURL(`${process.cwd()}/public/components/operational-ui.js`).href
    );
    const attendant = source("public/modules/atendente-ia.js");
    const whatsapp = source("public/components/whatsapp.js");
    const settings = source("public/modules/configuracoes.js");
    const index = source("public/index.html");
    const agenda = operationalUi.renderPageHeader({
      variant: "agenda",
      title: "Agenda",
      context: "Operacao diaria",
      breadcrumb: "Liddo System / Agenda",
      action: '<button id="agendaNewAppointmentBtn" data-action="new">Novo agendamento</button>',
    });
    const financeiro = operationalUi.renderPageHeader({
      variant: "financeiro",
      title: "Financeiro",
    });

    expect(agenda).toContain('data-header-module="agenda"');
    expect(agenda).toContain("TEMPO / FLUXO");
    expect(agenda).toContain("Semana operacional");
    expect(agenda).toContain('id="agendaNewAppointmentBtn"');
    expect(agenda).toContain('data-action="new"');
    expect(financeiro).toContain('data-header-module="financeiro"');
    expect(financeiro).toContain("CAIXA / COMPETÊNCIA");
    expect(financeiro).toContain("Resultado do período");
    expect(attendant).toContain('variant: "atendente-ia"');
    expect(whatsapp).toContain('variant: "whatsapp"');
    expect(settings).toContain('data-header-module="configuracoes"');
    expect(index).not.toContain('data-header-module="agendamento-link"');
    expect(index).not.toContain('id="bookingLinkOpen"');
    expect(settings).toContain('id: "channels"');
    expect(settings).toContain('id="bookingLinkOpen"');
    expect(agenda).not.toContain("op-header-coordinate");
    expect(financeiro).not.toContain("op-header-title-index");
  });

  it("transforma resumos numericos em instrumentos sem alterar seus contratos", () => {
    const index = source("public/index.html");
    const agenda = source("public/modules/agenda.js");
    const clients = source("public/modules/clientes.js");
    const inventory = source("public/modules/estoque.js");
    const financial = source("public/modules/financeiro.js");
    const services = source("public/modules/servicos.js");
    const professionals = source("public/modules/profissionais.js");
    const motion = source("public/modules/motion-effects.js");
    const css = source("public/styles/liddo-identity.css");

    expect(index).toContain('id="agendaMetricsGrid"');
    expect(index).toContain('id="financialSummary"');
    expect(index).toContain('id="inventorySummaryCards"');
    expect(index).toContain('id="saleTotalValue"');
    expect(index).toContain('data-kpi-context="agenda"');
    expect(index).toContain('data-kpi-context="financeiro"');
    expect(agenda).toContain('data-kpi-kind="next"');
    expect(clients).toContain('data-kpi-kind="relationship"');
    expect(inventory).toContain('card.title === "Valor estimado"');
    expect(financial).toContain('"balance"');
    expect(financial).toContain('"projection"');
    expect(services).toContain('data-kpi-kind="${escapeHtml(kind)}"');
    expect(professionals).toContain('data-kpi-kind="${escapeHtml(kind)}"');
    expect(css).toContain("Liddo Operational Instruments");
    expect(css).toContain("#financialSummary");
    expect(css).toContain("#estoqueSection #inventorySummaryCards");
    expect(css).toContain("@keyframes liddo-instrument-enter");
    expect(css).toContain("@keyframes liddo-instrument-value");
    expect(motion).toContain("function animateKpiUpdate");
    expect(motion).toContain('"is-kpi-updating"');
  });

  it("carrega a identidade definitiva Liddo com assinatura visual e motion acessivel", () => {
    const index = source("public/index.html");
    const css = source("public/styles/liddo-identity.css");
    const motion = source("public/modules/motion-effects.js");

    expect(index).toContain(
      '/styles/liddo-identity.css?v=20260725-visual-fixes1',
    );
    expect(css).toContain("--liddo-bronze:");
    expect(css).toContain("--liddo-emerald:");
    expect(css).toContain(".sb-brand-axis");
    expect(css).toContain(".sb-brand-kicker");
    expect(css).toContain(".sb-item-index");
    expect(css).toContain(".sb-item-terminus");
    expect(css).toContain("@keyframes liddo-sidebar-shell-in");
    expect(css).toContain("@keyframes liddo-sidebar-item-in");
    expect(css).toContain(".op-page-header::after");
    expect(css).toContain(".op-header-link-rail");
    expect(css).toContain(".op-page-header-agenda");
    expect(css).toContain(".op-page-header-financeiro");
    expect(css).toContain(".op-page-header-estoque");
    expect(css).toContain("@keyframes liddo-header-enter");
    expect(css).toContain("@keyframes liddo-header-context-update");
    expect(motion).toContain("function animateHeaderContext");
    expect(motion).toContain('"is-context-updating"');
    expect(css).toContain(".agenda-appt-card");
    expect(css).toContain(".ds-modal-panel");
    expect(css).toContain(".ds-skeleton");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
