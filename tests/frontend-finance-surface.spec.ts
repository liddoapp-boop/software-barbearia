import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadFinanceRenderer() {
  let source = readFileSync("public/modules/financeiro.js", "utf8");
  source = source.replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
  source = source.replace(/export function /g, "function ");
  source += "\nmodule.exports = { renderFinancialData, renderFinancialHeader, renderTransactionRow };";
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
    header: element(),
    summary: element(),
    toolbar: element(),
    cashflow: element(),
    list: element(),
    commissions: element(),
    reports: element(),
  };
}

function populatedPayload() {
  return {
    summary: {
      period: {
        start: "2026-07-01T03:00:00.000Z",
        end: "2026-08-01T02:59:59.999Z",
        compareStart: "2026-06-01T03:00:00.000Z",
        compareEnd: "2026-07-01T02:59:59.999Z",
      },
      summary: {
        grossRevenue: 300,
        expenses: 80,
        netBalance: 220,
        ticketAverage: 150,
        paidCheckoutsCount: 2,
        movementsCount: 3,
      },
      cashFlow: { incoming: 300, outgoing: 80, balance: 220 },
      revenueOrigins: { services: 150, products: 75, manual: 75, other: 0 },
      comparison: {
        grossRevenueDelta: 100,
        expensesDelta: 30,
        netBalanceDelta: 70,
        ticketAverageDelta: 25,
        movementsDelta: 1,
      },
    },
    transactions: {
      transactions: [
        {
          id: "income-1",
          type: "INCOME",
          amount: 300,
          source: "SERVICE",
          referenceType: "APPOINTMENT",
          description: "Checkout pago",
          category: "Serviços",
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
          category: "Operação",
          paymentMethod: "Dinheiro",
          date: "2026-07-25T13:00:00.000Z",
        },
      ],
    },
  };
}

