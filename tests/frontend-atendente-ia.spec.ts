import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

async function loadAtendenteIa() {
  return await import(pathToFileURL(`${process.cwd()}/public/modules/atendente-ia.js`).href);
}

describe("frontend Atendente IA", () => {
  it("renderiza estado amigavel sem chave", async () => {
    const { renderAtendenteIaShell, renderAtendenteIaError } = await loadAtendenteIa();

    expect(renderAtendenteIaShell()).toContain("A IA apenas prepara a acao");
    expect(renderAtendenteIaError("IA indisponivel: configure GEMINI_API_KEY no ambiente local seguro.")).toContain(
      "IA indisponivel",
    );
  });

  it("renderiza previa incompleta sem permitir execucao", async () => {
    const { canConfirmAtendenteIa, renderAtendenteIaPreview } = await loadAtendenteIa();
    const payload = {
      ok: true,
      mode: "preview_only",
      intent: "schedule_appointment",
      confidence: 0.72,
      summary: "Possivel agendamento para Pedro.",
      draft: { clientName: "Pedro", services: ["Corte"] },
      missingFields: ["date", "time"],
      warnings: ["Informe data e horario antes de confirmar."],
      executed: false,
    };
    const html = renderAtendenteIaPreview({
      ...payload,
    });

    expect(html).toContain("Agendamento");
    expect(html).toContain("Pedro");
    expect(html).toContain("Campos faltantes");
    expect(html).toContain("Executado");
    expect(html).toContain("Nao");
    expect(canConfirmAtendenteIa(payload)).toBe(false);
  });

  it("renderiza confirmacao apenas para agendamento liberado pelo backend", async () => {
    const { canConfirmAtendenteIa, renderAtendenteIaPreview } = await loadAtendenteIa();
    const payload = {
      ok: true,
      mode: "preview_only",
      intent: "schedule_appointment",
      confidence: 0.92,
      summary: "Agendamento pronto para confirmar.",
      draft: {
        clientName: "Joao",
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date: "2026-12-15",
        time: "10:00",
      },
      missingFields: [],
      warnings: [],
      allowedNextActions: ["confirm_execute"],
      confirmationToken: "token-assinado",
      confirmationMessage: "Confirmar criacao deste agendamento?",
      executed: false,
    };
    const html = renderAtendenteIaPreview(payload);

    expect(html).toContain("Confirmar criacao deste agendamento?");
    expect(canConfirmAtendenteIa(payload)).toBe(true);
  });

  it("renderiza confirmacao para venda de produto valida", async () => {
    const { canConfirmAtendenteIa, renderAtendenteIaPreview } = await loadAtendenteIa();
    const payload = {
      intent: "sell_product",
      summary: "Venda de produto para Lucas.",
      draft: { clientName: "Lucas", productName: "Pomada", quantity: 1, paymentMethod: "Pix" },
      sale: {
        clientName: "Lucas",
        productName: "Pomada Matte",
        quantity: 1,
        paymentMethod: "Pix",
        unitPrice: 59,
        total: 59,
      },
      allowedNextActions: ["confirm_execute"],
      confirmationToken: "token-assinado",
      confirmationMessage: "Confirmar venda de produto?",
      executed: false,
    };
    const html = renderAtendenteIaPreview(payload);

    expect(html).toContain("Pomada Matte");
    expect(html).toContain("Lucas");
    expect(html).toContain("Pix");
    expect(html).toContain("Confirmar venda de produto?");
    expect(canConfirmAtendenteIa(payload)).toBe(true);
  });

  it("mantem checkout como proxima etapa", async () => {
    const { canConfirmAtendenteIa, renderAtendenteIaPreview } = await loadAtendenteIa();
    const payload = {
      intent: "checkout_service",
      summary: "Checkout de servico para Lucas.",
      draft: { clientName: "Lucas", services: ["Corte"] },
      executionMessage: "Execucao desta acao sera liberada em uma proxima etapa.",
      executed: false,
    };
    const html = renderAtendenteIaPreview(payload);

    expect(html).toContain("Execucao desta acao sera liberada em uma proxima etapa.");
    expect(canConfirmAtendenteIa(payload)).toBe(false);
  });
});
