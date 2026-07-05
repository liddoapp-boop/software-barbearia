import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function htmlSource() {
  return readFileSync("public/booking.html", "utf8");
}

function loadBookingSelection() {
  const source = readFileSync("public/modules/booking-service-selection.js", "utf8");
  const context: Record<string, any> = {};
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "public/modules/booking-service-selection.js" });
  return context.BookingServiceSelection;
}

describe("booking publico multi-servico", () => {
  const corte = { id: "svc-corte", name: "Corte", price: 30, duration: 30 };
  const barba = { id: "svc-barba", name: "Barba", price: 20, duration: 30 };
  const hidratacao = { id: "svc-hidratacao", name: "Hidratacao", price: 20, duration: 30 };

  it("seleciona de 1 a 6 servicos preservando ordem, sem duplicidade, com remover e limpar", () => {
    const selection = loadBookingSelection();
    let selected: any[] = [];

    selected = selection.add(selected, corte).selected;
    selected = selection.add(selected, barba).selected;
    selected = selection.add(selected, hidratacao).selected;

    expect(selection.ids(selected)).toEqual(["svc-corte", "svc-barba", "svc-hidratacao"]);
    expect(selection.add(selected, corte)).toMatchObject({ ok: false });

    for (let index = 4; index <= 6; index += 1) {
      selected = selection.add(selected, { id: `svc-${index}`, name: `Servico ${index}` }).selected;
    }
    expect(selected).toHaveLength(6);
    expect(selection.add(selected, { id: "svc-7", name: "Setimo" })).toMatchObject({ ok: false });

    selected = selection.remove(selected, "svc-barba");
    expect(selection.ids(selected)).toEqual(["svc-corte", "svc-hidratacao", "svc-4", "svc-5", "svc-6"]);
    expect(selection.clear()).toEqual([]);
    expect(selection.validate([])).toMatchObject({ ok: false });
  });

  it("interpreta preview do backend e usa duracao efetiva sem regra hardcoded no frontend", () => {
    const selection = loadBookingSelection();
    const summary = selection.interpretPreview({
      serviceItems: [
        { serviceId: "svc-corte", position: 0, serviceNameSnapshot: "Corte", servicePriceSnapshot: 30, serviceDurationMinSnapshot: 30 },
        { serviceId: "svc-barba", position: 1, serviceNameSnapshot: "Barba", servicePriceSnapshot: 20, serviceDurationMinSnapshot: 30 },
      ],
      totalPrice: 50,
      effectiveDurationMin: 45,
      ruleLabel: "Corte + Barba",
    }, [corte, barba]);

    expect(summary.label).toBe("Corte + Barba");
    expect(summary.totalPrice).toBe(50);
    expect(summary.effectiveDurationMin).toBe(45);
    expect(summary.ruleLabel).toBe("Corte + Barba");
  });

  it("frontend consulta preview e disponibilidade com serviceIds e ignora respostas antigas", () => {
    const html = htmlSource();

    expect(html).toContain("/public/services/preview");
    expect(html).toContain("servicePreviewRequestId += 1");
    expect(html).toContain("requestId !== servicePreviewRequestId");
    expect(html).toContain("AbortController");
    expect(html).toContain("serviceIds=${serviceIds.map(encodeURIComponent).join(',')}");
    expect(html).not.toContain("/public/slots?serviceId=");
    expect(html).not.toContain("/professionals");
    expect(html).not.toContain("data-professional-id");
    expect(html).toContain("Atendimento com Geovane Borges");
  });

  it("payload publico usa serviceIds, idempotencyKey e nao envia serviceId/preco/duracao/professionalId", () => {
    const html = htmlSource();
    const submitStart = html.indexOf("async function submitBooking");
    const successStart = html.indexOf("function renderBookingSuccess", submitStart);
    const submit = html.slice(submitStart, successStart);
    const payloadStart = submit.indexOf("const payload = {");
    const payloadEnd = submit.indexOf("};", payloadStart);
    const payload = submit.slice(payloadStart, payloadEnd);

    expect(payload).toContain("serviceIds: submittedData.serviceIds");
    expect(payload).toContain("idempotencyKey: bookingIdempotencyKey");
    expect(payload).not.toContain("serviceId:");
    expect(payload).not.toContain("professionalId");
    expect(payload).not.toContain("price");
    expect(payload).not.toContain("duration");
    expect(payload).not.toContain("total");
  });

  it("review, conflito, sucesso e reinicio preservam o fluxo esperado", () => {
    const html = htmlSource();

    expect(html).toContain("Revise seu agendamento");
    expect(html).toContain("Voltar e alterar");
    expect(html).toContain("Confirmando...");
    expect(html).toContain("Esse horario acabou de ser reservado. Escolha outro horario.");
    expect(html).toContain("Agendamento confirmado com sucesso.");
    expect(html).toContain("Fazer novo agendamento");
    expect(html).toContain("bookingIdempotencyKey = createBookingIdempotencyKey()");
    expect(html).toContain("'serviceWidgetWrap'");
  });

  it("mobile possui regras de contencao para resumo e acoes", () => {
    const html = htmlSource();

    expect(html).toContain(".svc-summary-grid");
    expect(html).toContain(".svc-selection-actions");
    expect(html).toContain("@media (max-width: 360px)");
    expect(html).toContain("grid-template-columns: 1fr");
    expect(html).toContain("aria-live=\"polite\"");
  });
});
