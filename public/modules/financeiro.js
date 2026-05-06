import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Number(toNumber(value)).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function parseRelatedId(notes = "", key = "") {
  const match = String(notes || "").match(new RegExp(`${key}=([^;\\s]+)`));
  return match?.[1] || "";
}

function isExpense(item = {}) {
  return item.type === "EXPENSE";
}

function typeLabel(type) {
  return type === "EXPENSE" ? "Saida" : "Entrada";
}

function typeStatus(type) {
  return type === "EXPENSE" ? "PENDING" : "PAID";
}

function originLabel(item = {}) {
  const source = String(item.source ?? "").toUpperCase();
  const referenceType = String(item.referenceType ?? "").toUpperCase();

  if (source === "SERVICE" || referenceType === "APPOINTMENT") return "Atendimento finalizado";
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") return "Venda de produto";
  if (source === "COMMISSION" || referenceType === "COMMISSION") return "Comissao paga";
  if (referenceType === "APPOINTMENT_REFUND") return "Estorno de atendimento";
  if (referenceType === "PRODUCT_SALE_REFUND") return "Devolucao de produto";
  if (source === "MANUAL" || referenceType === "MANUAL") return "Lancamento manual";
  if (source === "REFUND") return "Reverso financeiro";

  return isExpense(item) ? "Despesa operacional" : "Entrada operacional";
}

function impactMessage(item = {}) {
  const source = String(item.source ?? "").toUpperCase();
  const referenceType = String(item.referenceType ?? "").toUpperCase();

  if (source === "SERVICE" || referenceType === "APPOINTMENT") {
    return "Este lancamento foi gerado ao finalizar um atendimento.";
  }
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") {
    return "Este lancamento foi gerado por uma venda de produto.";
  }
  if (referenceType === "APPOINTMENT_REFUND") {
    return "Este lancamento reverte um estorno de atendimento.";
  }
  if (referenceType === "PRODUCT_SALE_REFUND") {
    return "Este lancamento reverte uma devolucao.";
  }
  if (source === "COMMISSION" || referenceType === "COMMISSION") {
    return "Este lancamento registra o pagamento de comissao.";
  }
  if (source === "MANUAL" || referenceType === "MANUAL") {
    return "Este lancamento foi criado manualmente.";
  }
  return "Este lancamento compoe o resultado operacional do periodo.";
}

function originRank(item = {}) {
  const referenceType = String(item.referenceType ?? "").toUpperCase();
  const source = String(item.source ?? "").toUpperCase();
  if (referenceType.includes("REFUND") || source === "REFUND") return 4;
  if (source === "COMMISSION" || referenceType === "COMMISSION") return 3;
  if (source === "SERVICE" || referenceType === "APPOINTMENT") return 2;
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") return 1;
  return 0;
}

function summarizeOrigins(transactions = []) {
  const grouped = new Map();
  transactions.forEach((item) => {
    const label = originLabel(item);
    const current = grouped.get(label) || { label, amount: 0, count: 0, rank: originRank(item) };
    current.amount += toNumber(item.amount);
    current.count += 1;
    current.rank = Math.max(current.rank, originRank(item));
    grouped.set(label, current);
  });
  return Array.from(grouped.values())
    .sort((a, b) => b.rank - a.rank || b.amount - a.amount)
    .slice(0, 4);
}

function renderCard(title, value, tone = "", subtitle = "") {
  return `
    <article class="ux-kpi finance-kpi">
      <div class="ux-label">${escapeHtml(title)}</div>
      <div class="ux-value-sm ${tone}">${escapeHtml(value)}</div>
      ${subtitle ? `<div class="ux-hint">${escapeHtml(subtitle)}</div>` : ""}
    </article>
  `;
}

