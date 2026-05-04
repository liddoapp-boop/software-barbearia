import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
}

function appliesToLabel(value) {
  return value === "PRODUCT" ? "Produto" : "Servico";
}

function statusLabel(value) {
  if (value === "PAID") return "Paga";
  if (value === "CANCELED") return "Cancelada";
  return "Pendente";
}

function statusClass(value) {
  if (value === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "CANCELED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function renderCommissionsLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando resumo de comissoes...");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Carregando extrato...");
  }
}

export function renderCommissionsError(elements, message = "Falha ao carregar comissoes.") {
  if (elements.summary) {
    renderPanelMessage(elements.summary, message, "error");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Extrato indisponivel.", "error");
  }
}

export function renderCommissionsData(elements, payload, options = {}) {
  const summary = payload?.summary ?? {
    totalCommission: 0,
    serviceCommission: 0,
    productCommission: 0,
    byProfessional: [],
  };
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const byProfessional = Array.isArray(summary.byProfessional)
    ? summary.byProfessional
    : Array.isArray(payload?.byProfessional)
      ? payload.byProfessional.map((item) => ({
          name: item.professionalName,
          totalCommission: item.commissionAmount,
        }))
      : [];

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Comissao total</div>
          <div class="text-lg font-bold text-gray-900">${money(summary.totalCommission)}</div>
        </article>
        <article class="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <div class="text-xs text-teal-700">Pendentes</div>
          <div class="text-lg font-bold text-teal-800">${money(summary.pendingCommission ?? summary.serviceCommission)}</div>
        </article>
        <article class="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div class="text-xs text-indigo-700">Pagas</div>
          <div class="text-lg font-bold text-indigo-800">${money(summary.paidCommission ?? summary.productCommission)}</div>
        </article>
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Top profissional</div>
          <div class="text-sm font-bold text-gray-900">${byProfessional[0]?.name || byProfessional[0]?.professionalName || "-"}</div>
          <div class="text-xs text-gray-600">${byProfessional[0] ? money(byProfessional[0].totalCommission ?? byProfessional[0].commissionAmount) : "-"}</div>
        </article>
      </div>
    `;
  }

  if (!elements.table) return;
  if (!entries.length) {
    renderPanelMessage(elements.table, "Sem lancamentos de comissao no periodo.");
    return;
  }

  elements.table.innerHTML = entries
    .map((entry) => {
      const percentage =
        entry.percentage == null && entry.commissionRate == null
          ? "-"
          : `${toNumber(entry.percentage ?? entry.commissionRate).toFixed(2)}%`;
      const fixedAmount = entry.fixedAmount == null ? "-" : money(entry.fixedAmount);
      const occurred = new Date(entry.occurredAt || entry.createdAt);
      const status = entry.status || "PENDING";
      const financialReference =
        entry.financialEntryId || entry.financialReferenceId || entry.referenceFinancialEntryId;
      const referenceType =
        entry.referenceType || (entry.appointmentId ? "APPOINTMENT" : "PRODUCT_SALE");
      const referenceId = entry.referenceId || entry.appointmentId || "-";

      return `
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <strong class="text-sm text-gray-800">${entry.professionalName}</strong>
              <div class="text-xs text-gray-500 mt-1">${appliesToLabel(entry.appliesTo || entry.source)} | ${occurred.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
            </div>
            <div class="text-right">
              <span class="text-sm font-bold text-gray-900">${money(entry.commissionAmount)}</span>
              <div class="mt-1">
                <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(status)}">${statusLabel(status)}</span>
              </div>
            </div>
          </div>
          <div class="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div><span class="text-gray-500">Base:</span> <strong class="text-gray-800">${money(entry.baseAmount)}</strong></div>
            <div><span class="text-gray-500">%:</span> <strong class="text-gray-800">${percentage}</strong></div>
            <div><span class="text-gray-500">Fixo:</span> <strong class="text-gray-800">${fixedAmount}</strong></div>
            <div><span class="text-gray-500">Origem:</span> <strong class="text-gray-800">${referenceType}</strong></div>
            <div><span class="text-gray-500">Ref:</span> <strong class="text-gray-700">${referenceId}</strong></div>
          </div>
          ${
            status === "PAID"
              ? `<div class="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Pagamento registrado${financialReference ? ` com despesa financeira ${financialReference}` : "; referencia financeira nao veio neste payload"}.</div>`
              : ""
          }
          ${
            options.canPayCommissions && status === "PENDING"
              ? `<div class="mt-3 flex justify-end"><button type="button" data-commission-action="pay" data-commission-id="${entry.id}" class="min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Pagar comissao</button></div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}
