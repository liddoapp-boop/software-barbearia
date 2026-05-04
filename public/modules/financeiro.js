import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function originLabel(item) {
  const source = String(item?.source ?? "").toUpperCase();
  const referenceType = String(item?.referenceType ?? "").toUpperCase();
  if (source === "COMMISSION" || referenceType === "COMMISSION") return "Comissao paga";
  if (source === "REFUND" && referenceType === "APPOINTMENT_REFUND") return "Estorno de atendimento";
  if (source === "REFUND" && referenceType === "PRODUCT_SALE_REFUND") return "Devolucao de produto";
  if (source === "SERVICE" || referenceType === "APPOINTMENT") return "Servico";
  if (source === "PRODUCT" || referenceType === "PRODUCT_SALE") return "Produto";
  if (referenceType === "MANUAL") {
    return item?.type === "EXPENSE" ? "Despesa manual" : "Ajuste";
  }
  return "Ajuste";
}

function originTone(item) {
  const source = String(item?.source ?? "").toUpperCase();
  const referenceType = String(item?.referenceType ?? "").toUpperCase();
  if (source === "COMMISSION" || referenceType === "COMMISSION") {
    return "border-amber-300 bg-amber-50/80";
  }
  if (source === "REFUND" || referenceType.includes("REFUND")) {
    return "border-rose-300 bg-rose-50/80";
  }
  return item?.type === "EXPENSE"
    ? "border-rose-200 bg-rose-50/60"
    : "border-emerald-200 bg-emerald-50/60";
}

function typeLabel(type) {
  return type === "EXPENSE" ? "Saida" : "Entrada";
}

function renderTransactionRow(item) {
  const isExpense = item?.type === "EXPENSE";
  const containerTone = originTone(item);
  const typeTone = isExpense
    ? "border-rose-200 bg-rose-100 text-rose-700"
    : "border-emerald-200 bg-emerald-100 text-emerald-700";
  const amountTone = isExpense ? "text-rose-800" : "text-emerald-800";
  const signal = isExpense ? "-" : "+";

  return `
    <article class="rounded-lg border ${containerTone} p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${typeTone}">
              ${typeLabel(item?.type)}
            </span>
            <span class="text-xs text-slate-600">${escapeHtml(formatDateTime(item?.date))}</span>
          </div>
          <p class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(item?.description || "-")}</p>
        </div>
        <div class="text-right">
          <p class="text-xs uppercase tracking-wide text-slate-500">Valor</p>
          <p class="text-base font-extrabold ${amountTone}">${signal} ${money(item?.amount)}</p>
        </div>
      </div>
      <dl class="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
        <div><dt class="font-semibold text-slate-500">Categoria</dt><dd>${escapeHtml(item?.category || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Metodo</dt><dd>${escapeHtml(item?.paymentMethod || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Origem</dt><dd>${escapeHtml(originLabel(item))}</dd></div>
        <div><dt class="font-semibold text-slate-500">Source</dt><dd>${escapeHtml(item?.source || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Reference type</dt><dd>${escapeHtml(item?.referenceType || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Reference ID</dt><dd class="break-all">${escapeHtml(item?.referenceId || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Professional ID</dt><dd class="break-all">${escapeHtml(item?.professionalId || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Cliente</dt><dd>${escapeHtml(item?.customerName || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Profissional</dt><dd>${escapeHtml(item?.professionalName || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Descricao</dt><dd>${escapeHtml(item?.description || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Observacao</dt><dd>${escapeHtml(item?.notes || "-")}</dd></div>
      </dl>
    </article>
  `;
}

