import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("public/app.js", "utf8");
const indexSource = readFileSync("public/index.html", "utf8");
const componentSource = readFileSync("public/components/interaction-surfaces.js", "utf8");
const interactionCss = readFileSync("public/styles/interaction-surfaces.css", "utf8");
const schedulingSource = readFileSync("public/modules/agendamento.js", "utf8");

function loadSchedulingRenderer() {
  let source = schedulingSource.replace(/export function /g, "function ");
  source += "\nmodule.exports = { renderScheduleAssist, renderAlternativeSlots };";
  const context = { module: { exports: {} as Record<string, any> } };
  vm.runInNewContext(source, context, { filename: "public/modules/agendamento.js" });
  return context.module.exports;
}

function scheduleAssistElements() {
  const element = () => ({
    hidden: false,
    className: "sched-info-block",
    textContent: "",
    innerHTML: "",
    querySelectorAll: () => [],
  });
  return {
    clientInsights: element(),
    serviceSuggestions: element(),
    appointmentFeedback: element(),
    alternativeSlots: element(),
  };
}

describe("superficies de interacao Liddo", () => {
  it("carrega a camada exclusiva por ultimo sem substituir contratos existentes", () => {
    const agendaIndex = indexSource.indexOf("/styles/agenda-surface.css");
    const interactionIndex = indexSource.indexOf("/styles/interaction-surfaces.css");

    expect(interactionIndex).toBeGreaterThan(agendaIndex);
    expect(indexSource).toContain('id="appointmentForm"');
    expect(indexSource).toContain('id="financialTransactionForm"');
    expect(indexSource).toContain('id="inventoryProductForm"');
    expect(indexSource).toContain('id="servicesForm"');
    expect(indexSource).toContain('id="professionalsForm"');
    expect(indexSource).toContain('id="clientsForm"');
    expect(indexSource).toContain('id="metasGoalForm"');
  });

  it("aplica aprimoramento por funcoes explicitas a controles estaticos e dinamicos", () => {
    expect(appSource).toContain('initInteractionSurfaces(document)');
    expect(componentSource).toContain('addClassOnce(control, "liddo-control")');
    expect(componentSource).toContain('addClassOnce(form, "liddo-form")');
    expect(componentSource).not.toContain("MutationObserver");
    expect(componentSource).toContain("export function openInteractionSurface");
    expect(componentSource).toContain("export function closeInteractionSurface");
    expect(componentSource).toContain("interactionSurfacesInitialized");
    expect(componentSource).toContain('root.closest("form")');
  });

  it("mantem classificacao automatica sem expor Tags no cadastro basico", () => {
    expect(indexSource).not.toContain('id="clientsTags"');
    expect(indexSource).not.toContain("Tags (separadas");
    expect(appSource).toContain("tags: mapClientStatusToTags(selectedStatus)");
  });

  it("preserva validacao nativa e explicita estados preenchido, invalido e envio", () => {
    expect(componentSource).toContain('control.checkValidity?.()');
    expect(componentSource).toContain('addEventListener("invalid"');
    expect(componentSource).toContain('setAttribute("aria-invalid", "true")');
    expect(componentSource).toContain('form.dataset.interactionState = "submitting"');
    expect(interactionCss).toContain('[data-interaction-submitted="true"] .liddo-control:invalid');
    expect(interactionCss).toContain('[data-control-state="filled"]');
  });

  it("mantem Tab dentro da superficie e devolve foco ao acionador", () => {
    expect(componentSource).toContain("function trapSurfaceFocus");
    expect(componentSource).toContain('if (event.key !== "Tab") return');
    expect(componentSource).toContain("opener.focus({ preventScroll: true })");
    expect(componentSource).toContain('document.addEventListener("keydown", trapSurfaceFocus, true)');
  });

  it("substitui confirmacoes nativas por consequencia explicita e Escape previsivel", () => {
    expect(appSource).not.toContain("window.confirm(");
    expect(appSource).not.toContain("window.prompt(");
    expect(appSource).toContain("await confirmInteraction({");
    expect(appSource).toContain("await promptInteraction({");
    expect(componentSource).toContain('if (event.key === "Escape")');
    expect(interactionCss).toContain(".liddo-confirm-consequence");
    expect(interactionCss).toContain('[data-interaction-context="destructive"]');
  });

  it("mantem modais e drawers dentro da viewport com scroll na regiao correta", () => {
    expect(interactionCss).toContain("max-height: min(92dvh, 820px)");
    expect(interactionCss).toContain("height: 100dvh");
    expect(interactionCss).toContain("height: 100% !important");
    expect(interactionCss).toContain("overflow-y: auto");
    expect(interactionCss).toContain("overscroll-behavior: contain");
    expect(interactionCss).toContain("position: sticky !important");
  });

  it("normaliza forms de modal em body rolavel e footer externo pela regra compartilhada", () => {
    expect(componentSource).toContain("function normalizeModalFormRegions(form)");
    expect(componentSource).toContain('body.className = "liddo-modal-form-body"');
    expect(componentSource).toContain('form.classList.add("liddo-modal-form-shell")');
    expect(componentSource).toContain('footer.classList.add("liddo-modal-form-footer")');
    expect(interactionCss).toContain(".liddo-modal .liddo-modal-form-shell");
    expect(interactionCss).toContain("grid-template-rows: minmax(0, 1fr) auto !important");
    expect(interactionCss).toContain(".liddo-modal .liddo-modal-form-body");
    expect(interactionCss).toContain("overflow-y: auto");
    expect(interactionCss).toContain(".liddo-modal-form-shell > .liddo-modal-form-footer");
    expect(interactionCss).toContain("max(12px, env(safe-area-inset-bottom))");
  });

  it("preserva scrollbar visivel com respiro sem permitir que o form inteiro role", () => {
    expect(interactionCss).toContain("scrollbar-width: thin");
    expect(interactionCss).toContain("::-webkit-scrollbar-thumb");
    expect(interactionCss).toContain("background: rgba(194, 154, 103, 0.42)");
    expect(interactionCss).toMatch(/\.liddo-modal \.liddo-modal-form-shell\s*\{[\s\S]*?overflow: hidden !important/);
    expect(interactionCss).toMatch(/\.liddo-modal \.liddo-modal-form-body\s*\{[\s\S]*?padding: 15px 23px 17px 17px/);
  });

  it("trava a pagina por classe explicita e restaura scroll e foco sem loops de viewport", () => {
    expect(componentSource).toContain("function lockPage()");
    expect(componentSource).toContain("function unlockPage()");
    expect(componentSource).toContain('document.body.classList.add("interaction-surface-open")');
    expect(componentSource).toContain("window.scrollTo(scrollX, scrollY)");
    expect(componentSource).toContain("function requestSurfaceClose");
    expect(componentSource).not.toContain("window.visualViewport");
    expect(componentSource).not.toContain("surfaceSyncFrame");
    expect(interactionCss).toContain("body.interaction-surface-open");
  });

  it("diferencia checkout, PDV e governanca sem alterar calculos", () => {
    expect(interactionCss).toContain("#appointmentCheckoutModal .checkout-total-panel");
    expect(interactionCss).toContain("#operationSection .pdv-mkt-cart-total");
    expect(interactionCss).toContain("GOVERNANÇA");
    expect(appSource).toContain("buildCheckoutTotals(");
  });

  it("oferece foco visivel, touch confortavel e reduced motion", () => {
    expect(interactionCss).toContain(".liddo-control:focus-visible");
    expect(interactionCss).toContain("--interaction-control-height: 44px");
    expect(interactionCss).toContain("font-size: 16px !important");
    expect(interactionCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(interactionCss).toContain("animation: none !important");
  });

  it("mantem startsAt como contrato e separa Data e Hora apenas no mobile", () => {
    expect(indexSource).toContain('id="startsAt"');
    expect(indexSource).toContain('id="appointmentDate"');
    expect(indexSource).toContain('id="appointmentTime"');
    expect(appSource).toContain("function syncStartsAtFromMobileTemporalControls");
    expect(appSource).toContain("`${appointmentDate.value}T${appointmentTime.value}`");
    expect(appSource).toContain('const startsAtIso = new Date(selectedStartsAt).toISOString()');
    expect(interactionCss).toContain("#scheduleDrawer .appointment-datetime-desktop");
    expect(interactionCss).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(interactionCss).toContain("@media (max-width: 400px)");
  });

  it("mantem o drawer mobile fixo sem eixo lateral e usa um unico scroll vertical", () => {
    const contract = interactionCss.slice(interactionCss.indexOf("Safari mobile contract"));
    expect(contract).toContain("inset: 0 !important");
    expect(contract).toContain("width: 100% !important");
    expect(contract).toContain("overflow-x: hidden !important");
    expect(contract).toContain("overflow-y: auto !important");
    expect(contract).toContain("overscroll-behavior: contain");
    expect(contract).toContain("#scheduleDrawer .svc-option-list");
    expect(contract).toContain("max-height: none !important");
    expect(contract).toContain("overflow: visible !important");
  });

  it("inicia sem mensagens passivas e preserva feedback util", () => {
    expect(indexSource).toContain('id="clientInsights" class="sched-info-block" hidden');
    expect(indexSource).toContain('id="serviceSuggestions" class="sched-info-block" hidden');
    expect(indexSource).toContain('id="appointmentFeedback" class="sched-info-block" hidden');
    expect(indexSource).toContain('id="alternativeSlots" class="sched-info-block" hidden');
    expect(schedulingSource).toContain("elements.appointmentFeedback.hidden = true");
    expect(schedulingSource).toContain("elements.appointmentFeedback.hidden = false");
    expect(schedulingSource).toContain('feedback.type === "error"');
    expect(schedulingSource).toContain("container.hidden = false");
  });

  it("oculta o estado neutro mas exibe erro e conflito reais", () => {
    const { renderScheduleAssist } = loadSchedulingRenderer();
    const elements = scheduleAssistElements();
    renderScheduleAssist({
      professionalsById: {},
      relatedServices: [],
      feedback: { type: "neutral", message: "" },
    }, elements);
    expect(elements.clientInsights.hidden).toBe(true);
    expect(elements.serviceSuggestions.hidden).toBe(true);
    expect(elements.appointmentFeedback.hidden).toBe(true);

    renderScheduleAssist({
      professionalsById: {},
      relatedServices: [],
      feedback: { type: "error", message: "Conflito local com outro cliente as 10:00." },
    }, elements);
    expect(elements.appointmentFeedback.hidden).toBe(false);
    expect(elements.appointmentFeedback.className).toContain("sched-info-block-error");
    expect(elements.appointmentFeedback.textContent).toContain("Conflito local");
  });

  it("usa data nativa e legivel somente no formulario de Novo Lancamento", () => {
    expect(indexSource).toContain('id="financialTransactionDate" type="date"');
    expect(indexSource).toContain('class="fn-field fn-entry-date-field"');
    expect(interactionCss).toContain("#financialTransactionModal .fn-entry-date-field input[type=\"date\"]");
    expect(interactionCss).toContain("font-size: 16px !important");
    expect(appSource).toContain("date: new Date(`${financialTransactionDate.value}T12:00:00`).toISOString()");
  });
});
