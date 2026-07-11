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

  it("renderiza previa mockada sem permitir execucao", async () => {
    const { renderAtendenteIaPreview } = await loadAtendenteIa();
    const html = renderAtendenteIaPreview({
      ok: true,
      mode: "preview_only",
      intent: "schedule_appointment",
      confidence: 0.72,
      summary: "Possivel agendamento para Pedro.",
      draft: { clientName: "Pedro", services: ["Corte"] },
      missingFields: ["date", "time"],
      warnings: ["Informe data e horario antes de confirmar."],
      executed: false,
    });

    expect(html).toContain("Agendamento");
    expect(html).toContain("Pedro");
    expect(html).toContain("Campos faltantes");
    expect(html).toContain("Executado");
    expect(html).toContain("Nao");
  });
});
