import {
  renderEmptyState,
  renderStatusChip,
} from "../components/operational-ui.js";

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const statusLabel = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  IN_SERVICE: "Em atendimento",
  COMPLETED: "Concluido",
  CANCELLED: "Cancelado",
  NO_SHOW: "Nao compareceu",
  BLOCKED: "Bloqueado",
};

const statusClass = {
  SCHEDULED: "bg-slate-700/50 text-slate-200 border-slate-600",
  CONFIRMED: "bg-blue-900/40 text-blue-200 border-blue-700",
  IN_SERVICE: "bg-amber-900/40 text-amber-200 border-amber-700",
  COMPLETED: "bg-emerald-900/40 text-emerald-200 border-emerald-700",
  CANCELLED: "bg-red-900/40 text-red-200 border-red-700",
  NO_SHOW: "bg-rose-900/40 text-rose-200 border-rose-700",
  BLOCKED: "bg-slate-700/50 text-slate-200 border-slate-600",
};

const actionLabel = {
  DETAIL: "Detalhes",
  CONFIRMED: "Confirmar",
  IN_SERVICE: "Iniciar",
  COMPLETE: "Finalizar atendimento",
  RESCHEDULE: "Remarcar",
  CANCELLED: "Cancelar",
  NO_SHOW: "Falta",
  PAYMENT: "Registrar Pagamento",
  SELL: "Vender Produto",
  REFUND: "Estornar atendimento",
};

function actionButtonClass(action) {
  if (action === "DETAIL") {
    return "ux-btn ux-btn-muted";
  }
  if (action === "COMPLETE") {
    return "ux-btn ux-btn-success";
  }
  if (action === "PAYMENT") {
    return "ux-btn ux-btn-primary";
  }
  if (action === "CANCELLED") {
    return "ux-btn ux-btn-danger";
  }
  if (action === "NO_SHOW") {
    return "ux-btn ux-btn-danger";
  }
  if (action === "SELL") {
    return "ux-btn ux-btn-muted";
  }
  if (action === "REFUND") {
    return "ux-btn ux-btn-danger";
  }
  if (action === "CONFIRMED") {
    return "ux-btn ux-btn-primary";
  }
  return "ux-btn ux-btn-muted";
}

function actionsForStatus(status) {
  if (status === "SCHEDULED") return ["DETAIL", "CONFIRMED", "RESCHEDULE", "CANCELLED"];
  if (status === "CONFIRMED") {
    return ["DETAIL", "IN_SERVICE", "RESCHEDULE", "CANCELLED", "NO_SHOW"];
  }
  if (status === "IN_SERVICE") return ["DETAIL", "COMPLETE", "CANCELLED"];
  if (status === "COMPLETED") return ["DETAIL", "REFUND"];
  return ["DETAIL"];
}

export function normalizeAgendaItems(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows
    .map((item) => {
      const startsAt = normalizeDate(item.startsAt);
      const endsAt = normalizeDate(item.endsAt);
      if (!startsAt || !endsAt) return null;
      return {
        id: safeText(item.id),
        unitId: safeText(item.unitId),
        clientId: safeText(item.clientId),
        professionalId: safeText(item.professionalId),
        serviceId: safeText(item.serviceId),
        client: safeText(item.client, "Cliente"),
        professional: safeText(item.professional, "-"),
        service: safeText(item.service, "-"),
        startsAt,
        endsAt,
        status: safeText(item.status, "SCHEDULED"),
        isFitting: Boolean(item.isFitting),
        servicePrice: asNumber(item.servicePrice),
        serviceDurationMin: asNumber(item.serviceDurationMin),
        clientTags: Array.isArray(item.clientTags) ? item.clientTags : [],
        hasProductSale: Boolean(item.hasProductSale),
        productSalesCount: asNumber(item.productSalesCount),
        productItemsSoldCount: asNumber(item.productItemsSoldCount),
      };
    })
    .filter(Boolean);
}

export function filterAgendaItems(items, filterState) {
  const search = safeText(filterState.search).toLowerCase();
  return items.filter((item) => {
    if (filterState.professionalId && item.professionalId !== filterState.professionalId) return false;
    if (filterState.status && item.status !== filterState.status) return false;
    if (filterState.serviceId && item.serviceId !== filterState.serviceId) return false;
    if (!search) return true;
    const text = `${item.client} ${item.professional} ${item.service}`.toLowerCase();
    return text.includes(search);
  });
}

