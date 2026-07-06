import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("frontend agenda delay flow", () => {
  const appSource = () => readFileSync("public/app.js", "utf8");
  const appointmentsSource = () => readFileSync("public/modules/agendamentos.js", "utf8");
  const sliceBetween = (source: string, start: string, end: string) => {
    const startIndex = source.indexOf(start);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    const endIndex = source.indexOf(end, startIndex);
    expect(endIndex).toBeGreaterThan(startIndex);
    return source.slice(startIndex, endIndex);
  };

  it("botao Registrar atraso abre modal e nao dispara request imediatamente", () => {
    const source = appSource();
    expect(source).toContain('openAppointmentDelayModal(item, { openerElement: options.openerElement, source: "agenda" })');
    expect(source).toContain('openAppointmentDelayModal(item, { openerElement: options.openerElement, source: "appointments" })');
    expect(source).toContain("function submitAppointmentDelayModal(event)");

    const agendaDelayBranch = source.slice(
      source.indexOf('} else if (action === "DELAY") {'),
      source.indexOf('} else {', source.indexOf('} else if (action === "DELAY") {')),
    );
    expect(agendaDelayBranch).not.toContain("/delay");
    expect(agendaDelayBranch).not.toContain("callJson");
  });

  it("clicar em Registrar atraso fecha o drawer antes de abrir o modal", () => {
    const source = appSource();
    const openFlow = sliceBetween(source, "function openAppointmentDelayModal(appointment, options = {})", "async function submitAppointmentDelayModal(event)");
    expect(openFlow).toContain("closeAppointmentDetailPanel();");
    expect(openFlow.indexOf("closeAppointmentDetailPanel();")).toBeLessThan(openFlow.indexOf("ensureAppointmentDelayModal()"));
    expect(openFlow).toContain("modal.classList.remove(\"hidden\")");
    expect(openFlow).toContain("modal.classList.add(\"flex\")");
  });

  it("apenas o modal fica visivel e cancelar nao deixa camada invisivel", () => {
    const source = appSource();
    const closeDrawerFlow = sliceBetween(source, "function closeAppointmentDetailPanel()", "function renderCheckoutProducts()");
    const closeModalFlow = sliceBetween(source, "function closeAppointmentDelayModal(options = {})", "function ensureAppointmentDelayModal()");
    expect(closeDrawerFlow).toContain("selectedAppointmentId = \"\";");
    expect(closeDrawerFlow).toContain("renderAppointmentDetail(appointmentsElements.detail, null");
    expect(closeModalFlow).toContain("modal.classList.add(\"hidden\")");
    expect(closeModalFlow).toContain("modal.classList.remove(\"flex\")");
    expect(closeModalFlow).toContain("appointmentDelayState = {");
  });

  it("modal exige minutos inteiros positivos e cancelar nao cria evento", () => {
    const source = appSource();
    const closeModalFlow = sliceBetween(source, "function closeAppointmentDelayModal(options = {})", "function ensureAppointmentDelayModal()");
    expect(source).toContain('id="appointmentDelayMinutes"');
    expect(source).toContain('type="number" min="1" step="1" required');
    expect(source).toContain("!Number.isInteger(minutesLate) || minutesLate <= 0");
    expect(source).toContain("Informe os minutos de atraso com um numero inteiro positivo.");
    expect(source).toContain('data-appointment-delay-close');
    expect(source).toContain("closeAppointmentDelayModal({ returnFocus: true })");
    expect(closeModalFlow).not.toContain("callJson");
    expect(closeModalFlow).not.toContain("/delay");
  });

  it("envio bloqueia clique duplo e replay usa a mesma chave idempotente", () => {
    const source = appSource();
    expect(source).toContain("if (appointmentDelayState.submitting) return;");
    expect(source).toContain("appointmentDelayState.submitting = true;");
    expect(source).toContain("submitBtn.disabled = true;");
    expect(source).toContain('idempotencyKey: appointmentDelayState.idempotencyKey');
    expect(source).toContain('idempotencyKey: buildOperationIdempotencyKey("appointment-delay")');
  });

  it("sucesso encerra loading antes de fechar modal e atualizar agenda", () => {
    const source = appSource();
    const submitFlow = sliceBetween(source, "async function submitAppointmentDelayModal(event)", "async function submitCheckoutModal(event)");
    const closeIndex = submitFlow.indexOf("closeAppointmentDelayModal({ returnFocus: false })");
    expect(closeIndex).toBeGreaterThan(0);
    expect(submitFlow.indexOf("const result = await callJson")).toBeLessThan(closeIndex);
    expect(submitFlow.indexOf("success = true")).toBeLessThan(closeIndex);
    expect(submitFlow.indexOf("appointmentDelayState.submitting = false")).toBeLessThan(closeIndex);
    expect(submitFlow.indexOf("await loadAll()")).toBeGreaterThan(closeIndex);
  });

  it("sucesso fecha modal e atualiza Agenda sem alterar status ou horarios", () => {
    const source = appSource();
    const submitFlow = sliceBetween(source, "async function submitAppointmentDelayModal(event)", "async function submitCheckoutModal(event)");
    expect(submitFlow).toContain("closeAppointmentDelayModal({ returnFocus: false })");
    expect(submitFlow).toContain("setScheduleFeedback(\"success\", message)");
    expect(submitFlow).toContain("await loadAll()");
    expect(submitFlow).toContain("updatedStartsAt !== beforeStartsAt");
    expect(submitFlow).toContain("updatedEndsAt !== beforeEndsAt");
    expect(submitFlow).toContain("updated.status !== beforeStatus");
  });

  it("erro e timeout encerram loading e reabilitam controles no finally", () => {
    const source = appSource();
    const submitFlow = sliceBetween(source, "async function submitAppointmentDelayModal(event)", "async function submitCheckoutModal(event)");
    expect(submitFlow).toContain("} catch (error) {");
    expect(submitFlow).toContain("} finally {");
    expect(submitFlow).toContain("appointmentDelayState.submitting = false;");
    expect(submitFlow).toContain("if (!success && submitBtn)");
    expect(submitFlow).toContain("submitBtn.disabled = false;");
    expect(submitFlow).toContain('submitBtn.textContent = "Registrar atraso";');
    expect(submitFlow).toContain("if (minutesInput) minutesInput.disabled = false;");
    expect(submitFlow).toContain("if (reasonInput) reasonInput.disabled = false;");
    expect(submitFlow).toContain("Nao foi possivel registrar atraso.");
  });

  it("requisicoes possuem timeout de rede com mensagem amigavel", () => {
    const source = appSource();
    const apiFetch = sliceBetween(source, "async function apiFetch(url, options = {})", "function restoreActiveModule()");
    expect(source).toContain("const API_REQUEST_TIMEOUT_MS = 15000;");
    expect(apiFetch).toContain("AbortController");
    expect(apiFetch).toContain("window.setTimeout");
    expect(apiFetch).toContain("controller.abort()");
    expect(apiFetch).toContain("Tempo limite excedido. Verifique a conexao e tente novamente.");
    expect(apiFetch).toContain("Falha de rede. Verifique a conexao e tente novamente.");
    expect(apiFetch).toContain("window.clearTimeout(timeoutId)");
  });

  it("resposta persistida com falha de UI e recuperada por replay sem duplicar", () => {
    const source = appSource();
    const submitFlow = sliceBetween(source, "async function submitAppointmentDelayModal(event)", "async function submitCheckoutModal(event)");
    expect(submitFlow).toContain('idempotencyKey: appointmentDelayState.idempotencyKey');
    expect(submitFlow).toContain("if (appointmentDelayState.submitting) return;");
    expect(submitFlow).toContain("success = true");
    expect(submitFlow).toContain("closeAppointmentDelayModal({ returnFocus: false })");
    expect(submitFlow).toContain("beforeStartsAt");
    expect(submitFlow).toContain("beforeEndsAt");
    expect(submitFlow).toContain("beforeStatus");
  });

  it("historico mostra minutos, data e ator do atraso", () => {
    const source = appointmentsSource();
    expect(source).toContain("entry.changedAt || entry.at");
    expect(source).toContain("entry.changedBy || entry.actor");
    expect(source).toContain("minutesMatch");
    expect(source).toContain("formatHistoryEntry(entry)");
    expect(source).toContain("Atraso registrado");
    expect(source).not.toContain("return { label,");
  });

  it("atraso continua visivel no appointment sem expor codigo tecnico", () => {
    const app = appSource();
    const agenda = readFileSync("public/modules/agenda.js", "utf8");
    const appointments = appointmentsSource();
    expect(app).toContain("getAppointmentDelayInfo(item)");
    expect(app).toContain("Atraso: ${delayInfo.minutes} min");
    expect(agenda).toContain("history: Array.isArray(item.history) ? item.history : []");
    expect(agenda).toContain("Atraso: ${delayInfo.minutes} min");
    expect(appointments).toContain("Atraso: ${delayInfo.minutes} min");
    expect(appointments).toContain('label: isDelay ? "Atraso registrado" : label');
  });

  it("frontend valida que atraso nao mudou horario nem status", () => {
    const source = appSource();
    expect(source).toContain("beforeStartsAt");
    expect(source).toContain("beforeEndsAt");
    expect(source).toContain("beforeStatus");
    expect(source).toContain("Registro de atraso alterou horario ou status");
  });
});