function renderOriginStrip(transactions = []) {
  const origins = summarizeOrigins(transactions);
  if (!origins.length) return "";
  return `
    <article class="finance-origin-strip">
      <div>
        <p class="ux-label">Principais origens</p>
        <p class="finance-origin-title">De onde veio o movimento do periodo</p>
      </div>
      <div class="finance-origin-list">
        ${origins
          .map(
            (item) => `
              <span>
                <strong>${escapeHtml(item.label)}</strong>
                ${escapeHtml(money(item.amount))} · ${item.count} lanc.
              </span>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderTransactionActions(item = {}) {
  return `
    <div class="finance-row-actions">
      <button type="button" data-financial-action="detail" data-financial-transaction-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-muted">Ver detalhes</button>
    </div>
  `;
}

function renderTransactionRow(item = {}) {
  const expense = isExpense(item);
  return `
    <article class="finance-transaction-row ${expense ? "finance-transaction-expense" : "finance-transaction-income"}">
      <div class="finance-transaction-main">
        <div class="finance-transaction-copy">
          <div class="finance-transaction-meta">
            ${renderStatusChip(typeStatus(item.type), { label: typeLabel(item.type) })}
            <span>${escapeHtml(formatDateTime(item.date))}</span>
          </div>
          <strong>${escapeHtml(item.description || originLabel(item))}</strong>
          <span>${escapeHtml(originLabel(item))}</span>
        </div>
        <div class="finance-transaction-value">
          <span>${expense ? "Saida" : "Entrada"}</span>
          <strong>${expense ? "-" : "+"} ${escapeHtml(money(item.amount))}</strong>
        </div>
      </div>
      <div class="finance-transaction-foot">
        <span>${escapeHtml(item.category || "Sem categoria")}</span>
        <span>${escapeHtml(item.paymentMethod || "Metodo nao informado")}</span>
        ${renderTransactionActions(item)}
      </div>
    </article>
  `;
}

function renderTransactionsTable(items = []) {
  return `
    <div class="ux-table hidden xl:block">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th class="px-3 py-3 text-left">Data</th>
            <th class="px-3 py-3 text-left">Lancamento</th>
            <th class="px-3 py-3 text-left">Origem</th>
            <th class="px-3 py-3 text-left">Categoria</th>
            <th class="px-3 py-3 text-left">Metodo</th>
            <th class="px-3 py-3 text-right">Valor</th>
            <th class="px-3 py-3 text-right">Acao</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const expense = isExpense(item);
              return `
                <tr>
                  <td class="px-3 py-3 text-xs text-slate-300">${escapeHtml(formatDateTime(item.date))}</td>
                  <td class="px-3 py-3">
                    <div class="text-sm font-semibold text-slate-100">${escapeHtml(item.description || "-")}</div>
                    <div class="mt-1">${renderStatusChip(typeStatus(item.type), { label: typeLabel(item.type) })}</div>
                  </td>
                  <td class="px-3 py-3 text-sm font-semibold text-slate-100">${escapeHtml(originLabel(item))}</td>
                  <td class="px-3 py-3 text-xs text-slate-300">${escapeHtml(item.category || "-")}</td>
                  <td class="px-3 py-3 text-xs text-slate-300">${escapeHtml(item.paymentMethod || "-")}</td>
                  <td class="px-3 py-3 text-right text-sm font-bold ${expense ? "text-rose-300" : "text-emerald-300"}">${expense ? "-" : "+"} ${escapeHtml(money(item.amount))}</td>
                  <td class="px-3 py-3 text-right">${renderTransactionActions(item)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOperationalLinks(item = {}) {
  const refundAppointmentId = parseRelatedId(item.notes, "appointmentId");
  const refundProductSaleId = parseRelatedId(item.notes, "productSaleId");
  const rows = [
    ["Atendimento relacionado", item.appointmentId || refundAppointmentId],
    ["Venda relacionada", item.productSaleId || refundProductSaleId],
    ["Devolucao/estorno relacionado", item.referenceType?.includes("REFUND") ? item.referenceId : ""],
    ["Profissional relacionado", item.professionalName || (item.professionalId ? "Profissional vinculado" : "")],
    ["Cliente relacionado", item.customerName || (item.customerId ? "Cliente vinculado" : "")],
    ["Comissao relacionada", item.commissionId],
  ].filter(([, value]) => value);

  if (!rows.length) {
    return `<p class="text-sm text-slate-400">Sem vinculo operacional informado para este lancamento.</p>`;
  }

  return `
    <dl class="op-summary-grid">
      ${rows
        .map(
          ([label, value]) => `
            <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
          `,
        )
        .join("")}
    </dl>
  `;
}

export function renderFinancialLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando resultado do periodo...");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, "Carregando origens financeiras...");
  if (elements.list) renderPanelMessage(elements.list, "Carregando lancamentos financeiros...");
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialError(elements, message = "Falha ao carregar financeiro.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, message, "error");
  if (elements.list) renderPanelMessage(elements.list, message, "error");
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialData(elements, payload) {
  const summary = payload?.summary?.summary ?? {
    grossRevenue: 0,
    expenses: 0,
    estimatedProfit: 0,
    netBalance: 0,
  };
  const cashFlow = payload?.summary?.cashFlow ?? {
    incoming: 0,
    outgoing: 0,
    balance: 0,
  };
  const transactions = Array.isArray(payload?.transactions?.transactions)
    ? payload.transactions.transactions
    : [];
  const movement = toNumber(cashFlow.incoming) + toNumber(cashFlow.outgoing);

  if (elements.summary) {
    elements.summary.innerHTML = [
      renderCard("Entradas", money(cashFlow.incoming), "text-emerald-700", "Receitas do periodo"),
      renderCard("Saidas", money(cashFlow.outgoing), "text-rose-700", "Despesas e reversos"),
      renderCard(
        "Saldo",
        money(cashFlow.balance),
        toNumber(cashFlow.balance) >= 0 ? "text-emerald-700" : "text-rose-700",
        "Entradas menos saidas",
      ),
      renderCard(
        "Resultado",
        money(summary.estimatedProfit ?? cashFlow.balance),
        toNumber(summary.estimatedProfit ?? cashFlow.balance) >= 0 ? "text-slate-100" : "text-rose-700",
        `Movimento: ${money(movement)}`,
      ),
    ].join("");
  }

  if (elements.cashflow) {
    elements.cashflow.innerHTML = renderOriginStrip(transactions);
  }

  if (elements.list) {
    if (!transactions.length) {
      elements.list.innerHTML = renderEmptyState({
        title: "Nenhum lancamento financeiro encontrado.",
        description: "Ajuste o periodo ou registre um lancamento manual para compor o caixa.",
        action: renderPrimaryAction({
          label: "Novo lancamento",
          id: "financialEmptyAddBtn",
          type: "button",
        }),
      });
    } else {
      elements.list.innerHTML = `
        ${renderTransactionsTable(transactions)}
        <div class="space-y-2 xl:mt-3">${transactions.map((item) => renderTransactionRow(item)).join("")}</div>
      `;
    }
  }
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialEntryDrawer(elements, item = {}) {
  if (!elements.drawerHost || !item?.id) return;

  const expense = isExpense(item);
  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Tipo</dt><dd>${escapeHtml(typeLabel(item.type))}</dd></div>
      <div><dt>Valor</dt><dd>${escapeHtml(money(item.amount))}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateTime(item.date))}</dd></div>
      <div><dt>Origem</dt><dd>${escapeHtml(originLabel(item))}</dd></div>
      <div><dt>Categoria</dt><dd>${escapeHtml(item.category || "-")}</dd></div>
      <div><dt>Metodo</dt><dd>${escapeHtml(item.paymentMethod || "-")}</dd></div>
      <div><dt>Descricao</dt><dd>${escapeHtml(item.description || "-")}</dd></div>
      <div><dt>Observacao</dt><dd>${escapeHtml(item.notes || "-")}</dd></div>
    </dl>
  `;

  const details = `
    ${renderOperationalLinks(item)}
  `;

  const history = `
    <div class="op-detail-list">
      <p>${escapeHtml(impactMessage(item))}</p>
      <p>O impacto foi conciliado visualmente com a origem operacional e a rastreabilidade completa fica recolhida abaixo.</p>
    </div>
  `;

  const technicalTrace = renderTechnicalTrace({
    financialEntryId: item.id,
    source: item.source,
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    appointmentId: item.appointmentId || parseRelatedId(item.notes, "appointmentId"),
    productSaleId: item.productSaleId || parseRelatedId(item.notes, "productSaleId"),
    commissionId: item.commissionId,
    professionalId: item.professionalId,
    customerId: item.customerId,
    idempotencyKey: item.idempotencyKey,
    auditEntity: "financial_entry",
    auditAction: item.referenceType === "MANUAL" ? "FINANCIAL_MANUAL_ENTRY" : item.referenceType,
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "financialEntryDrawer",
    title: item.description || originLabel(item),
    subtitle: `${originLabel(item)} · ${formatDateTime(item.date)}`,
    status: typeStatus(item.type),
    open: true,
    summary,
    details,
    history,
    technicalTrace,
    actions:
      item.referenceType === "MANUAL"
        ? `
          <button type="button" data-financial-action="edit" data-financial-transaction-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-muted">Editar lancamento</button>
          <button type="button" data-financial-action="delete" data-financial-transaction-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-danger">Excluir lancamento</button>
        `
        : "",
  });
  elements.drawerHost.classList.remove("hidden");
  bindEntityDrawers(elements.drawerHost);

  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
