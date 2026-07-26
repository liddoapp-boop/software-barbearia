import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
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

function formatDateShort(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
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

function formatPeriodDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPeriodRange(period = {}) {
  const start = formatPeriodDate(period.start);
  const end = formatPeriodDate(period.end);
  return start && end ? `${start} a ${end}` : "Período selecionado";
}

function formatPreviousPeriod(period = {}) {
  const start = formatPeriodDate(period.compareStart);
  const end = formatPeriodDate(period.compareEnd);
  return start && end ? `${start} a ${end}` : "período anterior equivalente";
}

function signedMoney(value) {
  const numeric = toNumber(value);
  if (Math.abs(numeric) < 0.005) return money(0);
  return `${numeric > 0 ? "+" : "−"} ${money(Math.abs(numeric))}`;
}

function signedPercent(value) {
  const numeric = toNumber(value);
  const formatted = Math.abs(numeric).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (Math.abs(numeric) < 0.05) return "0,0%";
  return `${numeric > 0 ? "+" : "−"}${formatted}%`;
}

function comparisonDetails(currentValue, deltaValue, period = {}, options = {}) {
  if (deltaValue == null || !Number.isFinite(Number(deltaValue))) {
    return { hasBase: false, text: "Sem base de comparação" };
  }
  const current = toNumber(currentValue);
  const delta = toNumber(deltaValue);
  const previous = current - delta;
  if (Math.abs(previous) < 0.005) {
    return { hasBase: false, text: "Sem base de comparação" };
  }
  const percent = (delta / Math.abs(previous)) * 100;
  const deltaText = options.integer
    ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(Math.round(delta))} mov.`
    : signedMoney(delta);
  return {
    hasBase: true,
    text: `${signedPercent(percent)} · ${deltaText} vs. ${formatPreviousPeriod(period)}`,
  };
}

function renderCard(title, value, tone = "", comparison = {}, kind = "monetary", context = "") {
  return `
    <article class="fn-kpi liddo-kpi ${tone}" data-kpi-kind="${escapeHtml(kind)}">
      <div class="fn-kpi-heading">
        <span>${escapeHtml(title)}</span>
        ${kind === "result" ? '<i aria-hidden="true"></i>' : ""}
      </div>
      <strong class="fn-kpi-value">${escapeHtml(value)}</strong>
      ${context ? `<small class="fn-kpi-context">${escapeHtml(context)}</small>` : ""}
      <p class="fn-kpi-comparison ${comparison.hasBase ? "has-base" : "no-base"}">${escapeHtml(
        comparison.text || "Sem base de comparação",
      )}</p>
    </article>
  `;
}

export function renderFinancialHeader(payload = {}) {
  const summary = payload?.summary?.summary ?? {};
  const transactions = Array.isArray(payload?.transactions?.transactions)
    ? payload.transactions.transactions
    : [];
  const count = Number.isFinite(Number(summary.movementsCount))
    ? Number(summary.movementsCount)
    : transactions.length;
  const period = payload?.summary?.period ?? {};
  return `
    <header class="op-page-header op-page-header-financeiro fn-page-header" data-header-module="financeiro" data-motion-item>
      <span class="fn-header-accent" aria-hidden="true"></span>
      <div class="fn-header-title">
        <span>Análise do período</span>
        <h1>Financeiro</h1>
      </div>
      <div class="fn-header-facts" data-header-context aria-label="Recorte financeiro atual">
        <div class="fn-header-period">
          <span>Período analisado</span>
          <strong>${escapeHtml(formatPeriodRange(period))}</strong>
        </div>
        <div class="fn-header-count">
          <strong>${count}</strong>
          <span>${count === 1 ? "movimentação" : "movimentações"}</span>
        </div>
      </div>
    </header>
  `;
}

function renderFinancialToolbar() {
  return `
    <div class="fn-toolbar">
      <button type="button" id="financialAddTransactionBtn" class="fn-add-btn">
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
          <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        Novo lançamento
      </button>
    </div>
  `;
}

function renderRevenueOrigins(revenueOrigins = {}) {
  const rows = [
    { key: "services", label: "Serviços", amount: toNumber(revenueOrigins.services) },
    { key: "products", label: "Produtos", amount: toNumber(revenueOrigins.products) },
    { key: "manual", label: "Lançamentos manuais", amount: toNumber(revenueOrigins.manual) },
    { key: "other", label: "Outros", amount: toNumber(revenueOrigins.other) },
  ].filter((item) => item.amount > 0.005);
  const total = rows.reduce((acc, item) => acc + item.amount, 0);
  if (!rows.length || total <= 0) return "";
  const normalizedRows = rows.map((item) => ({
    ...item,
    percent: (item.amount / total) * 100,
  }));
  return `
    <section class="fn-revenue-origin" aria-label="Origem das receitas">
      <div class="fn-chart-head">
        <div>
          <span>Composição da receita</span>
          <strong>Origem das receitas</strong>
        </div>
        <strong>${escapeHtml(money(total))}</strong>
      </div>
      <div class="fn-origin-composition" role="img" aria-label="Distribuição proporcional das receitas">
        ${normalizedRows
          .map(
            (item) => `
              <span
                data-origin="${escapeHtml(item.key)}"
                style="--origin-share:${Math.min(100, Math.max(0, item.percent))}%"
                title="${escapeHtml(item.label)}: ${escapeHtml(money(item.amount))}"
              ></span>
            `,
          )
          .join("")}
      </div>
      <div class="fn-revenue-origin-list" role="list">
        ${normalizedRows
          .map((item) => {
            const percentLabel = item.percent.toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            });
            return `
              <div class="fn-revenue-origin-row" data-origin="${escapeHtml(item.key)}" role="listitem">
                <span class="fn-origin-dot" aria-hidden="true"></span>
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(money(item.amount))}</strong>
                <small>${escapeHtml(percentLabel)}%</small>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderPeriodEmptyState() {
  return `
    <section class="fn-empty-period" data-empty="period" aria-labelledby="financialEmptyTitle">
      <div class="fn-empty-mark" aria-hidden="true">
        <svg viewBox="0 0 96 96" role="presentation">
          <rect x="31" y="13" width="34" height="70" rx="17"></rect>
          <path d="M34 63 61 36M33 47l22-22M42 79l22-22"></path>
          <path d="M25 84h46M25 12h46"></path>
        </svg>
      </div>
      <div class="fn-empty-copy">
        <span>Período sem atividade</span>
        <h2 id="financialEmptyTitle">Nenhuma movimentação neste período.</h2>
        <p>Checkouts pagos e lançamentos manuais alimentam este painel automaticamente.</p>
      </div>
    </section>
  `;
}

function renderTransactionActions(item = {}) {
  return `
    <button type="button" data-financial-action="detail" data-financial-transaction-id="${escapeHtml(item.id)}" class="fn-row-arrow" title="Ver detalhes">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `;
}

function formatProductItemsSummary(item = {}) {
  const productItems = Array.isArray(item.productItems)
    ? item.productItems.filter(
        (productItem) =>
          String(productItem?.productName ?? "").trim() &&
          Number.isFinite(Number(productItem?.quantity)) &&
          Number(productItem.quantity) > 0,
      )
    : [];

  if (productItems.length === 1) {
    const [productItem] = productItems;
    return `${String(productItem.productName).trim()} — qtd. ${Number(productItem.quantity)}`;
  }

  return productItems
    .map(
      (productItem) =>
        `${String(productItem.productName).trim()} x${Number(productItem.quantity)}`,
    )
    .join(", ");
}

function renderTransactionRow(item = {}) {
  const expense = isExpense(item);
  const productItemsSummary = formatProductItemsSummary(item);
  return `
    <article class="fn-row ${expense ? "fn-row-expense" : "fn-row-income"}"
             data-record-surface="financial" data-record-tone="${expense ? "expense" : "income"}">
      <div class="fn-row-main" data-financial-action="detail" data-financial-transaction-id="${escapeHtml(item.id)}"
           data-record-interactive="true" role="button" tabindex="0"
           aria-label="Abrir lancamento ${escapeHtml(item.description || originLabel(item))}">
        <div class="fn-row-date">
          <strong>${escapeHtml(formatDateShort(item.date))}</strong>
          <span>${escapeHtml(typeLabel(item.type))}</span>
        </div>
        <div class="fn-row-copy">
          <strong>${escapeHtml(item.description || originLabel(item))}</strong>
          ${productItemsSummary ? `<p>${escapeHtml(productItemsSummary)}</p>` : ""}
          <div class="fn-row-meta">
            <span><small>Origem</small>${escapeHtml(originLabel(item))}</span>
            <span><small>Categoria</small>${escapeHtml(item.category || "Sem categoria")}</span>
            <span><small>Pagamento</small>${escapeHtml(item.paymentMethod || "Não informado")}</span>
          </div>
        </div>
        <div class="fn-row-value">
          <strong>${expense ? "-" : "+"} ${escapeHtml(money(item.amount))}</strong>
          <span>${escapeHtml(typeLabel(item.type))}</span>
        </div>
      </div>
      <div class="fn-row-actions">${renderTransactionActions(item)}</div>
    </article>
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
    return `<p class="ds-text-muted">Sem vinculo operacional informado para este lancamento.</p>`;
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
  if (elements.toolbar) renderPanelMessage(elements.toolbar, "Preparando acoes financeiras...");
  if (elements.cashflow) renderPanelMessage(elements.cashflow, "Carregando origens financeiras...");
  if (elements.list) renderPanelMessage(elements.list, "Carregando lancamentos financeiros...");
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialError(elements, message = "Falha ao carregar financeiro.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.toolbar) renderPanelMessage(elements.toolbar, message, "error");
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
    pendingCommissions: 0,
    paidCommissionsTotal: 0,
    refundsTotal: 0,
    operationalExpenses: 0,
    ticketAverage: 0,
    paidCheckoutsCount: 0,
    movementsCount: 0,
  };
  const cashFlow = payload?.summary?.cashFlow ?? {
    incoming: 0,
    outgoing: 0,
    balance: 0,
  };
  const transactions = Array.isArray(payload?.transactions?.transactions)
    ? payload.transactions.transactions
    : [];
  const comparison = payload?.summary?.comparison ?? {};
  const period = payload?.summary?.period ?? {};
  const revenueOrigins = payload?.summary?.revenueOrigins ?? {};
  const movementsCount = Number.isFinite(Number(summary.movementsCount))
    ? Number(summary.movementsCount)
    : transactions.length;
  const hasMovements = movementsCount > 0;

  if (elements.header) {
    elements.header.innerHTML = renderFinancialHeader(payload);
  }

  if (elements.summary) {
    const incoming = toNumber(cashFlow.incoming);
    const outgoing = toNumber(cashFlow.outgoing);
    const result = incoming - outgoing;
    const ticketAverage = toNumber(summary.ticketAverage);
    const paidCheckoutsCount = toNumber(summary.paidCheckoutsCount);
    const useTicketAverage = paidCheckoutsCount > 0;

    elements.summary.innerHTML = [
      `
        <div class="fn-summary-caption">
          <span>Resumo financeiro</span>
          <small>Comparação com o período anterior equivalente</small>
        </div>
      `,
      renderCard(
        "Resultado líquido",
        money(result),
        result >= 0 ? "fn-kpi-positive" : "fn-kpi-negative",
        comparisonDetails(result, comparison.netBalanceDelta, period),
        "result",
        "Receitas − despesas",
      ),
      renderCard(
        "Receita do período",
        money(incoming),
        "fn-kpi-positive",
        comparisonDetails(incoming, comparison.grossRevenueDelta, period),
        "incoming",
      ),
      renderCard(
        "Despesas do período",
        money(outgoing),
        "fn-kpi-negative",
        comparisonDetails(outgoing, comparison.expensesDelta, period),
        "outgoing",
      ),
      useTicketAverage
        ? renderCard(
            "Ticket médio pago",
            money(ticketAverage),
            "",
            comparisonDetails(ticketAverage, comparison.ticketAverageDelta, period),
            "ticket",
            `${paidCheckoutsCount} ${paidCheckoutsCount === 1 ? "checkout pago" : "checkouts pagos"}`,
          )
        : renderCard(
            "Movimentações",
            String(movementsCount),
            "",
            comparisonDetails(movementsCount, comparison.movementsDelta, period, { integer: true }),
            "movements",
            "Entradas e saídas do período",
          ),
    ].join("");
  }

  if (elements.toolbar) {
    elements.toolbar.innerHTML = renderFinancialToolbar();
  }

  if (elements.cashflow) {
    elements.cashflow.innerHTML = hasMovements ? renderRevenueOrigins(revenueOrigins) : "";
  }

  if (elements.list) {
    if (!transactions.length) {
      elements.list.innerHTML = hasMovements
        ? renderEmptyState({
            title: "Nenhum lançamento corresponde aos filtros.",
            description: "Revise a busca ou o tipo de lançamento selecionado.",
          })
        : renderPeriodEmptyState();
    } else {
      const PAGE_SIZE = 10;
      let visibleCount = Math.min(PAGE_SIZE, transactions.length);
      const remaining = transactions.length - visibleCount;

      elements.list.innerHTML = `
        <div class="fn-list-head">
          <span>Movimentações no recorte</span>
          <strong>${transactions.length} ${transactions.length === 1 ? "registro" : "registros"}</strong>
        </div>
        <div class="fn-list" id="fnTransactionsList">
          ${transactions.slice(0, visibleCount).map((item) => renderTransactionRow(item)).join("")}
        </div>
        ${remaining > 0 ? `
          <button type="button" id="fnLoadMoreBtn" class="fn-load-more-btn">
            Ver mais (${remaining} restantes)
          </button>
        ` : ""}
      `;

      const loadMoreBtn = elements.list.querySelector("#fnLoadMoreBtn");
      const listEl = elements.list.querySelector("#fnTransactionsList");
      if (loadMoreBtn && listEl) {
        loadMoreBtn.addEventListener("click", () => {
          const nextBatch = transactions.slice(visibleCount, visibleCount + PAGE_SIZE);
          listEl.insertAdjacentHTML("beforeend", nextBatch.map((item) => renderTransactionRow(item)).join(""));
          visibleCount += nextBatch.length;
          const newRemaining = transactions.length - visibleCount;
          if (newRemaining <= 0) {
            loadMoreBtn.remove();
          } else {
            loadMoreBtn.textContent = `Ver mais (${newRemaining} restantes)`;
          }
        });
      }
    }
  }
  if (elements.commissions) elements.commissions.innerHTML = "";
  if (elements.reports) elements.reports.innerHTML = "";
}

export function renderFinancialEntryDrawer(elements, item = {}) {
  if (!elements.drawerHost || !item?.id) return;

  const expense = isExpense(item);
  const productItemsSummary = formatProductItemsSummary(item);
  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Tipo</dt><dd>${escapeHtml(typeLabel(item.type))}</dd></div>
      <div><dt>Valor</dt><dd>${escapeHtml(money(item.amount))}</dd></div>
      <div><dt>Data</dt><dd>${escapeHtml(formatDateTime(item.date))}</dd></div>
      <div><dt>Origem</dt><dd>${escapeHtml(originLabel(item))}</dd></div>
      <div><dt>Categoria</dt><dd>${escapeHtml(item.category || "-")}</dd></div>
      <div><dt>Metodo</dt><dd>${escapeHtml(item.paymentMethod || "-")}</dd></div>
      ${
        productItemsSummary
          ? `<div><dt>Produtos</dt><dd>${escapeHtml(productItemsSummary)}</dd></div>`
          : ""
      }
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
    </div>
  `;

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "financialEntryDrawer",
    title: item.description || originLabel(item),
    subtitle: `${originLabel(item)} · ${formatDateTime(item.date)}`,
    status: typeStatus(item.type),
    open: true,
    summary,
    details,
    history,
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
