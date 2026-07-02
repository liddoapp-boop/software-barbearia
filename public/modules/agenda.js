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

function actionsForStatus(status, options = {}) {
  const canCheckout = options.canCheckout !== false;
  if (status === "IN_SERVICE") {
    return canCheckout ? ["COMPLETE", "CANCELLED"] : ["CANCELLED"];
  }
  if (status === "SCHEDULED" || status === "CONFIRMED") {
    return ["CANCELLED"];
  }
  if (status === "COMPLETED") return ["DETAIL", "REFUND"];
  return ["DETAIL"];
}

export function normalizeAgendaItems(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.appointments)
      ? payload.appointments
      : [];
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
  elements.metricsGrid.innerHTML = Array.from({ length: 4 }, () => `<article class="ux-kpi agenda-kpi-loading"></article>`).join("");
  elements.list.innerHTML = `<p class="ds-text-muted">Carregando agenda...</p>`;
  elements.queue.innerHTML = `<p class="ds-text-muted">Carregando fila...</p>`;
}

export function renderAgendaError(elements, onRetry) {
  elements.metricsGrid.innerHTML = `
    <div class="panel-msg panel-msg-error agenda-error-block">
      <p>Falha ao carregar agenda operacional.</p>
      <button type="button" data-agenda-retry class="ux-btn ux-btn-muted">Tentar novamente</button>
    </div>
  `;
  elements.list.innerHTML = `<p class="ds-text-muted">Nao foi possivel carregar os agendamentos.</p>`;
  elements.queue.innerHTML = `<p class="ds-text-muted">Fila indisponivel no momento.</p>`;
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
      <div class="ux-value-sm">${metrics.totalCount}</div>
      <div class="ux-hint">Atendimentos no recorte</div>
    </article>
    <article class="ux-kpi">
      <div class="ux-label">Atencao</div>
      <div class="ux-value-sm ${metrics.lateCount > 0 ? "ds-kpi-tone-warning" : ""}">${metrics.lateCount}</div>
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
      <article class="ux-kpi agenda-queue-item">
        <div class="agenda-queue-head">
          <strong>${item.client}</strong>
          ${renderStatusChip(item.status)}
        </div>
        <div class="ux-hint">${item.service} - ${item.professional}</div>
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
      const actions = actionsForStatus(item.status, { canCheckout: handlers?.canCheckout });
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
        <article class="ux-card agenda-appt-card ${late ? "agenda-appt-card-late" : ""}">
          <div class="agenda-appt-head">
            <strong>${time} - ${item.client}</strong>
            ${renderStatusChip(item.status)}
          </div>
          <div class="ux-hint">${item.service} - ${item.professional}</div>
          <div class="agenda-card-facts">
            <div><span>Valor</span> <strong>R$ ${item.servicePrice.toFixed(2)}</strong></div>
            <div><span>Sinal</span> <strong class="${late ? "ds-kpi-tone-warning" : ""}">${late ? "Atrasado" : item.isFitting ? "Encaixe" : "No prazo"}</strong></div>
          </div>
          ${
            item.hasProductSale
              ? `<div class="ux-badge ux-badge-success" title="Venda de produto registrada para este cliente no dia">Produto vendido (${item.productItemsSoldCount} item(ns))</div>`
              : ""
          }
          <div class="ux-hint">Perfil: <strong>${clientTagLabel}</strong></div>
          <div class="catalog-row-actions">
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
    <div class="agenda-grid-wrap">
      ${slots
        .map((hour) => {
          const events = byHour[hour] || [];
          return `
            <section class="agenda-grid-slot">
              <header class="agenda-grid-slot-hour">${String(hour).padStart(2, "0")}:00</header>
              ${
                events.length
                  ? events
                      .map(
                        (item) => `
                    <div class="agenda-grid-event">
                      <div class="ds-cell-primary">${item.client}</div>
                      <div class="ds-cell-secondary">${item.service} | R$ ${item.servicePrice.toFixed(2)}</div>
                      ${item.hasProductSale ? `<div class="ux-badge ux-badge-success">Produto vendido</div>` : ""}
                    </div>
                  `,
                      )
                      .join("")
                  : `<div class="ds-text-muted">Horario livre</div>`
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