export function computeAgendaMetrics(items, now = new Date()) {
  const lateCount = items.filter((item) => {
    const isOperational = item.status === "SCHEDULED" || item.status === "CONFIRMED";
    return isOperational && item.startsAt.getTime() < now.getTime();
  }).length;

  const noShowCount = items.filter((item) => item.status === "NO_SHOW").length;
  const fittingCount = items.filter((item) => item.isFitting).length;
  const queueCount = items.filter(
    (item) => item.status === "IN_SERVICE" || item.status === "CONFIRMED",
  ).length;

  return {
    lateCount,
    noShowCount,
    fittingCount,
    queueCount,
    totalCount: items.length,
  };
}

export function renderAgendaLoading(elements) {
  elements.metricsGrid.innerHTML = Array.from({ length: 4 }, () => {
    return `
      <article class="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
        <div class="h-3 w-20 bg-gray-200 rounded"></div>
        <div class="h-8 w-10 bg-gray-200 rounded mt-3"></div>
      </article>
    `;
  }).join("");
  elements.list.innerHTML = "<p class='text-sm text-gray-500'>Carregando agenda...</p>";
  elements.queue.innerHTML = "<p class='text-sm text-gray-500'>Carregando fila...</p>";
}

export function renderAgendaError(elements, onRetry) {
  elements.metricsGrid.innerHTML = `
    <article class="col-span-full rounded-xl border border-red-200 bg-red-50 p-4">
      <p class="text-sm font-semibold text-red-700">Falha ao carregar agenda operacional.</p>
      <button type="button" data-agenda-retry class="mt-2 rounded-lg bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 text-xs font-semibold">
        Tentar novamente
      </button>
    </article>
  `;
  elements.list.innerHTML = "<p class='text-sm text-red-600'>Nao foi possivel carregar os agendamentos.</p>";
  elements.queue.innerHTML = "<p class='text-sm text-red-600'>Fila indisponivel no momento.</p>";
  const retryBtn = elements.metricsGrid.querySelector("[data-agenda-retry]");
  if (retryBtn && typeof onRetry === "function") {
    retryBtn.addEventListener("click", onRetry);
  }
}

function renderAgendaMetrics(elements, metrics, items = []) {
  const now = new Date();
  const next = [...items]
    .filter((item) => ["SCHEDULED", "CONFIRMED", "IN_SERVICE"].includes(item.status))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .find((item) => item.status === "IN_SERVICE" || item.startsAt.getTime() >= now.getTime());
  const nextLabel = next
    ? `${next.startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - ${next.client}`
    : "Sem proximo atendimento";
  const nextMeta = next ? `${next.service} com ${next.professional}` : "A agenda do dia esta livre no recorte atual.";
  elements.metricsGrid.innerHTML = `
    <article class="ux-kpi agenda-next-card">
      <div class="ux-label">Proximo atendimento</div>
      <div class="ux-value-sm">${nextLabel}</div>
      <div class="ux-hint">${nextMeta}</div>
    </article>
    <article class="ux-kpi">
      <div class="ux-label">Agenda do dia</div>
      <div class="ux-value-sm text-slate-100">${metrics.totalCount}</div>
      <div class="ux-hint">Atendimentos no recorte</div>
    </article>
    <article class="ux-kpi">
      <div class="ux-label">Atencao</div>
      <div class="ux-value-sm ${metrics.lateCount > 0 ? "text-amber-300" : "text-slate-100"}">${metrics.lateCount}</div>
      <div class="ux-hint">Atrasados agora</div>
    </article>
  `;
}

function renderQueue(elements, items) {
  const queue = items.filter((item) => item.status === "IN_SERVICE" || item.status === "CONFIRMED");
  if (!queue.length) {
    elements.queue.innerHTML = renderEmptyState({
      title: "Sem proximo atendimento ativo.",
      description: "Confirmados e atendimentos em andamento aparecerao aqui.",
    });
    return;
  }

  elements.queue.innerHTML = queue
    .map(
      (item) => `
      <article class="ux-kpi">
        <div class="flex items-start justify-between gap-2">
          <strong class="text-slate-100">${item.client}</strong>
          ${renderStatusChip(item.status)}
        </div>
        <div class="mt-1 text-sm text-slate-300">${item.service} - ${item.professional}</div>
      </article>
    `,
    )
    .join("");
}

