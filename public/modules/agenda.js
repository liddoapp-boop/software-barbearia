import {
  renderEmptyState,
  renderStatusChip,
} from "../components/operational-ui.js";
import {
  buildServiceSelectionLabel,
  normalizeAppointmentServiceItems,
} from "./appointment-service-selection.js";

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function nestedText(value, keys = [], fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    for (const key of keys) {
      const nested = value[key];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return fallback;
}

function nestedNumber(value, keys = [], fallback = 0) {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  if (value && typeof value === "object") {
    for (const key of keys) {
      const nested = Number(value[key]);
      if (Number.isFinite(nested)) return nested;
    }
  }
  return fallback;
}

function nestedId(value, fallback = "") {
  return nestedText(value, ["id"], fallback);
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAgendaStatus(value) {
  const normalized = safeText(value, "SCHEDULED").toUpperCase();
  return normalized || "SCHEDULED";
}

function getAppointmentDelayInfo(item = {}) {
  const entries = Array.isArray(item.history) ? item.history : [];
  const delayEntries = entries
    .filter((entry) => {
      const action = safeText(entry.action || entry.label || entry.status || entry.type, "").toUpperCase();
      const reason = safeText(entry.reason, "");
      return action === "DELAY_RECORDED" || /minutos? de atraso/i.test(reason);
    })
    .map((entry) => {
      const reason = safeText(entry.reason, "");
      const minutesMatch = reason.match(/(\d+)\s*min/i);
      return {
        minutes: minutesMatch ? Number(minutesMatch[1]) : null,
        reason,
      };
    });
  return delayEntries.at(-1) || null;
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

function isOperationalAgendaItem(item = {}) {
  return item.agendaKind === "block-time" || item.agendaKind === "block-day";
}

function isAppointmentAgendaItem(item = {}) {
  return !isOperationalAgendaItem(item);
}

function operationalAgendaLabel(item = {}) {
  if (item.agendaKind === "block-day" || item.isFullDay) return "Dia bloqueado";
  return "Horario bloqueado";
}

function normalizeBlockEvent(item) {
  const startsAt = normalizeDate(item.startsAt);
  const endsAt = normalizeDate(item.endsAt);
  if (!startsAt || !endsAt) return null;
  const rawStatus = safeText(item.status, "ACTIVE").toUpperCase();
  if (rawStatus === "CANCELLED") return null;
  const blockId = safeText(item.blockId || item.id);
  if (!blockId) return null;
  const isFullDay = Boolean(item.isFullDay);
  const label = safeText(item.label, isFullDay ? "Dia bloqueado" : "Horario bloqueado");
  const reason = safeText(item.reason, "");
  return {
    id: `block:${blockId}`,
    blockId,
    unitId: safeText(item.unitId),
    clientId: "",
    professionalId: safeText(item.professionalId),
    serviceId: "",
    serviceItems: [],
    client: "",
    professional: nestedText(item.professional, ["name", "fullName"], ""),
    service: label,
    startsAt,
    endsAt,
    status: "BLOCKED",
    agendaKind: isFullDay ? "block-day" : "block-time",
    isOperationalEvent: true,
    isFullDay,
    reason,
    operationalLabel: label,
    servicePrice: 0,
    serviceDurationMin: Math.max(15, Math.round((endsAt - startsAt) / 60000)),
    durationRuleLabel: "",
    history: [],
    clientTags: [],
    hasProductSale: false,
    productSalesCount: 0,
    productItemsSoldCount: 0,
  };
}


const actionLabel = {
  DETAIL: "Ver detalhes",
  EDIT: "Editar",
  CONFIRMED: "Confirmar",
  IN_SERVICE: "Iniciar atendimento",
  COMPLETE: "Ir para checkout",
  SERVICES: "Alterar servicos",
  RESCHEDULE: "Remarcar",
  CANCELLED: "Cancelar",
  NO_SHOW: "Marcar falta",
  DELAY: "Registrar atraso",
  PAYMENT: "Registrar Pagamento",
  SELL: "Vender Produto",
  REFUND: "Correcao administrativa",
};

function actionButtonClass(action) {
  if (action === "DETAIL") {
    return "ux-btn ux-btn-muted";
  }
  if (action === "IN_SERVICE") {
    return "ux-btn ux-btn-primary";
  }
  if (action === "COMPLETE") {
    return "ux-btn ux-btn-success";
  }
  if (action === "SERVICES") {
    return "ux-btn ux-btn-muted";
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
  if (action === "DELAY") {
    return "ux-btn ux-btn-muted";
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
  if (status === "SCHEDULED") {
    return ["CONFIRMED", options.canEdit ? "RESCHEDULE" : "", "CANCELLED"].filter(Boolean);
  }
  if (status === "CONFIRMED") {
    return ["IN_SERVICE", "DELAY", options.canEdit ? "RESCHEDULE" : "", "CANCELLED", options.canNoShow ? "NO_SHOW" : ""].filter(Boolean);
  }
  if (status === "IN_SERVICE") {
    return canCheckout ? ["COMPLETE", "SERVICES"] : ["SERVICES", "DETAIL"];
  }
  if (status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW") return ["DETAIL"];
  return ["DETAIL"];
}

function primaryActionForStatus(status, options = {}) {
  const canCheckout = options.canCheckout !== false;
  if (status === "SCHEDULED") return "CONFIRMED";
  if (status === "CONFIRMED") return "IN_SERVICE";
  if (status === "IN_SERVICE" && canCheckout) return "COMPLETE";
  if (status === "IN_SERVICE") return "SERVICES";
  return "DETAIL";
}

function actionLabelForStatus(action, status) {
  if (action === "DETAIL" && (status === "CANCELLED" || status === "NO_SHOW")) return "Ver historico";
  return actionLabel[action] || action;
}

function renderActionHierarchy(item, actions, options = {}) {
  const primaryAction = primaryActionForStatus(item.status, options);
  const primary = actions.includes(primaryAction) ? primaryAction : actions[0];
  const secondary = actions.filter((action) => action !== primary);
  const primaryMarkup = primary
    ? `<button data-id="${item.id}" data-action="${primary}" class="${actionButtonClass(primary)} appointment-next-action">${actionLabelForStatus(primary, item.status)}</button>`
    : "";
  const secondaryMarkup = secondary.length
    ? `
      <details class="appointment-secondary-actions">
        <summary class="ux-btn ux-btn-muted" aria-label="Mais opcoes para ${item.client || "atendimento"}">Mais opcoes</summary>
        <div class="appointment-secondary-menu">
          ${secondary
            .map((action) => `<button data-id="${item.id}" data-action="${action}" class="${actionButtonClass(action)}">${actionLabelForStatus(action, item.status)}</button>`)
            .join("")}
        </div>
      </details>
    `
    : "";
  return `${primaryMarkup}${secondaryMarkup}`;
}

export function normalizeAgendaItems(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.appointments)
      ? payload.appointments
      : [];
  const appointmentItems = rows
    .map((item) => {
      const startsAt = normalizeDate(item.startsAt);
      const endsAt = normalizeDate(item.endsAt);
      if (!startsAt || !endsAt) return null;
      const serviceItems = normalizeAppointmentServiceItems(item);
      const service = buildServiceSelectionLabel(serviceItems, nestedText(item.service, ["name"], "-"));
      const origin = safeText(item.origin, "").toUpperCase();
      const effectiveDuration = asNumber(
        item.effectiveDurationMinSnapshot ?? item.effectiveDurationMin ?? item.serviceDurationMin,
        Math.max(15, Math.round((endsAt - startsAt) / 60000)),
      );
      return {
        id: safeText(item.id),
        unitId: safeText(item.unitId),
        clientId: safeText(item.clientId) || nestedId(item.client),
        professionalId: safeText(item.professionalId) || nestedId(item.professional),
        serviceId: serviceItems[0]?.serviceId || safeText(item.serviceId) || nestedId(item.service),
        serviceItems,
        client: nestedText(item.client, ["fullName", "name"], "Cliente"),
        professional: nestedText(item.professional, ["name", "fullName"], "-"),
        service,
        startsAt,
        endsAt,
        status: normalizeAgendaStatus(item.status),
        isFitting: Boolean(item.isFitting),
        originLabel: Boolean(item.isFitting) ? "Encaixe" : origin === "WALK_IN" ? "Sem agendamento" : "",
        servicePrice: asNumber(
          item.totalPriceSnapshot ?? item.totalPrice ?? item.servicePrice,
          serviceItems.reduce((acc, serviceItem) => acc + asNumber(serviceItem.price), nestedNumber(item.service, ["price"])),
        ),
        serviceDurationMin: effectiveDuration,
        durationRuleLabel: safeText(item.durationRuleLabelSnapshot || item.ruleLabel),
        history: Array.isArray(item.history) ? item.history : [],
        clientTags: Array.isArray(item.clientTags) ? item.clientTags : [],
        hasProductSale: Boolean(item.hasProductSale),
        productSalesCount: asNumber(item.productSalesCount),
        productItemsSoldCount: asNumber(item.productItemsSoldCount),
      };
    })
    .filter(Boolean);

  const explicitBlockEvents = Array.isArray(payload?.blockEvents) ? payload.blockEvents : [];
  const rawBlocks = explicitBlockEvents.length
    ? explicitBlockEvents
    : Array.isArray(payload?.blocks)
      ? payload.blocks
      : [];
  const seenBlocks = new Set();
  const blockItems = rawBlocks
    .map(normalizeBlockEvent)
    .filter(Boolean)
    .filter((item) => {
      if (seenBlocks.has(item.id)) return false;
      seenBlocks.add(item.id);
      return true;
    });

  return [...appointmentItems, ...blockItems]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function filterAgendaItems(items, filterState) {
  const search = safeText(filterState.search).toLowerCase();
  const statusFilter = safeText(filterState.status).toUpperCase();
  return items.filter((item) => {
    if (filterState.professionalId && item.professionalId && item.professionalId !== filterState.professionalId) return false;
    if (statusFilter && normalizeAgendaStatus(item.status) !== statusFilter) return false;
    if (
      filterState.serviceId &&
      isAppointmentAgendaItem(item) &&
      item.serviceId !== filterState.serviceId &&
      !(Array.isArray(item.serviceItems) && item.serviceItems.some((serviceItem) => serviceItem.serviceId === filterState.serviceId))
    ) return false;
    if (!search) return true;
    const text = `${item.client} ${item.professional} ${item.service} ${item.reason || ""}`.toLowerCase();
    return text.includes(search);
  });
}

export function computeAgendaMetrics(items, now = new Date()) {
  const appointments = items.filter(isAppointmentAgendaItem);
  const lateCount = appointments.filter((item) => {
    const isOperational = item.status === "SCHEDULED" || item.status === "CONFIRMED";
    return isOperational && item.startsAt.getTime() < now.getTime();
  }).length;

  const noShowCount = appointments.filter((item) => item.status === "NO_SHOW").length;
  const fittingCount = appointments.filter((item) => item.isFitting).length;
  const queueCount = appointments.filter(
    (item) => item.status === "IN_SERVICE" || item.status === "CONFIRMED",
  ).length;

  return {
    lateCount,
    noShowCount,
    fittingCount,
    queueCount,
    totalCount: appointments.length,
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
    .filter(isAppointmentAgendaItem)
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
  const queue = items.filter((item) => isAppointmentAgendaItem(item) && (item.status === "IN_SERVICE" || item.status === "CONFIRMED"));
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
  const now = new Date();
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
      if (isOperationalAgendaItem(item)) {
        const endTime = item.endsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const title = operationalAgendaLabel(item);
        const reason = safeText(item.reason, "");
        return `
        <article class="ux-card agenda-appt-card agenda-operational-card" data-operational-id="${item.id}">
          <div class="agenda-appt-head">
            <strong>${item.isFullDay ? title : `${time}-${endTime} - ${title}`}</strong>
            ${renderStatusChip("BLOCKED", { label: "Bloqueado" })}
          </div>
          <div class="ux-hint">${reason || "Evento operacional"}</div>
          <div class="agenda-card-facts">
            <div><span>Tipo</span> <strong>${title}</strong></div>
            <div><span>Estado</span> <strong>Ativo</strong></div>
          </div>
          <div class="catalog-row-actions">
            <button data-id="${item.id}" data-action="DETAIL" class="${actionButtonClass("DETAIL")}">Detalhes</button>
          </div>
        </article>
      `;
      }
      const actions = actionsForStatus(item.status, {
        canCheckout: handlers?.canCheckout !== false,
        canEdit: handlers?.canEdit,
        canNoShow: now.getTime() >= item.startsAt.getTime() + 15 * 60 * 1000,
      });
      const clientTag = item.clientTags[0] || "NEW";
      const delayInfo = getAppointmentDelayInfo(item);
      const clientTagLabel =
        clientTag === "VIP"
          ? "VIP"
          : clientTag === "RECURRING"
            ? "Recorrente"
            : clientTag === "INACTIVE"
              ? "Inativo"
              : "Novo";
      const late = (item.status === "SCHEDULED" || item.status === "CONFIRMED") && item.startsAt < new Date();
      const originLabel = item.originLabel || (item.isFitting ? "Encaixe" : "");

      return `
        <article class="ux-card agenda-appt-card ${late ? "agenda-appt-card-late" : ""}">
          <div class="agenda-appt-head">
            <strong>${time} - ${item.client}</strong>
            ${renderStatusChip(item.status)}
          </div>
          <div class="ux-hint">${item.service} - ${item.professional}</div>
          ${originLabel ? `<div class="ux-badge ux-badge-info">${originLabel}</div>` : ""}
          ${delayInfo?.minutes ? `<div class="ux-badge ux-badge-warning">Atraso: ${delayInfo.minutes} min</div>` : ""}
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
            ${renderActionHierarchy(item, actions, {
              canCheckout: handlers?.canCheckout !== false,
            })}
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
        await handlers.onAction(item, button.dataset.action, { openerElement: button });
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
