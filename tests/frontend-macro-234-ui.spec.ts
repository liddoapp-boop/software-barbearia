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

    expect(visible).toEqual(["agenda", "clientes", "financeiro", "estoque", "atendente-ia", "configuracoes", "servicos", "auditoria"]);
    expect(visible).not.toEqual(expect.arrayContaining(["dashboard", "operacao", "profissionais", "comissoes", "metas", "fidelizacao", "automacoes", "relatorios", "whatsapp", "agendamento-link"]));
    expect(menu.MOBILE_TABS.map((tab: any) => tab.moduleId)).toEqual(["agenda", "clientes", null]);
    expect(menu.MOBILE_TABS.map((tab: any) => tab.label)).not.toContain("Hoje");
    expect(menu.getDefaultModuleForRole("owner")).toBe("agenda");
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

    expect(sidebarHtml).toContain("Liddo Barber");
    expect(sidebarHtml).not.toContain("Sistema de gestao");
    expect(sidebarHtml).toContain("Barbearia Geovane Borges");
    expect(app).toContain("function normalizeOperationName");
    expect(app).toContain('placeholder === "unidade padrao"');
    expect(booking).toContain("Barbearia Geovane Borges");
    expect(booking).toContain("Tecnologia Liddo");
    expect(login).toContain("<div class=\"logo\">Liddo Barber</div>");
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
});
