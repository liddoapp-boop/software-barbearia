import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadFinanceRenderer() {
  let source = readFileSync("public/modules/financeiro.js", "utf8");
  source = source.replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
  source = source.replace(/export function /g, "function ");
  source += "\nmodule.exports = { renderFinancialData };";
  const context = {
    module: { exports: {} as Record<string, any> },
    renderEmptyState: ({ title, description }: { title: string; description: string }) =>
      `<section data-empty><strong>${title}</strong><span>${description}</span></section>`,
    renderPanelMessage: () => "",
    bindEntityDrawers: () => {},
    renderEntityDrawer: () => "",
  };
  vm.runInNewContext(source, context, { filename: "public/modules/financeiro.js" });
  return context.module.exports;
}

function elements() {
  const element = () => ({
    innerHTML: "",
    querySelector: () => null,
  });
  return {
    summary: element(),
    toolbar: element(),
    cashflow: element(),
    list: element(),
    commissions: element(),
    reports: element(),
  };
}

describe("superficie financeira", () => {
  it("usa somente o select nativo de periodo sem markup ou estado de popover", () => {
    const app = readFileSync("public/app.js", "utf8");
    const css = readFileSync("public/styles/finance-surface.css", "utf8");

    expect(app).toContain('id="financialPeriod"');
    expect(app).toContain('<option value="custom">Personalizado</option>');
    expect(app).toContain('id="financialCustomRange"');
    expect(app).not.toMatch(/fnPicker|financialDateTrigger|data-fn-preset|initFinancialDatePicker|initLegacyFinancialDatePicker/);
    expect(css).not.toMatch(/fnPicker|fn-period-popover|fn-picker-wrap/);
    expect(css).not.toMatch(/#financeiroSection[\s\S]{0,80}(?:position:\s*(?:absolute|fixed)|z-index:)/);
  });

  it("mantem estado vazio informativo, com valores em pt-BR e sem grafico ficticio", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();

    renderFinancialData(view, {
      summary: {
        summary: { estimatedProfit: 0 },
        cashFlow: { incoming: 0, outgoing: 0, balance: 0 },
      },
      transactions: { transactions: [] },
    });

    expect(view.summary.innerHTML).toContain('data-kpi-kind="balance"');
    expect(view.summary.innerHTML).toContain("R$ 0,00");
    expect(view.cashflow.innerHTML).toContain("Sem movimento neste periodo");
    expect(view.cashflow.innerHTML).toContain("Nenhuma origem registrada");
    expect(view.cashflow.innerHTML).not.toContain("fn-flow-bars");
    expect(view.list.innerHTML).toContain("Nenhum lancamento financeiro encontrado.");
  });

  it("mostra fluxo, origem e registros quando existem lancamentos", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    const transactions = [
      {
        id: "income-1",
        type: "INCOME",
        amount: 240,
        source: "SERVICE",
        referenceType: "APPOINTMENT",
        description: "Corte Premium",
        category: "Servicos",
        paymentMethod: "PIX",
        date: "2026-07-25T12:00:00.000Z",
      },
      {
        id: "expense-1",
        type: "EXPENSE",
        amount: 80,
        source: "MANUAL",
        referenceType: "MANUAL",
        description: "Material",
        category: "Operacao",
        paymentMethod: "Dinheiro",
        date: "2026-07-25T13:00:00.000Z",
      },
    ];

    renderFinancialData(view, {
      summary: {
        summary: { estimatedProfit: 160, operationalExpenses: 80 },
        cashFlow: { incoming: 240, outgoing: 80, balance: 160 },
      },
      transactions: { transactions },
    });

    expect(view.toolbar.innerHTML).toContain("2 lancamentos");
    expect(view.cashflow.innerHTML).toContain("fn-flow-bars");
    expect(view.cashflow.innerHTML).toContain("Atendimento finalizado");
    expect(view.cashflow.innerHTML).toContain("Lancamento manual");
    expect(view.list.innerHTML).toContain("Corte Premium");
    expect(view.list.innerHTML).toContain("Material");
    expect(view.list.innerHTML).toContain("fn-row-income");
    expect(view.list.innerHTML).toContain("fn-row-expense");
  });
});
