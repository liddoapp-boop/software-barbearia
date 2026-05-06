import {
  renderEmptyState,
  renderPrimaryAction,
  renderStatusChip,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

const REPORTS = [
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Entradas, saidas, saldo e resultado do periodo.",
    question: "Como foi o resultado financeiro?",
    status: "available",
  },
  {
    id: "atendimentos",
    title: "Atendimentos",
    description: "Volume, status, servicos mais realizados e profissionais mais acionados.",
    question: "Como a operacao de agenda se comportou?",
    status: "available",
  },
  {
    id: "vendas",
    title: "Vendas de produtos",
    description: "Receita, quantidade de vendas, produtos mais vendidos e devolucoes.",
    question: "Quais produtos venderam melhor?",
    status: "available",
  },
  {
    id: "estoque",
    title: "Estoque",
    description: "Itens sem estoque, criticos, abaixo do minimo, movimentos e reposicao.",
    question: "O que precisa ser reposto ou conferido?",
    status: "partial",
  },
  {
    id: "clientes",
    title: "Clientes",
    description: "Ativos, risco, inativos, VIPs e potencial de reativacao.",
    question: "Quais clientes merecem acao comercial?",
    status: "available",
  },
  {
    id: "comissoes",
    title: "Comissoes",
    description: "Pendente, pago no periodo, totais por profissional e impacto financeiro.",
    question: "Quanto ainda precisa ser pago?",
    status: "available",
  },
  {
    id: "profissionais",
    title: "Profissionais",
    description: "Atendimentos, receita, ticket medio, ocupacao e ranking operacional.",
    question: "Quem mais gerou resultado operacional?",
    status: "partial",
  },
  {
    id: "auditoria",
    title: "Auditoria",
    description: "Eventos criticos, alteracoes sensiveis, acoes por usuario e estornos.",
    question: "O que precisa ser conferido com cuidado?",
    status: "partial",
  },
];

const BACKEND_EXPORT_REPORTS = new Set([
  "financeiro",
  "atendimentos",
  "vendas",
  "estoque",
  "clientes",
  "comissoes",
  "profissionais",
  "auditoria",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return toNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function percent(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function statusText(status) {
  return status === "available" ? "Disponivel" : "Parcial";
}

function statusTone(status) {
  return status === "available" ? "PAID" : "WARNING";
}

function isMissing(payload, key) {
  return !payload?.data?.[key];
}

function originLabel(item = {}) {
  const source = String(item.source ?? "").toUpperCase();
  const referenceType = String(item.referenceType ?? "").toUpperCase();
  if (source === "SERVICE" || referenceType === "APPOINTMENT") return "Atendimento finalizado";
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") return "Venda de produto";
  if (source === "COMMISSION" || referenceType === "COMMISSION") return "Comissao paga";
  if (referenceType === "PRODUCT_SALE_REFUND") return "Devolucao de produto";
  if (referenceType === "APPOINTMENT_REFUND") return "Estorno de atendimento";
  if (source === "MANUAL" || referenceType === "MANUAL") return "Lancamento manual";
  if (source === "REFUND") return "Estorno/devolucao";
  return item.type === "EXPENSE" ? "Saida operacional" : "Entrada operacional";
}

function appointmentStatusLabel(status = "") {
  const key = String(status).toUpperCase();
  if (key === "COMPLETED") return "Concluidos";
  if (key === "CONFIRMED") return "Confirmados";
  if (key === "IN_SERVICE") return "Em atendimento";
  if (key === "CANCELLED" || key === "CANCELED") return "Cancelados";
  if (key === "NO_SHOW") return "Faltas";
  if (key === "SCHEDULED") return "Agendados";
  return "Outros";
}

function stockStatus(product = {}) {
  const quantity = toNumber(product.quantity);
  const minimum = toNumber(product.minimumStock);
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (minimum > 0 && quantity <= Math.max(1, Math.floor(minimum / 2))) return "CRITICAL";
  if (product.status === "LOW_STOCK" || (minimum > 0 && quantity <= minimum)) return "LOW_STOCK";
  return "IN_STOCK";
}

function movementLabel(movement = {}) {
  const referenceType = String(movement.referenceType || "").toUpperCase();
  const type = String(movement.movementType || movement.type || "").toUpperCase();
  if (referenceType === "PRODUCT_SALE") return "Saida por venda";
  if (referenceType === "PRODUCT_REFUND" || referenceType === "PRODUCT_SALE_REFUND") return "Entrada por devolucao";
  if (referenceType === "SERVICE_CONSUMPTION") return "Consumo interno";
  if (referenceType === "ADJUSTMENT" || type === "ADJUSTMENT") return "Ajuste manual";
  if (type === "LOSS") return "Perda";
  if (type === "IN") return "Entrada manual";
  if (type === "OUT") return "Saida manual";
  return movement.reason || "Movimentacao operacional";
}

function normalizeCommissions(payload = {}) {
  return (Array.isArray(payload.entries) ? payload.entries : []).map((entry) => ({
    ...entry,
    status: entry.status || "PENDING",
    commissionAmount: toNumber(entry.commissionAmount),
    baseAmount: toNumber(entry.baseAmount),
    occurredAt: entry.occurredAt || entry.createdAt,
  }));
}

function normalizeSales(payload = {}) {
  return Array.isArray(payload.sales) ? payload.sales : [];
}

function groupRows(rows = [], keyFn, seed = {}) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    const current = groups.get(key) || { ...seed, label: key, count: 0, amount: 0, quantity: 0 };
    current.count += 1;
    groups.set(key, current);
  });
  return groups;
}