function renderAgendaList(elements, list, handlers) {
  if (!list.length) {
    elements.list.innerHTML = renderEmptyState({
      title: "Nenhum agendamento no filtro atual.",
      description: "Ajuste os filtros ou mude o periodo para visualizar a agenda do dia.",
    });
    return;
  }

  elements.list.innerHTML = list
    .map((item) => {
      const time = item.startsAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const actions = actionsForStatus(item.status);
      const clientTag = item.clientTags[0] || "NEW";
      const clientTagLabel =
        clientTag === "VIP"
          ? "VIP"
          : clientTag === "RECURRING"
            ? "Recorrente"
            : clientTag === "INACTIVE"
              ? "Inativo"
              : "Novo";
      const late = (item.status === "SCHEDULED" || item.status === "CONFIRMED") && item.startsAt < new Date();

      return `
        <article class="ux-card ${late ? "border-amber-500" : ""}">
          <div class="flex items-start justify-between gap-2">
            <strong class="text-slate-100">${time} - ${item.client}</strong>
            ${renderStatusChip(item.status)}
          </div>
          <div class="mt-1 text-sm text-slate-300">${item.service} - ${item.professional}</div>
          <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 agenda-card-facts">
            <div><span class="text-slate-400">Valor</span> <strong class="text-slate-100">R$ ${item.servicePrice.toFixed(2)}</strong></div>
            <div><span class="text-slate-400">Sinal</span> <strong class="${late ? "text-amber-300" : "text-slate-100"}">${late ? "Atrasado" : item.isFitting ? "Encaixe" : "No prazo"}</strong></div>
          </div>
          ${
            item.hasProductSale
              ? `<div class="mt-2 ux-badge ux-badge-success" title="Venda de produto registrada para este cliente no dia">Produto vendido (${item.productItemsSoldCount} item(ns))</div>`
              : ""
          }
          <div class="mt-2 text-xs text-slate-400">Perfil: <strong class="text-slate-200">${clientTagLabel}</strong></div>
          <div class="mt-2 flex flex-wrap gap-2">
            ${actions
              .map(
                (action) =>
                  `<button data-id="${item.id}" data-action="${action}" class="${actionButtonClass(action)}">${actionLabel[action] || action}</button>`,
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");

  elements.list.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = list.find((row) => row.id === button.dataset.id);
      if (!item) return;
      try {
        await handlers.onAction(item, button.dataset.action);
      } catch (error) {
        if (typeof handlers.onError === "function") {
          handlers.onError(error);
        }
      }
    });
  });
}

function renderAgendaGrid(elements, list) {
  const slots = Array.from({ length: 14 }, (_, i) => 8 + i);
  const byHour = Object.fromEntries(slots.map((h) => [h, []]));
  for (const item of list) {
    const hour = item.startsAt.getHours();
    if (byHour[hour]) byHour[hour].push(item);
  }

  elements.list.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      ${slots
        .map((hour) => {
          const events = byHour[hour] || [];
          return `
            <section class="rounded-xl border border-gray-200 p-2 bg-gray-50">
              <header class="text-xs font-bold text-gray-600 mb-1">${String(hour).padStart(2, "0")}:00</header>
              ${
                events.length
                  ? events
                      .map(
                        (item) => `
                    <div class="rounded-lg border border-gray-200 bg-white p-2 mb-1">
                      <div class="text-xs font-semibold text-gray-800">${item.client}</div>
                      <div class="text-[11px] text-gray-500">${item.service} | R$ ${item.servicePrice.toFixed(2)}</div>
                      ${
                        item.hasProductSale
                          ? '<div class="mt-1 text-[10px] font-semibold text-emerald-700">SALE produto vendido</div>'
                          : ""
                      }
                    </div>
                  `,
                      )
                      .join("")
                  : "<div class='text-[11px] text-gray-400'>Horario livre</div>"
              }
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

export function renderAgendaData(elements, allItems, visibleItems, viewMode, handlers) {
  const metrics = computeAgendaMetrics(allItems);
  renderAgendaMetrics(elements, metrics, allItems);
  renderQueue(elements, allItems);
  if (viewMode === "grid") {
    renderAgendaGrid(elements, visibleItems);
    return;
  }
  renderAgendaList(elements, visibleItems, handlers);
}
