import { readFileSync } from "node:fs";
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

describe("Macro 233 - fluxos owner conectados na Agenda", () => {
  it("owner ve Mais opções ao lado de Novo agendamento", () => {
    const html = source("public/index.html");
    const app = source("public/app.js");

    expect(html).toContain('id="agendaNewAppointmentBtn"');
    expect(html).toContain('id="agendaMoreOptionsBtn"');
    expect(html).toContain("Mais opções");
    expect(app).toContain("function canUseOwnerAgendaFlows()");
    expect(app).toContain('return state.role === "owner";');
    expect(app).toContain("syncAgendaOwnerActionsVisibility()");
  });

  it("menu contem as quatro ações owner sem quatro botoes grandes simultaneos", () => {
    const html = source("public/index.html");

    expect(html).toContain('data-owner-flow="walk-in"');
    expect(html).toContain("Atendimento sem agendamento");
    expect(html).toContain('data-owner-flow="block-time"');
    expect(html).toContain("Bloquear horario");
    expect(html).toContain('data-owner-flow="block-day"');
    expect(html).toContain("Bloquear dia");
    expect(html).toContain('data-owner-flow="fitting"');
    expect(html).toContain("Criar encaixe");
    expect(html).toContain('id="agendaMoreOptionsMenu"');
  });

  it("cada ação abre o formulário correto em um modal unico", () => {
    const app = source("public/app.js");
    const openFlow = functionBody(app, "openOwnerFlow");
    const renderFlow = functionBody(app, "renderOwnerFlowForm");

    expect(openFlow).toContain("ownerFlowState =");
    expect(openFlow).toContain("ensureOwnerFlowModal()");
    expect(renderFlow).toContain('type === "block-time" || type === "block-day"');
    expect(renderFlow).toContain('type === "fitting"');
    expect(renderFlow).toContain("ownerFlowTitle(type)");
  });

  it("handlers chamam as rotas existentes da Macro 233", () => {
    const app = source("public/app.js");
    const submitOwner = functionBody(app, "submitOwnerFlowForm");
    const submitServices = functionBody(app, "submitInServiceServicesForm");

    expect(submitOwner).toContain('/appointments/blocks');
    expect(submitOwner).toContain('/appointments/walk-in');
    expect(submitOwner).toContain('/appointments/fitting');
    expect(submitServices).toContain('/appointments/${appointment.id}/services');
    expect(app).toContain('/appointments/${appointment.id}/checkout');
  });

  it("sucesso fecha formulario e atualiza Agenda", () => {
    const app = source("public/app.js");
    const submitOwner = functionBody(app, "submitOwnerFlowForm");
    const submitServices = functionBody(app, "submitInServiceServicesForm");

    expect(submitOwner).toContain("closeOwnerFlowModal({ returnFocus: false })");
    expect(submitOwner).toContain("await loadAll()");
    expect(submitServices).toContain("closeInServiceServicesModal({ returnFocus: false })");
    expect(submitServices).toContain("await loadAll()");
  });

  it("erro reabilita campos e nao deixa loading infinito", () => {
    const app = source("public/app.js");
    const ownerLoading = functionBody(app, "setOwnerFlowLoading");
    const serviceLoading = functionBody(app, "setInServiceServicesLoading");
    const submitOwner = functionBody(app, "submitOwnerFlowForm");
    const submitServices = functionBody(app, "submitInServiceServicesForm");

    expect(ownerLoading).toContain("field.disabled = loading");
    expect(serviceLoading).toContain("field.disabled = loading");
    expect(submitOwner).toContain("finally");
    expect(submitOwner).toContain("setOwnerFlowLoading(false)");
    expect(submitServices).toContain("finally");
    expect(submitServices).toContain("setInServiceServicesLoading(false)");
  });

  it("walk-in fora do expediente mostra confirmacao e reenvia a mesma acao confirmada", () => {
    const app = source("public/app.js");
    const callJson = functionBody(app, "callJson");
    const submitOwner = functionBody(app, "submitOwnerFlowForm");
    const feedback = functionBody(app, "ownerFlowFeedbackHtml");
    const submitLabel = functionBody(app, "ownerFlowSubmitLabel");

    expect(callJson).toContain("Object.assign(error, data)");
    expect(submitOwner).toContain("confirmOutOfHours: ownerFlowState.outOfHoursRequired || undefined");
    expect(submitOwner).toContain('error?.code === "WALK_IN_OUTSIDE_BUSINESS_HOURS"');
    expect(submitOwner).toContain("ownerFlowState.outOfHoursRequired = true");
    expect(submitOwner).toContain("renderOwnerFlowForm()");
    expect(submitOwner).toContain("return;");
    expect(submitOwner).toContain("closeOwnerFlowModal({ returnFocus: false })");
    expect(feedback).toContain("ownerFlowState.outOfHoursRequired");
    expect(feedback).toContain("fora do expediente");
    expect(submitLabel).toContain("Registrar mesmo assim");
  });

  it("bloqueio nao anuncia conflito local e usa profissional readonly quando unico", () => {
    const app = source("public/app.js");
    const renderFlow = functionBody(app, "renderOwnerFlowForm");

    expect(renderFlow).toContain("professionalFieldHtmlForFlow([], professionalValue, true)");
    expect(renderFlow).toContain("A disponibilidade sera validada ao confirmar o bloqueio.");
    expect(renderFlow).not.toContain("Nenhum conflito local encontrado");
  });

  it("apenas uma camada fica aberta", () => {
    const app = source("public/app.js");
    const closeLayers = functionBody(app, "closeFloatingLayers");
    const openOwner = functionBody(app, "openOwnerFlow");
    const openServices = functionBody(app, "openInServiceServicesModal");

    expect(closeLayers).toContain("closeScheduleDrawer()");
    expect(closeLayers).toContain("closeAppointmentDetailPanel()");
    expect(closeLayers).toContain("closeOwnerFlowModal");
    expect(closeLayers).toContain("closeInServiceServicesModal");
    expect(openOwner).toContain("closeFloatingLayers({ keepOwnerFlow: true })");
    expect(openServices).toContain("closeFloatingLayers({ keepServiceChange: true })");
  });

  it("IN_SERVICE mostra checkout e alterar servicos, outros estados nao mostram ações invalidas", () => {
    const appointments = source("public/modules/agendamentos.js");
    const app = source("public/app.js");

    expect(appointments).toContain('if (status === "IN_SERVICE")');
    expect(appointments).toContain('["COMPLETE", "SERVICES"');
    expect(appointments).toContain('if (action === "COMPLETE") return "Ir para checkout";');
    expect(appointments).toContain('if (action === "SERVICES") return "Alterar servicos";');
    expect(app).toContain('if (action === "SERVICES")');
    expect(app).toContain("openInServiceServicesModal");
  });

  it("nenhuma enum técnica nova aparece como texto de ação", () => {
    const html = source("public/index.html");
    const appointments = source("public/modules/agendamentos.js");

    const menuBlock = html.slice(html.indexOf('id="agendaMoreOptionsMenu"'), html.indexOf("</div>", html.indexOf('id="agendaMoreOptionsMenu"')));
    expect(menuBlock).not.toMatch(/IN_SERVICE|FITTING|WALK_IN/);
    expect(appointments).toContain("Em atendimento");
    expect(appointments).not.toContain(">IN_SERVICE<");
    expect(appointments).not.toContain(">FITTING<");
    expect(appointments).not.toContain(">WALK_IN<");
  });

  it("mobile continua com scroll normal", () => {
    const css = source("public/styles/layout.css");

    expect(css).toContain(".owner-flow-modal");
    expect(css).toContain("max-height: min(92vh, 780px)");
    expect(css).not.toMatch(/body\.owner-flow-open\s*\{[^}]*overflow:\s*hidden/);
    expect(css).not.toMatch(/body\s*\{[^}]*overflow-y:\s*hidden/);
  });
});