describe("superfície financeira", () => {
  it("preserva o filtro nativo de período e o botão Novo lançamento", () => {
    const app = readFileSync("public/app.js", "utf8");
    const css = readFileSync("public/styles/finance-surface.css", "utf8");

    expect(app).toContain('id="financialPeriod"');
    expect(app).toContain('<option value="custom">Personalizado</option>');
    expect(app).toContain('id="financialCustomRange"');
    expect(app).toContain("financialCustomApply?.addEventListener");
    expect(app).not.toMatch(/fnPicker|financialDateTrigger|data-fn-preset|initFinancialDatePicker|initLegacyFinancialDatePicker/);
    expect(css).not.toMatch(/fnPicker|fn-period-popover|fn-picker-wrap/);

    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    renderFinancialData(view, populatedPayload());
    expect(view.toolbar.innerHTML).toContain('id="financialAddTransactionBtn"');
    expect(view.toolbar.innerHTML).toContain("Novo lançamento");
  });

  it("renderiza as quatro métricas finais com resultado líquido e ticket de checkouts pagos", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    renderFinancialData(view, populatedPayload());

    expect(view.summary.innerHTML).toContain("Receita do período");
    expect(view.summary.innerHTML).toContain("Despesas do período");
    expect(view.summary.innerHTML).toContain("Resultado líquido");
    expect(view.summary.innerHTML).toContain("R$ 220,00");
    expect(view.summary.innerHTML).toContain("Receitas − despesas");
    expect(view.summary.innerHTML).toContain("Ticket médio pago");
    expect(view.summary.innerHTML).toContain("R$ 150,00");
    expect(view.summary.innerHTML).toContain("2 checkouts pagos");
    expect(view.summary.innerHTML).not.toContain("Saldo de caixa");
    expect(view.summary.innerHTML).not.toContain("Resultado projetado");
    expect(view.summary.innerHTML.indexOf('data-kpi-kind="result"')).toBeLessThan(
      view.summary.innerHTML.indexOf('data-kpi-kind="incoming"'),
    );

    const css = readFileSync("public/styles/finance-surface.css", "utf8");
    expect(css).toMatch(
      /\.fn-kpi\[data-kpi-kind="result"\]\s*\{[\s\S]*?grid-row:\s*2 \/ 4/,
    );
    expect(css).toMatch(
      /\.fn-kpi\[data-kpi-kind="incoming"\],[\s\S]*?\.fn-kpi\[data-kpi-kind="outgoing"\]\s*\{[\s\S]*?grid-column:\s*2/,
    );
  });

  it("mostra diferenças reais e não fabrica percentual quando a base anterior é zero", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const compared = elements();
    renderFinancialData(compared, populatedPayload());

    expect(compared.summary.innerHTML).toContain("+50,0%");
    expect(compared.summary.innerHTML).toContain("+ R$ 100,00");
    expect(compared.summary.innerHTML).toContain("vs.");

    const withoutBase = elements();
    const payload = populatedPayload();
    payload.summary.comparison = {
      grossRevenueDelta: 300,
      expensesDelta: 80,
      netBalanceDelta: 220,
      ticketAverageDelta: 150,
      movementsDelta: 3,
    };
    renderFinancialData(withoutBase, payload);

    expect(withoutBase.summary.innerHTML).toContain("Sem base de comparação");
    expect(withoutBase.summary.innerHTML).not.toContain("0,0%");
  });

  it("exibe variacoes negativas e superiores a 100% sem limitar o percentual", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    const payload = populatedPayload();
    payload.summary.comparison.grossRevenueDelta = 200;
    payload.summary.comparison.expensesDelta = -120;
    renderFinancialData(view, payload);

    expect(view.summary.innerHTML).toContain("+200,0%");
    expect(view.summary.innerHTML).toContain("\u221260,0%");
    expect(view.summary.innerHTML).toContain("\u2212 R$");
  });

  it("usa Movimentações como fallback quando não há ticket pago confiável", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    const payload = populatedPayload();
    payload.summary.summary.ticketAverage = 999;
    payload.summary.summary.paidCheckoutsCount = 0;
    renderFinancialData(view, payload);

    expect(view.summary.innerHTML).toContain('data-kpi-kind="movements"');
    expect(view.summary.innerHTML).toContain("Movimentações");
    expect(view.summary.innerHTML).not.toContain("Ticket médio pago");
  });

  it("mantém métricas zeradas, oculta distribuições e usa um único estado vazio", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();

    renderFinancialData(view, {
      summary: {
        period: {
          start: "2026-07-01T03:00:00.000Z",
          end: "2026-08-01T02:59:59.999Z",
          compareStart: "2026-06-01T03:00:00.000Z",
          compareEnd: "2026-07-01T02:59:59.999Z",
        },
        summary: { paidCheckoutsCount: 0, movementsCount: 0, ticketAverage: 0 },
        cashFlow: { incoming: 0, outgoing: 0, balance: 0 },
        revenueOrigins: { services: 0, products: 0, manual: 0, other: 0 },
        comparison: {
          grossRevenueDelta: 0,
          expensesDelta: 0,
          netBalanceDelta: 0,
          movementsDelta: 0,
        },
      },
      transactions: { transactions: [] },
    });

    expect(view.summary.innerHTML.match(/R\$ 0,00/g)).toHaveLength(3);
    expect(view.summary.innerHTML).toContain('data-kpi-kind="movements"');
    expect(view.cashflow.innerHTML).toBe("");
    expect(view.list.innerHTML.match(/data-empty/g)).toHaveLength(1);
    expect(view.list.innerHTML).toContain('class="fn-empty-period"');
    expect(view.list.innerHTML).toContain("<svg");
    expect(view.list.innerHTML).toContain("Nenhuma movimentação neste período.");
    expect(view.list.innerHTML).toContain("Checkouts pagos e lançamentos manuais");
    expect(view.list.innerHTML).not.toContain("financialEmptyAddBtn");
    expect(view.toolbar.innerHTML.match(/Novo lançamento/g)).toHaveLength(1);
  });

  it("apresenta origem real das receitas com valores, percentuais e Outros apenas quando necessário", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    renderFinancialData(view, populatedPayload());

    expect(view.cashflow.innerHTML).toContain("Origem das receitas");
    expect(view.cashflow.innerHTML).toContain("Serviços");
    expect(view.cashflow.innerHTML).toContain("R$ 150,00");
    expect(view.cashflow.innerHTML).toContain("50,0%");
    expect(view.cashflow.innerHTML).toContain("Produtos");
    expect(view.cashflow.innerHTML).toContain("Lançamentos manuais");
    expect(view.cashflow.innerHTML).not.toContain(">Outros<");
    expect(view.cashflow.innerHTML).toContain('class="fn-origin-composition"');
    expect(view.cashflow.innerHTML.match(/style="--origin-share:/g)).toHaveLength(3);

    const payload = populatedPayload();
    payload.summary.revenueOrigins.other = 25;
    renderFinancialData(view, payload);
    expect(view.cashflow.innerHTML).toContain(">Outros<");
  });

  it("expõe período, quantidade e todos os campos essenciais nas movimentações", () => {
    const { renderFinancialData } = loadFinanceRenderer();
    const view = elements();
    renderFinancialData(view, populatedPayload());

    expect(view.header.innerHTML).toContain("Período analisado");
    expect(view.header.innerHTML).toContain(">3</strong>");
    expect(view.header.innerHTML).toContain("movimentações");
    expect(view.header.innerHTML).not.toContain("op-header-layout");
    expect(view.header.innerHTML).not.toContain("Última atualização");
    expect(view.list.innerHTML).toContain("Origem");
    expect(view.list.innerHTML).toContain("Categoria");
    expect(view.list.innerHTML).toContain("Pagamento");
    expect(view.list.innerHTML).toContain("Atendimento finalizado");
    expect(view.list.innerHTML).toContain("Serviços");
    expect(view.list.innerHTML).toContain("PIX");
    expect(view.list.innerHTML).toContain("+ R$ 300,00");
    expect(view.list.innerHTML).toContain("Entrada");
  });

  it("mantém contratos responsivos sem largura mínima estrutural no mobile", () => {
    const css = readFileSync("public/styles/finance-surface.css", "utf8");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toMatch(/#appContent #financeiroSection \.fn-row-main\s*\{[\s\S]*?grid-template-columns: 62px minmax\(0, 1fr\)/);
    expect(css).toMatch(/#financeiroSection \.fn-row-meta\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/#appContent #financeiroSection #financialSummary\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.fn-kpi\[data-kpi-kind="result"\]\s*\{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?grid-row: 2/);
    expect(css).toMatch(/\.fn-kpi\[data-kpi-kind="incoming"\]\s*\{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 3/);
    expect(css).toMatch(/\.fn-kpi\[data-kpi-kind="outgoing"\]\s*\{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 3/);
    expect(css).not.toMatch(/#financeiroSection[\s\S]{0,80}min-width:\s*[4-9]\d\dpx/);
  });

});