function renderNotice(message) {
  return `<p class="reports-notice">${escapeHtml(message)}</p>`;
}

function renderKpis(items = []) {
  return `
    <section class="reports-kpi-grid">
      ${items
        .map(
          (item) => `
            <article class="ux-kpi reports-kpi">
              <div class="ux-label">${escapeHtml(item.label)}</div>
              <div class="ux-value-sm ${escapeHtml(item.tone || "")}">${escapeHtml(item.value)}</div>
              ${item.hint ? `<div class="ux-hint">${escapeHtml(item.hint)}</div>` : ""}
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderRows(rows = [], emptyTitle = "Sem detalhes para este periodo.") {
  if (!rows.length) {
    return renderEmptyState({
      title: emptyTitle,
      description: "Ajuste o periodo ou confira se ja existem operacoes registradas para esse recorte.",
    });
  }
  return `
    <section class="reports-detail-list">
      ${rows
        .map(
          (row) => `
            <article class="reports-detail-row">
              <div>
                <strong>${escapeHtml(row.title)}</strong>
                ${row.subtitle ? `<span>${escapeHtml(row.subtitle)}</span>` : ""}
              </div>
              <div class="reports-row-value">
                <strong>${escapeHtml(row.value)}</strong>
                ${row.meta ? `<span>${escapeHtml(row.meta)}</span>` : ""}
              </div>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function getFinancialRows(payload = {}) {
  if (Array.isArray(payload.data?.managementFinancial?.lines)) {
    return payload.data.managementFinancial.lines.map((item) => ({
      title: item.description || item.originLabel || "Lancamento",
      subtitle: `${item.originLabel || "Movimento"} - ${formatDate(item.date)}`,
      value: `${item.type === "EXPENSE" ? "-" : "+"} ${money(item.amount)}`,
      meta: item.category || "Sem categoria",
    }));
  }
  const transactions = Array.isArray(payload.data?.financialTransactions?.transactions)
    ? payload.data.financialTransactions.transactions
    : [];
  return transactions.map((item) => ({
    title: item.description || originLabel(item),
    subtitle: `${originLabel(item)} - ${formatDate(item.date)}`,
    value: `${item.type === "EXPENSE" ? "-" : "+"} ${money(item.amount)}`,
    meta: item.category || "Sem categoria",
  }));
}

function renderFinancial(payload = {}) {
  if (payload.data?.managementFinancial) {
    const report = payload.data.managementFinancial;
    const summary = report.summary || {};
    return {
      complete: report.completeness?.status === "complete",
      html: `
        ${report.completeness?.message ? renderNotice(report.completeness.message) : ""}
        ${renderKpis([
          { label: "Entradas", value: money(summary.totalIncome), hint: "Receitas do periodo", tone: "text-emerald-700" },
          { label: "Saidas", value: money(summary.totalExpense), hint: "Despesas e reversos", tone: "text-rose-700" },
          { label: "Saldo", value: money(summary.balance), hint: "Entradas menos saidas", tone: toNumber(summary.balance) >= 0 ? "text-emerald-700" : "text-rose-700" },
          { label: "Resultado", value: money(summary.periodResult), hint: "Resultado do periodo" },
          { label: "Receita servicos", value: money(summary.serviceRevenue), hint: "Atendimentos finalizados" },
          { label: "Receita produtos", value: money(summary.productRevenue), hint: "Vendas de produtos" },
          { label: "Comissoes pagas", value: money(summary.commissionsPaid), hint: "Baixa financeira de comissao" },
          { label: "Estornos/devolucoes", value: money(summary.refunds), hint: "Reversos encontrados" },
          { label: "Lanc. manuais", value: money(summary.manualEntries), hint: "Entradas ou saidas manuais" },
        ])}
        <details class="reports-detail-panel" open>
          <summary>Detalhes do movimento</summary>
          ${renderRows(getFinancialRows(payload).slice(0, 18), "Nenhum lancamento financeiro encontrado.")}
        </details>
      `,
      rows: getFinancialRows(payload),
    };
  }
  const summary = payload.data?.financialSummary?.summary || {};
  const cashFlow = payload.data?.financialSummary?.cashFlow || {};
  const management = payload.data?.financialManagement?.summary?.current || {};
  const transactions = Array.isArray(payload.data?.financialTransactions?.transactions)
    ? payload.data.financialTransactions.transactions
    : [];
  const commissions = Array.isArray(payload.data?.financialCommissions?.entries)
    ? payload.data.financialCommissions.entries
    : [];
  const commissionPaid = commissions
    .filter((item) => item.status === "PAID")
    .reduce((acc, item) => acc + toNumber(item.commissionAmount), 0);
  const refunds = transactions
    .filter((item) => String(item.referenceType || "").includes("REFUND") || String(item.source || "").toUpperCase() === "REFUND")
    .reduce((acc, item) => acc + toNumber(item.amount), 0);
  const manual = transactions
    .filter((item) => String(item.source || item.referenceType || "").toUpperCase() === "MANUAL")
    .reduce((acc, item) => acc + toNumber(item.amount), 0);

  return {
    complete: !isMissing(payload, "financialSummary") && !isMissing(payload, "financialTransactions"),
    html: `
      ${isMissing(payload, "financialTransactions") ? renderNotice("Relatorio parcial com base nos dados financeiros disponiveis.") : ""}
      ${renderKpis([
        { label: "Entradas", value: money(cashFlow.incoming), hint: "Receitas do periodo", tone: "text-emerald-700" },
        { label: "Saidas", value: money(cashFlow.outgoing), hint: "Despesas e reversos", tone: "text-rose-700" },
        { label: "Saldo", value: money(cashFlow.balance), hint: "Entradas menos saidas", tone: toNumber(cashFlow.balance) >= 0 ? "text-emerald-700" : "text-rose-700" },
        { label: "Resultado", value: money(summary.estimatedProfit ?? cashFlow.balance), hint: "Resultado estimado" },
        { label: "Receita servicos", value: money(management.serviceRevenue), hint: "Atendimentos finalizados" },
        { label: "Receita produtos", value: money(management.productRevenue), hint: "Vendas de produtos" },
        { label: "Comissoes pagas", value: money(commissionPaid), hint: "Baixa financeira de comissao" },
        { label: "Estornos/devolucoes", value: money(refunds), hint: "Reversos encontrados" },
        { label: "Lanc. manuais", value: money(manual), hint: "Entradas ou saidas manuais" },
      ])}
      <details class="reports-detail-panel" open>
        <summary>Detalhes do movimento</summary>
        ${renderRows(getFinancialRows(payload).slice(0, 18), "Nenhum lancamento financeiro encontrado.")}
      </details>
    `,
    rows: getFinancialRows(payload),
  };
}

function getAppointmentRows(payload = {}) {
  if (Array.isArray(payload.data?.managementAppointments?.appointments)) {
    return payload.data.managementAppointments.appointments.map((item) => ({
      title: item.serviceName || "Atendimento",
      subtitle: `${item.clientName || "Cliente"} - ${formatDate(item.startsAt)}`,
      value: appointmentStatusLabel(item.status),
      meta: item.professionalName || "Profissional",
    }));
  }
  const appointments = Array.isArray(payload.data?.appointments?.appointments)
    ? payload.data.appointments.appointments
    : [];
  return appointments.map((item) => ({
    title: item.serviceName || item.service || "Atendimento",
    subtitle: `${item.clientName || item.client || "Cliente"} - ${formatDate(item.startsAt)}`,
    value: appointmentStatusLabel(item.status),
    meta: item.professionalName || item.professional || "Profissional",
  }));
}

function renderAppointments(payload = {}) {
  if (payload.data?.managementAppointments) {
    const report = payload.data.managementAppointments;
    const summary = report.summary || {};
    const topServices = Array.isArray(report.topServices) ? report.topServices : [];
    const topProfessionals = Array.isArray(report.topProfessionals) ? report.topProfessionals : [];
    const rows = getAppointmentRows(payload);
    return {
      complete: report.completeness?.status === "complete",
      html: `
        ${report.completeness?.message ? renderNotice(report.completeness.message) : ""}
        ${renderKpis([
          { label: "Agendamentos", value: String(toNumber(summary.total)), hint: "Total no periodo" },
          { label: "Concluidos", value: String(toNumber(summary.completed)), hint: "Atendimentos finalizados", tone: "text-emerald-700" },
          { label: "Confirmados", value: String(toNumber(summary.confirmed)), hint: "Prontos para executar" },
          { label: "Em atendimento", value: String(toNumber(summary.inService)), hint: "Em andamento" },
          { label: "Cancelados", value: String(toNumber(summary.cancelled)), hint: "Cancelamentos" },
          { label: "Faltas", value: String(toNumber(summary.noShow)), hint: "Nao comparecimentos", tone: "text-rose-700" },
          { label: "Receita realizada", value: money(summary.realizedRevenue), hint: "Atendimentos concluidos" },
        ])}
        <section class="reports-split">
          <details class="reports-detail-panel" open><summary>Servicos mais realizados</summary>${renderRows(topServices.map((item) => ({ title: item.serviceName, value: `${item.count} atend.`, meta: money(item.revenue) })), "Sem servicos no periodo.")}</details>
          <details class="reports-detail-panel" open><summary>Profissionais com mais atendimentos</summary>${renderRows(topProfessionals.map((item) => ({ title: item.professionalName, value: `${item.count} atend.`, meta: money(item.revenue) })), "Sem profissionais no periodo.")}</details>
        </section>
      `,
      rows,
    };
  }
  const rows = getAppointmentRows(payload);
  const countByStatus = rows.reduce((acc, row) => {
    acc[row.value] = (acc[row.value] || 0) + 1;
    return acc;
  }, {});
  const appointments = Array.isArray(payload.data?.appointments?.appointments)
    ? payload.data.appointments.appointments
    : [];
  const byService = groupRows(appointments, (item) => item.serviceName || item.service || "Servico");
  const byProfessional = groupRows(appointments, (item) => item.professionalName || item.professional || "Profissional");
  const topServices = Array.from(byService.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  const topProfessionals = Array.from(byProfessional.values()).sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    complete: !isMissing(payload, "appointments"),
    html: `
      ${isMissing(payload, "appointments") ? renderNotice("Este relatorio depende de evolucao futura do backend ou de dados de agenda carregaveis no periodo.") : ""}
      ${renderKpis([
        { label: "Agendamentos", value: String(rows.length), hint: "Total no periodo" },
        { label: "Concluidos", value: String(countByStatus.Concluidos || 0), hint: "Atendimentos finalizados", tone: "text-emerald-700" },
        { label: "Confirmados", value: String(countByStatus.Confirmados || 0), hint: "Prontos para executar" },
        { label: "Em atendimento", value: String(countByStatus["Em atendimento"] || 0), hint: "Em andamento" },
        { label: "Cancelados", value: String(countByStatus.Cancelados || 0), hint: "Cancelamentos" },
        { label: "Faltas", value: String(countByStatus.Faltas || 0), hint: "Nao comparecimentos", tone: "text-rose-700" },
      ])}
      <section class="reports-split">
        <details class="reports-detail-panel" open><summary>Servicos mais realizados</summary>${renderRows(topServices.map((item) => ({ title: item.label, value: `${item.count} atend.`, meta: "Volume no periodo" })), "Sem servicos no periodo.")}</details>
        <details class="reports-detail-panel" open><summary>Profissionais com mais atendimentos</summary>${renderRows(topProfessionals.map((item) => ({ title: item.label, value: `${item.count} atend.`, meta: "Volume no periodo" })), "Sem profissionais no periodo.")}</details>
      </section>
    `,
    rows,
  };
}

function getProductRows(payload = {}) {
  if (Array.isArray(payload.data?.managementProductSales?.topProducts)) {
    return payload.data.managementProductSales.topProducts.map((item) => ({
      title: item.productName || "Produto",
      subtitle: "Produto vendido no periodo",
      value: money(item.revenue),
      meta: `${toNumber(item.quantitySold)} vendidos, ${toNumber(item.refundedQuantity)} devolvidos`,
      quantity: toNumber(item.quantitySold),
      refunded: toNumber(item.refundedQuantity),
      amount: toNumber(item.revenue),
    }));
  }
  return normalizeSales(payload.data?.productSales).flatMap((sale) =>
    (Array.isArray(sale.items) ? sale.items : []).map((item) => ({
      title: item.productName || "Produto",
      subtitle: `${sale.clientName || "Cliente nao vinculado"} - ${formatDate(sale.soldAt || sale.createdAt)}`,
      value: money(toNumber(item.unitPrice) * toNumber(item.quantity)),
      meta: `${toNumber(item.quantity)} vendidos, ${toNumber(item.refundedQuantity)} devolvidos`,
      quantity: toNumber(item.quantity),
      refunded: toNumber(item.refundedQuantity),
      amount: toNumber(item.unitPrice) * toNumber(item.quantity),
    })),
  );
}

function renderProductSales(payload = {}) {
  if (payload.data?.managementProductSales) {
    const report = payload.data.managementProductSales;
    const summary = report.summary || {};
    const rows = getProductRows(payload);
    return {
      complete: report.completeness?.status === "complete",
      html: `
        ${report.completeness?.message ? renderNotice(report.completeness.message) : ""}
        ${renderKpis([
          { label: "Total vendido", value: money(summary.totalSold), hint: "Receita bruta de produtos", tone: "text-emerald-700" },
          { label: "Vendas", value: String(toNumber(summary.salesCount)), hint: "Cupons de produto" },
          { label: "Devolucoes", value: money(summary.refundedAmount), hint: "Produtos devolvidos", tone: toNumber(summary.refundedAmount) ? "text-rose-700" : "" },
          { label: "Receita produtos", value: money(summary.productRevenue), hint: "Receita liquida simples" },
          { label: "Ticket medio", value: money(summary.averageProductTicket), hint: "Por venda de produto" },
        ])}
        <details class="reports-detail-panel" open>
          <summary>Produtos mais vendidos</summary>
          ${renderRows(rows.map((item) => ({ title: item.title, value: `${item.quantity} un.`, meta: item.value, subtitle: item.refunded ? `${item.refunded} devolvido(s)` : "" })), "Sem produtos vendidos no periodo.")}
        </details>
      `,
      rows,
    };
  }
  const sales = normalizeSales(payload.data?.productSales);
  const rows = getProductRows(payload);
  const revenue = sales.reduce((acc, sale) => acc + toNumber(sale.grossAmount), 0);
  const refunds = sales.reduce((acc, sale) => acc + toNumber(sale.totalRefundedAmount), 0);
  const byProduct = new Map();
  rows.forEach((row) => {
    const current = byProduct.get(row.title) || { title: row.title, quantity: 0, amount: 0, refunded: 0 };
    current.quantity += row.quantity;
    current.amount += row.amount;
    current.refunded += row.refunded;
    byProduct.set(row.title, current);
  });
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 8);

  return {
    complete: !isMissing(payload, "productSales"),
    html: `
      ${isMissing(payload, "productSales") ? renderNotice("Relatorio parcial com base nas vendas de produto disponiveis.") : ""}
      ${renderKpis([
        { label: "Total vendido", value: money(revenue), hint: "Receita bruta de produtos", tone: "text-emerald-700" },
        { label: "Vendas", value: String(sales.length), hint: "Cupons de produto" },
        { label: "Devolucoes", value: money(refunds), hint: "Produtos devolvidos", tone: refunds ? "text-rose-700" : "" },
        { label: "Receita produtos", value: money(revenue - refunds), hint: "Receita liquida simples" },
        { label: "Ticket medio", value: money(sales.length ? revenue / sales.length : 0), hint: "Por venda de produto" },
      ])}
      <details class="reports-detail-panel" open>
        <summary>Produtos mais vendidos</summary>
        ${renderRows(topProducts.map((item) => ({ title: item.title, value: `${item.quantity} un.`, meta: money(item.amount), subtitle: item.refunded ? `${item.refunded} devolvido(s)` : "" })), "Sem produtos vendidos no periodo.")}
      </details>
    `,
    rows,
  };
}

function getStockRows(payload = {}) {
  if (payload.data?.managementStock?.alerts) {
    const alerts = payload.data.managementStock.alerts;
    return [...(alerts.noStock || []), ...(alerts.critical || []), ...(alerts.belowMinimum || [])]
      .map((item) => ({
        title: item.name || item.productName || "Produto",
        subtitle: item.category || "Sem categoria",
        value: stockStatus(item) === "OUT_OF_STOCK" ? "Sem estoque" : stockStatus(item) === "CRITICAL" ? "Critico" : "Abaixo do minimo",
        meta: `Atual ${toNumber(item.quantity)} / minimo ${toNumber(item.minimumStock)}`,
      }));
  }
  const products = Array.isArray(payload.data?.stock?.products) ? payload.data.stock.products : [];
  return products
    .filter((item) => stockStatus(item) !== "IN_STOCK")
    .map((item) => ({
      title: item.name || "Produto",
      subtitle: item.category || "Sem categoria",
      value: stockStatus(item) === "OUT_OF_STOCK" ? "Sem estoque" : stockStatus(item) === "CRITICAL" ? "Critico" : "Abaixo do minimo",
      meta: `Atual ${toNumber(item.quantity)} / minimo ${toNumber(item.minimumStock)}`,
    }));
}

function renderStock(payload = {}) {
  if (payload.data?.managementStock) {
    const stock = payload.data.managementStock;
    const summary = stock.summary || {};
    const movements = Array.isArray(stock.movements) ? stock.movements : [];
    const suggestions = Array.isArray(stock.replenishmentSuggestions) ? stock.replenishmentSuggestions : [];
    return {
      complete: stock.completeness?.status === "complete",
      html: `
        ${stock.completeness?.message ? renderNotice(stock.completeness.message) : ""}
        ${renderKpis([
          { label: "Sem estoque", value: String(toNumber(summary.noStock)), hint: "Produtos zerados", tone: toNumber(summary.noStock) ? "text-rose-700" : "" },
          { label: "Criticos", value: String(toNumber(summary.critical)), hint: "Abaixo da metade do minimo", tone: toNumber(summary.critical) ? "text-rose-700" : "" },
          { label: "Abaixo do minimo", value: String(toNumber(summary.belowMinimum)), hint: "Reposicao planejada", tone: toNumber(summary.belowMinimum) ? "text-amber-700" : "" },
          { label: "Entradas", value: String(toNumber(summary.inMovements)), hint: "No periodo" },
          { label: "Saidas", value: String(toNumber(summary.outMovements)), hint: "No periodo" },
          { label: "Reposicao sugerida", value: String(suggestions.length), hint: "Base atual" },
        ])}
        <section class="reports-split">
          <details class="reports-detail-panel" open><summary>Produtos para acao</summary>${renderRows(getStockRows(payload), "Sem produto critico no estoque atual.")}</details>
          <details class="reports-detail-panel"><summary>Movimentacoes humanizadas</summary>${renderRows(movements.slice(0, 12).map((item) => ({ title: item.label || movementLabel(item), subtitle: formatDate(item.occurredAt), value: `${toNumber(item.quantity)} un.`, meta: item.productName || "Estoque" })), "Sem movimentacoes no periodo.")}</details>
        </section>
      `,
      rows: getStockRows(payload),
    };
  }
  const stock = payload.data?.stock || {};
  const products = Array.isArray(stock.products) ? stock.products : [];
  const movements = [...(Array.isArray(stock.recentMovements) ? stock.recentMovements : []), ...(Array.isArray(stock.logs) ? stock.logs : [])];
  const suggestions = Array.isArray(stock.replenishmentSuggestions) ? stock.replenishmentSuggestions : [];
  const out = products.filter((item) => stockStatus(item) === "OUT_OF_STOCK").length;
  const critical = products.filter((item) => stockStatus(item) === "CRITICAL").length;
  const low = products.filter((item) => stockStatus(item) === "LOW_STOCK").length;
  const inMovements = movements.filter((item) => String(item.movementType || item.type).toUpperCase() === "IN").length;
  const outMovements = movements.filter((item) => String(item.movementType || item.type).toUpperCase() !== "IN").length;

  return {
    complete: false,
    html: `
      ${renderNotice("Relatorio parcial com base no estoque atual e nas movimentacoes recentes disponiveis. O recorte historico completo depende de evolucao futura do backend.")}
      ${renderKpis([
        { label: "Sem estoque", value: String(out), hint: "Produtos zerados", tone: out ? "text-rose-700" : "" },
        { label: "Criticos", value: String(critical), hint: "Abaixo da metade do minimo", tone: critical ? "text-rose-700" : "" },
        { label: "Abaixo do minimo", value: String(low), hint: "Reposicao planejada", tone: low ? "text-amber-700" : "" },
        { label: "Entradas", value: String(inMovements), hint: "Movimentacoes recentes" },
        { label: "Saidas", value: String(outMovements), hint: "Venda, consumo ou ajuste" },
        { label: "Reposicao sugerida", value: String(suggestions.length), hint: "Base atual" },
      ])}
      <section class="reports-split">
        <details class="reports-detail-panel" open><summary>Produtos para acao</summary>${renderRows(getStockRows(payload), "Sem produto critico no estoque atual.")}</details>
        <details class="reports-detail-panel"><summary>Movimentacoes humanizadas</summary>${renderRows(movements.slice(0, 12).map((item) => ({ title: movementLabel(item), subtitle: formatDate(item.occurredAt || item.createdAt), value: `${toNumber(item.quantity)} un.`, meta: item.productName || item.reason || "Estoque" })), "Sem movimentacoes recentes disponiveis.")}</details>
      </section>
    `,
    rows: getStockRows(payload),
  };
}

function renderClients(payload = {}) {
  const summary = payload.data?.clients?.summary || {};
  const clients = Array.isArray(payload.data?.clients?.clients) ? payload.data.clients.clients : [];
  const queue = Array.isArray(payload.data?.clients?.reactivationQueue) ? payload.data.clients.reactivationQueue : [];
  const actionRows = [...queue, ...clients.filter((item) => ["AT_RISK", "INACTIVE", "VIP"].includes(String(item.status).toUpperCase()))]
    .filter((item, index, list) => list.findIndex((candidate) => (candidate.clientId || candidate.id || candidate.fullName) === (item.clientId || item.id || item.fullName)) === index)
    .slice(0, 12)
    .map((item) => ({
      title: item.fullName || "Cliente",
      subtitle: item.status === "VIP" ? "VIP" : item.status === "INACTIVE" ? "Inativo" : "Merece contato",
      value: money(item.ltv || item.revenue || 0),
      meta: item.recommendedAction || "Acao comercial manual",
    }));

  return {
    complete: !isMissing(payload, "clients"),
    html: `
      ${isMissing(payload, "clients") ? renderNotice("Relatorio parcial com base nos dados de clientes disponiveis.") : ""}
      ${renderKpis([
        { label: "Ativos", value: String(toNumber(summary.active)), hint: "Carteira ativa", tone: "text-emerald-700" },
        { label: "Em risco", value: String(toNumber(summary.atRisk)), hint: "Precisam retorno", tone: "text-amber-700" },
        { label: "Inativos", value: String(toNumber(summary.inactive)), hint: "Reativacao possivel" },
        { label: "VIPs", value: String(toNumber(summary.vip)), hint: "Maior valor", tone: "text-indigo-700" },
        { label: "Potencial", value: money(summary.potentialReactivationRevenue), hint: "Reativacao estimada" },
        { label: "Ticket medio", value: money(summary.averageTicket), hint: "Quando disponivel" },
      ])}
      <details class="reports-detail-panel" open>
        <summary>Clientes que merecem acao comercial</summary>
        ${renderRows(actionRows, "Nenhum cliente prioritario neste periodo.")}
      </details>
    `,
    rows: actionRows,
  };
}

function renderCommissions(payload = {}) {
  const entries = normalizeCommissions(payload.data?.financialCommissions);
  const pending = entries.filter((item) => item.status === "PENDING");
  const paid = entries.filter((item) => item.status === "PAID");
  const byProfessional = new Map();
  entries.forEach((item) => {
    const key = item.professionalName || "Profissional";
    const current = byProfessional.get(key) || { title: key, pending: 0, paid: 0, total: 0, count: 0 };
    current.count += 1;
    current.total += item.commissionAmount;
    if (item.status === "PENDING") current.pending += item.commissionAmount;
    if (item.status === "PAID") current.paid += item.commissionAmount;
    byProfessional.set(key, current);
  });
  const rows = Array.from(byProfessional.values())
    .sort((a, b) => b.pending - a.pending || b.total - a.total)
    .map((item) => ({
      title: item.title,
      subtitle: `${item.count} comissao(oes)`,
      value: money(item.pending),
      meta: `Pago ${money(item.paid)} | Total ${money(item.total)}`,
    }));
  const old = pending.filter((item) => {
    const date = new Date(item.occurredAt);
    return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() >= 7 * 86_400_000;
  });

  return {
    complete: !isMissing(payload, "financialCommissions"),
    html: `
      ${isMissing(payload, "financialCommissions") ? renderNotice("Relatorio parcial com base nas comissoes disponiveis.") : ""}
      ${renderKpis([
        { label: "Pendente", value: money(pending.reduce((acc, item) => acc + item.commissionAmount, 0)), hint: "Pagamento no modulo Comissoes", tone: "text-amber-700" },
        { label: "Pago no periodo", value: money(paid.reduce((acc, item) => acc + item.commissionAmount, 0)), hint: "Impacto financeiro", tone: "text-emerald-700" },
        { label: "Profissionais", value: String(byProfessional.size), hint: "Comissao gerada" },
        { label: "Comissoes antigas", value: String(old.length), hint: "Pendentes ha 7 dias ou mais", tone: old.length ? "text-rose-700" : "" },
      ])}
      <details class="reports-detail-panel" open>
        <summary>Total por profissional</summary>
        ${renderRows(rows, "Nenhuma comissao encontrada no periodo.")}
      </details>
    `,
    rows,
  };
}

function renderProfessionals(payload = {}) {
  if (payload.data?.managementProfessionals) {
    const report = payload.data.managementProfessionals;
    const summary = report.summary || {};
    const professionals = Array.isArray(report.professionals) ? report.professionals : [];
    const rows = professionals.map((item) => ({
      title: item.professionalName || "Profissional",
      subtitle: `Ticket ${money(item.averageTicket)} | Ocupacao estimada ${item.occupancyRate == null ? "nao calculada" : percent(item.occupancyRate)}`,
      value: money(item.totalRevenue),
      meta: `${toNumber(item.completedAppointments)} atend. | Comissao pendente ${money(item.pendingCommission)}`,
    }));
    return {
      complete: report.completeness?.status === "complete",
      html: `
        ${report.completeness?.message ? renderNotice(report.completeness.message) : ""}
        ${renderNotice("Ocupacao estimada: baseada nos atendimentos disponiveis no periodo. O calculo completo depende de grade historica de disponibilidade.")}
        ${renderKpis([
          { label: "Profissionais", value: String(toNumber(summary.professionals)), hint: "No recorte" },
          { label: "Atendimentos concluidos", value: String(toNumber(summary.completedAppointments)), hint: "No periodo" },
          { label: "Receita gerada", value: money(summary.totalRevenue), hint: "Soma operacional" },
          { label: "Comissao pendente", value: money(summary.pendingCommission), hint: "A pagar" },
          { label: "Comissao paga", value: money(summary.paidCommission), hint: "Baixada no periodo" },
        ])}
        <details class="reports-detail-panel" open>
          <summary>Ranking operacional</summary>
          ${renderRows(rows, "Sem desempenho de profissionais disponivel.")}
        </details>
      `,
      rows,
    };
  }
  const professionals = Array.isArray(payload.data?.professionals?.professionals)
    ? payload.data.professionals.professionals
    : [];
  const rows = professionals
    .map((item) => ({
      title: item.professionalName || item.name || "Profissional",
      subtitle: `Ticket ${money(item.averageTicket || item.ticketAverage || 0)} | Ocupacao estimada ${percent(item.occupancyRate || item.occupancyPct || 0)}`,
      value: money(item.revenue || item.grossRevenue || item.totalRevenue || 0),
      meta: `${toNumber(item.completedAppointments || item.appointmentsCompleted || item.appointments)} atend. | Comissao pendente ${money(item.pendingCommission || 0)}`,
    }))
    .sort((a, b) => toNumber(String(b.value).replace(/\D/g, "")) - toNumber(String(a.value).replace(/\D/g, "")));

  return {
    complete: !isMissing(payload, "professionals"),
    html: `
      ${renderNotice("Relatorio parcial: ocupacao estimada baseada nos atendimentos disponiveis no periodo. O calculo completo depende de grade historica de disponibilidade.")}
      ${renderKpis([
        { label: "Profissionais", value: String(professionals.length), hint: "No recorte" },
        { label: "Atendimentos concluidos", value: String(professionals.reduce((acc, item) => acc + toNumber(item.completedAppointments || item.appointmentsCompleted), 0)), hint: "Quando disponivel" },
        { label: "Receita gerada", value: money(professionals.reduce((acc, item) => acc + toNumber(item.revenue || item.grossRevenue || item.totalRevenue), 0)), hint: "Soma operacional" },
        { label: "Comissao pendente", value: money(professionals.reduce((acc, item) => acc + toNumber(item.pendingCommission), 0)), hint: "Quando disponivel" },
      ])}
      <details class="reports-detail-panel" open>
        <summary>Ranking operacional</summary>
        ${renderRows(rows, "Sem desempenho de profissionais disponivel.")}
      </details>
    `,
    rows,
  };
}

function renderAudit(payload = {}) {
  if (payload.data?.managementAudit) {
    const report = payload.data.managementAudit;
    const summary = report.summary || {};
    const events = Array.isArray(report.events) ? report.events : [];
    const byActor = Array.isArray(report.byActor) ? report.byActor : [];
    const operationRows = events.slice(0, 12).map((event) => ({
      title: String(event.action || "Acao").replace(/[_-]+/g, " ").toLowerCase(),
      subtitle: `${String(event.entity || "operacao").replace(/[_-]+/g, " ")} - ${formatDate(event.createdAt)}`,
      value: event.actor || event.actorRole || "Usuario",
      meta: "Ver detalhe tecnico em Auditoria",
    }));
    return {
      complete: report.completeness?.status === "complete",
      html: `
        ${report.completeness?.message ? renderNotice(report.completeness.message) : ""}
        ${renderKpis([
          { label: "Eventos", value: String(toNumber(summary.totalEvents)), hint: "No periodo" },
          { label: "Criticos", value: String(toNumber(summary.criticalEvents)), hint: "Exigem conferencia", tone: toNumber(summary.criticalEvents) ? "text-rose-700" : "" },
          { label: "Alteracoes sensiveis", value: String(toNumber(summary.sensitiveActions)), hint: "Resumo operacional" },
          { label: "Estornos/devolucoes", value: String(toNumber(summary.refunds)), hint: "Operacoes reversas" },
        ])}
        <section class="reports-split">
          <details class="reports-detail-panel" open><summary>Operacoes sensiveis</summary>${renderRows(operationRows, "Sem evento critico no periodo.")}</details>
          <details class="reports-detail-panel"><summary>Acoes por usuario</summary>${renderRows(byActor.map((item) => ({ title: item.actor, value: `${item.count} acao(oes)`, meta: "Auditoria resumida" })), "Sem acoes por usuario no periodo.")}</details>
        </section>
      `,
      rows: [...operationRows, ...byActor.map((item) => ({ title: item.actor, value: `${item.count} acao(oes)`, meta: "Auditoria resumida" }))],
    };
  }
  const events = Array.isArray(payload.data?.audit?.events) ? payload.data.audit.events : [];
  const criticalTokens = ["refund", "estorno", "delete", "cancel", "blocked", "failed", "permission"];
  const critical = events.filter((event) => criticalTokens.some((token) => `${event.action} ${event.entity} ${event.route}`.toLowerCase().includes(token)));
  const byActor = Array.from(groupRows(events, (event) => event.actorEmail || event.actorRole || "Usuario").values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({ title: item.label, value: `${item.count} acao(oes)`, meta: "Auditoria resumida" }));
  const operationRows = critical.slice(0, 12).map((event) => ({
    title: String(event.action || "Acao").replace(/[_-]+/g, " ").toLowerCase(),
    subtitle: `${String(event.entity || "operacao").replace(/[_-]+/g, " ")} - ${formatDate(event.createdAt)}`,
    value: event.actorEmail || event.actorRole || "Usuario",
    meta: "Ver detalhe tecnico em Auditoria",
  }));

  return {
    complete: false,
    html: `
      ${renderNotice("Relatorio parcial e resumido. O detalhe tecnico completo permanece na tela Auditoria.")}
      ${renderKpis([
        { label: "Eventos", value: String(events.length), hint: "No periodo" },
        { label: "Criticos", value: String(critical.length), hint: "Exigem conferencia", tone: critical.length ? "text-rose-700" : "" },
        { label: "Alteracoes sensiveis", value: String(critical.filter((item) => String(item.action || "").toLowerCase().includes("delete") || String(item.action || "").toLowerCase().includes("update")).length), hint: "Resumo operacional" },
        { label: "Estornos/devolucoes", value: String(critical.filter((item) => `${item.action} ${item.entity}`.toLowerCase().includes("refund")).length), hint: "Operacoes reversas" },
      ])}
      <section class="reports-split">
        <details class="reports-detail-panel" open><summary>Operacoes sensiveis</summary>${renderRows(operationRows, "Sem evento critico no periodo.")}</details>
        <details class="reports-detail-panel"><summary>Acoes por usuario</summary>${renderRows(byActor, "Sem acoes por usuario no periodo.")}</details>
      </section>
    `,
    rows: [...operationRows, ...byActor],
  };
}

function buildReport(payload, id) {
  const renderers = {
    financeiro: renderFinancial,
    atendimentos: renderAppointments,
    vendas: renderProductSales,
    estoque: renderStock,
    clientes: renderClients,
    comissoes: renderCommissions,
    profissionais: renderProfessionals,
    auditoria: renderAudit,
  };
  return (renderers[id] || renderFinancial)(payload);
}

function renderHubCard(report, activeId) {
  const active = report.id === activeId;
  return `
    <article class="reports-hub-card ${active ? "is-active" : ""}">
      <div class="reports-card-head">
        <div>
          <h3>${escapeHtml(report.title)}</h3>
          <p>${escapeHtml(report.description)}</p>
        </div>
        ${renderStatusChip(statusTone(report.status), { label: statusText(report.status) })}
      </div>
      <div class="reports-question">
        <span>Pergunta</span>
        <strong>${escapeHtml(report.question)}</strong>
      </div>
      <button type="button" class="op-action op-action-primary" data-report-open="${escapeHtml(report.id)}">
        Abrir relatorio
      </button>
    </article>
  `;
}

function renderHub(activeReportId) {
  return `
    <section class="reports-hub-grid">
      ${REPORTS.map((report) => renderHubCard(report, activeReportId)).join("")}
    </section>
  `;
}

export function renderReportsLoading(elements = {}) {
  if (elements.feedback) elements.feedback.innerHTML = "";
  if (elements.root) renderPanelMessage(elements.root, "Carregando hub de relatorios operacionais...");
}

export function renderReportsError(elements = {}, message = "Nao foi possivel carregar relatorios.") {
  if (elements.feedback) elements.feedback.innerHTML = "";
  if (elements.root) renderPanelMessage(elements.root, message, "error");
}

export function renderReportsData(elements = {}, payload = {}, options = {}) {
  if (!elements.root) return;
  const activeReportId = options.activeReportId || "financeiro";
  const reportMeta = REPORTS.find((item) => item.id === activeReportId) || REPORTS[0];
  const report = buildReport(payload || {}, reportMeta.id);
  const canExport = BACKEND_EXPORT_REPORTS.has(reportMeta.id) || Boolean(report.rows?.length);
  const errors = Object.values(payload?.errors || {});
  if (elements.feedback) {
    elements.feedback.innerHTML = errors.length
      ? renderNotice("Algumas fontes nao responderam. Os relatorios afetados mostram estado parcial honesto.")
      : "";
  }
  elements.root.innerHTML = `
    <section class="reports-period-strip">
      <div>
        <span>Periodo analisado</span>
        <strong>${escapeHtml(payload?.period?.label || "Periodo selecionado")}</strong>
      </div>
      <div>
        <span>Fluxo</span>
        <strong>Escolher relatorio -> revisar resumo -> conferir detalhes -> exportar CSV</strong>
      </div>
    </section>
    ${renderHub(activeReportId)}
    <section class="reports-active-panel">
      <header class="reports-active-header">
        <div>
          <p class="ux-label">Relatorio aberto</p>
          <h2>${escapeHtml(reportMeta.title)}</h2>
          <p>${escapeHtml(reportMeta.question)}</p>
        </div>
        <div class="reports-active-actions">
          ${renderStatusChip(report.complete ? "PAID" : "WARNING", {
            label: report.complete ? "Disponivel" : "Parcial",
          })}
          ${renderPrimaryAction({
            label: canExport ? "Baixar CSV" : "Exportacao em breve",
            disabled: !canExport,
            variant: canExport ? "primary" : "secondary",
            attrs: { "data-report-export": reportMeta.id },
          })}
        </div>
      </header>
      ${report.html}
    </section>
  `;
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function exportReportCsv(payload = {}, reportId = "financeiro") {
  const reportMeta = REPORTS.find((item) => item.id === reportId) || REPORTS[0];
  const report = buildReport(payload, reportMeta.id);
  const rows = Array.isArray(report.rows) ? report.rows : [];
  if (!rows.length) return;
  const header = ["Relatorio", "Titulo", "Descricao", "Valor", "Observacao"];
  const body = rows.map((row) => [
    reportMeta.title,
    row.title || "",
    row.subtitle || "",
    row.value || "",
    row.meta || "",
  ]);
  const csv = [header, ...body].map((line) => line.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `relatorio-${reportMeta.id}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
