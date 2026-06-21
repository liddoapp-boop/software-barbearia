import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = () => readFileSync("public/booking.html", "utf8");

describe("booking publico - trava pos-sucesso", () => {
  it("mantem estado explicito de conclusao e bloqueia mutacoes do fluxo antigo", () => {
    const html = source();

    expect(html).toContain("let bookingCompleted = false");
    expect(html).toContain("function canMutateBookingFlow");
    expect(html).toContain("return isCurrentBookingRun(runId) && !bookingCompleted");
    expect(html).toContain("function lockCompletedBookingUI");
    expect(html).toContain("bookingCompleted = true");
    expect(html).toContain("selectedSlot = null");
    expect(html).toContain("selectedSlotProfessional = null");
    expect(html).not.toContain("bookingSubmitted");

    const guardedHandlers = [
      "async function onPickService",
      "async function onPickProfessional",
      "function onPickDay",
      "async function onPickSlot",
      "async function showConfirm",
      "async function submitBooking",
    ];
    for (const handler of guardedHandlers) {
      const index = html.indexOf(handler);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(html.slice(index, index + 180)).toContain("if (!canMutateBookingFlow(runId)) return;");
    }
  });

  it("remove calendario e confirmacao antigos e renderiza um unico sucesso com resumo", () => {
    const html = source();

    expect(html).toContain("removeCurrentBookingWidgets");
    expect(html).toContain("'calWidgetWrap'");
    expect(html).toContain("'confirmWidgetWrap'");
    expect(html).toContain("'bookingSuccessWrap'");
    expect(html).toContain("'bookingSuccessMessageWrap'");
    expect(html).toContain('id="bookingSuccessWrap"');
    expect(html).toContain("oldSuccess.remove()");
    expect(html).toContain("oldSuccessMessage.remove()");
    expect(html).toContain("renderBookingSuccess({");
    expect(html).toContain("serviceName: submittedData.serviceName");
    expect(html).toContain("professionalName: assignedProfessionalName");
    expect(html).toContain("dateStr: submittedData.dateStr");
    expect(html).toContain("time: submittedData.time");
    expect(html).toContain("Novo agendamento");
  });

  it("bloqueia double tap no confirmar e libera somente em falha", () => {
    const html = source();

    expect(html).toContain("if (bookingSubmitting || bookingCompleted) return;");
    expect(html).toContain("bookingSubmitting = true");
    expect(html).toContain("const btn = document.querySelector('#confirmWidgetWrap #btnConfirm')");
    expect(html).toContain("btn.disabled = true");
    expect(html).toContain("lockCompletedBookingUI();");
    expect(html).toContain("bookingSubmitting = false;");
    expect(html).toContain("btn.disabled = false");
  });

  it("novo agendamento limpa sucesso anterior e reinicia conscientemente", () => {
    const html = source();

    expect(html).toContain("resetBookingFlowState()");
    expect(html).toContain("bookingCompleted = false");
    expect(html).toContain("document.body.classList.remove('booking-locked')");
    expect(html).toContain("removeCurrentBookingWidgets();");
    expect(html).toContain("success.querySelector('#btnRestartBooking').addEventListener('click', () => beginNewBooking(true))");
    expect(html).toContain("await loadServices()");
  });

  it("preserva contratos publicos ja validados do booking", () => {
    const html = source();
    const api = readFileSync("src/http/app.ts", "utf8");

    expect(html).toContain("payload.professionalId = confirmData.professionalId");
    expect(html).toContain("if (email) payload.clientEmail = email");
    expect(html).toContain("isValidEmail(email)");
    expect(api).toContain("professionalName");
    expect(api).toContain("APPOINTMENT_CREATED");
  });
});
