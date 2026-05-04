import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
}

export function renderProfessionalsLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando desempenho de profissionais...");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Carregando indicadores individuais...");
  }
}

export function renderProfessionalsError(
  elements,
  message = "Falha ao carregar desempenho de profissionais.",
) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, message, "error");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Dados indisponiveis.", "error");
  }
}

export function renderProfessionalsData(elements, payload) {
  const summary = payload?.summary ?? {
    totalRevenue: 0,
    totalCompleted: 0,
    bestRevenue: null,
    bestOccupancy: null,
  };
  const professionals = Array.isArray(payload?.professionals) ? payload.professionals : [];

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Receita no periodo</div>
          <div class="text-lg font-bold text-gray-900">${money(summary.totalRevenue)}</div>
        </article>
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Atendimentos concluidos</div>
          <div class="text-lg font-bold text-gray-900">${toNumber(summary.totalCompleted)}</div>
        </article>
        <article class="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <div class="text-xs text-teal-700">Maior receita</div>
          <div class="text-sm font-bold text-teal-800">${summary.bestRevenue?.name || "-"}</div>
          <div class="text-xs text-teal-700">${summary.bestRevenue ? money(summary.bestRevenue.revenue) : "-"}</div>
        </article>
        <article class="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div class="text-xs text-indigo-700">Maior ocupacao</div>
          <div class="text-sm font-bold text-indigo-800">${summary.bestOccupancy?.name || "-"}</div>
          <div class="text-xs text-indigo-700">${summary.bestOccupancy ? `${toNumber(summary.bestOccupancy.occupancyRate)}%` : "-"}</div>
        </article>
      </div>
    `;
  }

  if (!elements.table) return;
  if (!professionals.length) {
    renderPanelMessage(elements.table, "Nenhum profissional encontrado para o periodo informado.");
    return;
  }

  elements.table.innerHTML = professionals
    .map(
      (item) => `
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <strong class="text-sm text-gray-800">${item.name}</strong>
            <span class="text-sm font-bold text-gray-900">${money(item.revenue)}</span>
          </div>
          <div class="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div><span class="text-gray-500">Concluidos:</span> <strong class="text-gray-800">${toNumber(item.completed)}</strong></div>
            <div><span class="text-gray-500">Total:</span> <strong class="text-gray-800">${toNumber(item.total)}</strong></div>
            <div><span class="text-gray-500">Ocupacao:</span> <strong class="text-gray-800">${toNumber(item.occupancyRate)}%</strong></div>
            <div><span class="text-gray-500">Ticket medio:</span> <strong class="text-gray-800">${money(item.ticketAverage)}</strong></div>
            <div><span class="text-gray-500">ID:</span> <strong class="text-gray-700">${item.professionalId}</strong></div>
          </div>
        </article>
      `,
    )
    .join("");
}
