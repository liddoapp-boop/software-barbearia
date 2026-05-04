import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
}

export function renderFidelizacaoLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando fidelizacao premium...");
  }
  if (elements.packages) {
    renderPanelMessage(elements.packages, "Carregando pacotes...");
  }
  if (elements.subscriptions) {
    renderPanelMessage(elements.subscriptions, "Carregando assinaturas...");
  }
  if (elements.retention) {
    renderPanelMessage(elements.retention, "Carregando retencao...");
  }
  if (elements.multiunit) {
    renderPanelMessage(elements.multiunit, "Carregando consolidado multiunidade...");
  }
}

export function renderFidelizacaoError(elements, message = "Falha ao carregar modulo de fidelizacao.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
}

export function renderFidelizacaoData(elements, payload) {
  const loyalty = payload?.loyalty ?? { program: null, summary: {} };
  const packages = Array.isArray(payload?.packages?.packages) ? payload.packages.packages : [];
  const subscriptions = payload?.subscriptions ?? { summary: {}, subscriptions: [] };
  const retention = payload?.retention ?? { summary: {}, cases: [] };
  const multiunit = payload?.multiunit ?? { summary: {}, units: [] };

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Programa</div>
          <div class="text-sm font-bold text-gray-900">${loyalty.program?.name || "Nao configurado"}</div>
          <div class="text-xs text-gray-600">${loyalty.program ? `${loyalty.program.type} - taxa ${toNumber(loyalty.program.conversionRate).toFixed(2)}` : "-"}</div>
        </article>
        <article class="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <div class="text-xs text-teal-700">Pontos creditados</div>
          <div class="text-lg font-bold text-teal-800">${toNumber(loyalty.summary.earned).toFixed(2)}</div>
        </article>
        <article class="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div class="text-xs text-amber-700">Pontos resgatados</div>
          <div class="text-lg font-bold text-amber-800">${toNumber(loyalty.summary.redeemed).toFixed(2)}</div>
        </article>
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">MRR assinaturas</div>
          <div class="text-lg font-bold text-gray-900">${money(subscriptions.summary.mrr)}</div>
        </article>
        <article class="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div class="text-xs text-indigo-700">Receita consolidada</div>
          <div class="text-lg font-bold text-indigo-800">${money(multiunit.summary.totalRevenue)}</div>
        </article>
      </div>
    `;
  }

  if (elements.packages) {
    elements.packages.innerHTML = packages.length
      ? packages
          .map(
            (item) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2">
                  <strong class="text-sm text-gray-800">${item.name}</strong>
                  <span class="text-sm font-bold text-gray-900">${money(item.price)}</span>
                </div>
                <div class="text-xs text-gray-600 mt-1">${toNumber(item.sessionsTotal)} sessoes - validade ${toNumber(item.validityDays)} dias</div>
              </article>
            `,
          )
          .join("")
      : renderPanelMessageString("Nenhum pacote ativo.");
  }

  if (elements.subscriptions) {
    const rows = Array.isArray(subscriptions.subscriptions) ? subscriptions.subscriptions : [];
    elements.subscriptions.innerHTML = `
      <div class="text-xs text-gray-600 mb-2">Ativas: ${toNumber(subscriptions.summary.active)} | Atrasadas: ${toNumber(subscriptions.summary.pastDue)} | Canceladas: ${toNumber(subscriptions.summary.cancelled)}</div>
      ${
        rows.length
          ? rows
              .slice(0, 6)
              .map(
                (item) => `
                  <article class="rounded-lg border border-gray-200 bg-white p-3">
                    <div class="flex items-center justify-between gap-2">
                      <strong class="text-sm text-gray-800">${item.planName || item.planId}</strong>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">${item.status}</span>
                    </div>
                    <div class="text-xs text-gray-600 mt-1">Proxima cobranca: ${new Date(item.nextBillingAt).toLocaleDateString("pt-BR")}</div>
                  </article>
                `,
              )
              .join("")
          : renderPanelMessageString("Sem assinaturas para o periodo.")
      }
    `;
  }

  if (elements.retention) {
    const rows = Array.isArray(retention.cases) ? retention.cases : [];
    elements.retention.innerHTML = rows.length
      ? rows
          .slice(0, 8)
          .map(
            (item) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <strong class="text-sm text-gray-800">${item.clientName || item.clientId}</strong>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">${item.riskLevel}</span>
                </div>
                <div class="text-xs text-gray-600 mt-1">${toNumber(item.daysWithoutReturn)} dias sem retorno</div>
                <div class="text-xs text-gray-500 mt-1">${item.recommendedAction || "-"}</div>
              </article>
            `,
          )
          .join("")
      : renderPanelMessageString("Sem casos de retencao abertos.");
  }

  if (elements.multiunit) {
    const rows = Array.isArray(multiunit.units) ? multiunit.units : [];
    elements.multiunit.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2">
                  <strong class="text-sm text-gray-800">${item.unitName}</strong>
                  <span class="text-sm font-bold text-gray-900">${money(item.revenue)}</span>
                </div>
                <div class="mt-1 text-xs text-gray-600">
                  Atendimentos: ${toNumber(item.appointments)} | Concluidos: ${toNumber(item.completed)} | Ocupacao: ${toNumber(item.occupancyRate)}%
                </div>
              </article>
            `,
          )
          .join("")
      : renderPanelMessageString("Sem dados de multiunidade para o periodo.");
  }
}

function renderPanelMessageString(message) {
  return `<div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">${message}</div>`;
}