function renderTransactionsTable(items) {
  return `
    <div class="ux-table hidden lg:block">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th class="px-3 py-3 text-left">Data</th>
            <th class="px-3 py-3 text-left">Descricao</th>
            <th class="px-3 py-3 text-left">Origem</th>
            <th class="px-3 py-3 text-left">Categoria</th>
            <th class="px-3 py-3 text-left">Metodo</th>
            <th class="px-3 py-3 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const isExpense = item?.type === "EXPENSE";
              return `
                <tr class="border-t border-slate-700/60">
                  <td class="px-3 py-3 text-xs text-slate-300">${escapeHtml(formatDateTime(item?.date))}</td>
                  <td class="px-3 py-3 text-sm font-semibold text-slate-100">${escapeHtml(item?.description || "-")}</td>
                  <td class="px-3 py-3 text-xs text-slate-300">
                    <div class="font-semibold text-slate-100">${escapeHtml(originLabel(item))}</div>
                    <div>${escapeHtml(item?.source || "-")}</div>
                    <div class="break-all">${escapeHtml(item?.referenceType || "-")} / ${escapeHtml(item?.referenceId || "-")}</div>
                  </td>
                  <td class="px-3 py-3 text-xs text-slate-300">${escapeHtml(item?.category || "-")}</td>
                  <td class="px-3 py-3 text-xs text-slate-300">${escapeHtml(item?.paymentMethod || "-")}</td>
                  <td class="px-3 py-3 text-right text-sm font-bold ${isExpense ? "text-rose-300" : "text-emerald-300"}">${isExpense ? "-" : "+"} ${money(item?.amount)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCard(title, value, tone = "text-slate-900", subtitle = "") {
  return `
    <article class="ux-kpi">
      <div class="ux-label">${title}</div>
      <div class="ux-value-sm ${tone}">${value}</div>
      <div class="ux-hint">${subtitle}</div>
    </article>
  `;
}

export function renderFinancialLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando resumo financeiro...");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, "Carregando fluxo de caixa...");
  if (elements.list) renderPanelMessage(elements.list, "Carregando visao gerencial...");
  if (elements.commissions) renderPanelMessage(elements.commissions, "Carregando visao gerencial...");
  if (elements.reports) renderPanelMessage(elements.reports, "Carregando visao gerencial...");
}

export function renderFinancialError(elements, message = "Falha ao carregar financeiro.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, message, "error");
  if (elements.list) renderPanelMessage(elements.list, message, "error");
  if (elements.commissions) renderPanelMessage(elements.commissions, message, "error");
  if (elements.reports) renderPanelMessage(elements.reports, message, "error");
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

  if (elements.summary) {
    elements.summary.innerHTML = [
      renderCard("Receita total", money(summary.grossRevenue), "text-emerald-700"),
      renderCard("Despesas", money(summary.expenses), "text-rose-700"),
      renderCard(
        "Lucro",
        money(summary.estimatedProfit),
        toNumber(summary.estimatedProfit) >= 0 ? "text-slate-900" : "text-rose-700",
      ),
      renderCard(
        "Saldo",
        money(summary.netBalance),
        toNumber(summary.netBalance) >= 0 ? "text-emerald-700" : "text-rose-700",
      ),
    ].join("");
  }

  if (elements.cashflow) {
    elements.cashflow.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <article class="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div class="text-xs text-emerald-700 uppercase tracking-wide font-semibold">Entradas</div>
          <div class="text-lg font-bold text-emerald-900 mt-1">${money(cashFlow.incoming)}</div>
        </article>
        <article class="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <div class="text-xs text-rose-700 uppercase tracking-wide font-semibold">Saidas</div>
          <div class="text-lg font-bold text-rose-900 mt-1">${money(cashFlow.outgoing)}</div>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500 uppercase tracking-wide font-semibold">Fluxo de caixa</div>
          <div class="text-lg font-bold ${toNumber(cashFlow.balance) >= 0 ? "text-emerald-800" : "text-rose-800"} mt-1">${money(cashFlow.balance)}</div>
        </article>
      </div>
    `;
  }

  if (elements.list) {
    const transactions = Array.isArray(payload?.transactions?.transactions)
      ? payload.transactions.transactions
      : [];
    if (!transactions.length) {
      elements.list.innerHTML = `<div class="ux-card text-sm text-slate-300">Nenhuma movimentacao financeira encontrada neste periodo.</div>`;
    } else {
      elements.list.innerHTML = `${renderTransactionsTable(transactions)}<div class="space-y-2 lg:mt-3">${transactions.map((item) => renderTransactionRow(item)).join("")}</div>`;
    }
  }
  if (elements.commissions) {
    elements.commissions.innerHTML = `<div class="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">Comissoes e detalhes operacionais foram removidos deste modulo.</div>`;
  }
  if (elements.reports) {
    elements.reports.innerHTML = `<div class="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">Use esta tela para leitura consolidada de resultado.</div>`;
  }
}
