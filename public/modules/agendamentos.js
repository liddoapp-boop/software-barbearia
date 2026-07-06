import {
  bindEntityDrawers,
  escapeHtml,
  renderEmptyState,
  renderEntityDrawer,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import {
  buildServiceSelectionLabel,
  normalizeAppointmentServiceItems,
} from "./appointment-service-selection.js";

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

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

function money(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizeErrorMessage(message) {
  const text = safeText(message, "");
  if (!text) return "Nao foi possivel carregar agendamentos agora. Tente novamente em instantes.";
  const normalized = text.toLowerCase();
  if (normalized === "not found" || normalized.includes("route") || normalized.includes("nao encontrado")) {
    return "Central de agendamentos indisponivel no servidor atual. Atualize ou reinicie a API e tente novamente.";
  }
  if (normalized.includes("token") || normalized.includes("autenticado")) {
    return "Sua sessao expirou. Recarregue a pagina para autenticar novamente.";
  }
  return text;
}

function statusLabel(status) {
  if (status === "SCHEDULED") return "Agendado";
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "IN_SERVICE") return "Em atendimento";
  if (status === "COMPLETED") return "Concluido";
  if (status === "CANCELLED") return "Cancelado";
  if (status === "NO_SHOW") return "Falta";
  if (status === "BLOCKED") return "Bloqueado";
  return status;
}


function computeClientProfile(item, allItems) {
  const tags = Array.isArray(item.clientTags) ? item.clientTags : [];
  if (tags.includes("VIP")) return "VIP";
  if (tags.includes("INACTIVE")) return "INATIVO";
  const fromClient = allItems.filter((row) => row.clientId === item.clientId);
  const riskScore = fromClient.filter((row) => row.status === "NO_SHOW" || row.status === "CANCELLED")
    .length;
  if (riskScore >= 2) return "EM_RISCO";
  if (tags.includes("RECURRING")) return "RECORRENTE";
  return "NOVO";
}

function profileLabel(profile) {
  if (profile === "VIP") return "VIP";
  if (profile === "EM_RISCO") return "Em risco";
  if (profile === "INATIVO") return "Inativo";
  if (profile === "RECORRENTE") return "Recorrente";
  return "Novo";
}

function profileChip(profile) {
  return renderStatusChip(profile || "NOVO");
}

function formatTime(date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date) {
  return date.toLocaleDateString("pt-BR", {
    dateStyle: "short",
  });
}

function formatDateTime(date) {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
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
        changedAt: asDate(entry.changedAt || entry.at || entry.createdAt || entry.timestamp || entry.date),
        changedBy: safeText(entry.changedBy || entry.actor || entry.actorId, ""),
      };
    });
  return delayEntries.at(-1) || null;
}

function quickFlags(item, now, allItems) {
  const flags = [];
  const late =
    (item.status === "SCHEDULED" || item.status === "CONFIRMED") && item.startsAt.getTime() < now.getTime();
  const pendingConfirmation = item.status === "SCHEDULED";
  const upcoming =
    item.startsAt.getTime() > now.getTime() &&
    item.startsAt.getTime() - now.getTime() <= 45 * 60 * 1000 &&
    (item.status === "SCHEDULED" || item.status === "CONFIRMED");
  const hasNotes = Boolean(safeText(item.notes));
  const profile = computeClientProfile(item, allItems);

  if (late) flags.push({ status: "WARNING", label: "Atrasado" });
  if (pendingConfirmation) flags.push({ status: "PENDING", label: "Pendente de confirmacao" });
  if (profile === "VIP") flags.push({ status: "VIP", label: "VIP" });
  if (profile === "EM_RISCO") flags.push({ status: "EM_RISCO", label: "Cliente em risco" });
  if (upcoming) flags.push({ status: "PAID", label: "Horario proximo" });
  if (hasNotes) flags.push({ status: "INFO", label: "Observacao" });

  return { flags, late, profile };
}

function formatHistoryEntry(entry = {}) {
  const label = safeText(entry.label || entry.action || entry.status || entry.type, "Movimento");
  const at = asDate(entry.changedAt || entry.at || entry.createdAt || entry.timestamp || entry.date);
  const actor = safeText(entry.changedBy || entry.actor || entry.actorId, "");
  const reason = safeText(entry.reason, "");
  const isDelay = label === "DELAY_RECORDED" || /minutos? de atraso/i.test(reason);
  const minutesMatch = isDelay
    ? reason.match(/(\d+)\s*min/i)
    : null;
  const visibleReason = isDelay
    ? reason.replace(/^\s*\d+\s*minutos?\s+de\s+atraso\s*-?\s*/i, "").trim()
    : reason;
  const details = [
    minutesMatch ? `${minutesMatch[1]} min` : "",
    actor ? `por ${actor}` : "",
    visibleReason ? visibleReason : "",
  ].filter(Boolean).join(" | ");
  return {
    label: isDelay ? "Atraso registrado" : label,
    meta: `${at ? formatDateTime(at) : "Sem data registrada"}${details ? ` | ${details}` : ""}`,
  };
}

function actionsForStatus(status, options = {}) {
  const canCheckout = options.canCheckout !== false;
  if (status === "SCHEDULED") {
    return [
      options.canEdit ? "EDIT" : "",
      "CONFIRMED",
      "DETAIL",
      "WHATSAPP",
      options.canNoShow ? "NO_SHOW" : "",
      "DELAY",
      "CANCELLED",
    ].filter(Boolean);
  }
  if (status === "CONFIRMED") {
    return [options.canEdit ? "EDIT" : "", "IN_SERVICE", "DETAIL", "WHATSAPP", options.canNoShow ? "NO_SHOW" : "", "DELAY", "CANCELLED"].filter(Boolean);
  }
  if (status === "IN_SERVICE") {
    return canCheckout
      ? ["COMPLETE", "DETAIL", "WHATSAPP", "DELAY"]
      : ["DETAIL", "WHATSAPP", "DELAY"];
  }
  if (status === "COMPLETED") return ["DETAIL", "WHATSAPP"];
  return ["DETAIL", "WHATSAPP"];
}

function primaryActionForStatus(status, options = {}) {
  const canCheckout = options.canCheckout !== false;
  if (status === "SCHEDULED") return "CONFIRMED";
  if (status === "CONFIRMED") return "IN_SERVICE";
  if (status === "IN_SERVICE" && canCheckout) return "COMPLETE";
  if (status === "IN_SERVICE") return "DETAIL";
  if (status === "COMPLETED") return "REFUND";
  return "DETAIL";
}

function actionLabel(action) {
  if (action === "CONFIRMED") return "Confirmar";
  if (action === "IN_SERVICE") return "Iniciar atendimento";
  if (action === "COMPLETE") return "Concluir";
  if (action === "NO_SHOW") return "Falta";
  if (action === "DELAY") return "Registrar atraso";
  if (action === "CANCELLED") return "Cancelar";
  if (action === "DETAIL") return "Detalhes";
  if (action === "EDIT") return "Editar";
  if (action === "WHATSAPP") return "WhatsApp";
  if (action === "REFUND") return "Estornar atendimento";
  return action;
}

function actionClass(action) {
  if (action === "CONFIRMED") return "ux-btn ux-btn-primary";
  if (action === "IN_SERVICE") return "ux-btn ux-btn-primary";
  if (action === "COMPLETE") return "ux-btn ux-btn-success";
  if (action === "CANCELLED") return "ux-btn ux-btn-danger";
  if (action === "NO_SHOW") return "ux-btn ux-btn-danger";
  if (action === "DELAY") return "ux-btn ux-btn-muted";
  if (action === "REFUND") return "ux-btn ux-btn-muted";
  if (action === "WHATSAPP") return "ux-btn ux-btn-muted";
  if (action === "DETAIL") return "ux-btn ux-btn-muted";
  if (action === "EDIT") return "ux-btn ux-btn-muted";
  return "ux-btn ux-btn-primary";
}

export function normalizeAppointmentsPayload(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map((item) => {
      const startsAt = asDate(item.startsAt);
      const endsAt = asDate(item.endsAt);
      if (!startsAt || !endsAt) return null;
      const serviceItems = normalizeAppointmentServiceItems(item);
      const service = buildServiceSelectionLabel(serviceItems, nestedText(item.service, ["name"], "Servico"));
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
        startsAt,
        endsAt,
        status: safeText(item.status, "SCHEDULED"),
        client: nestedText(item.client, ["fullName", "name"], "Cliente"),
        clientPhone: safeText(item.clientPhone) || nestedText(item.client, ["phone"], ""),
        professional: nestedText(item.professional, ["name", "fullName"], "Profissional"),
        service,
        notes: safeText(item.notes, ""),
        origin: safeText(item.origin, "MANUAL"),
        confirmation: Boolean(item.confirmation),
        clientTags: Array.isArray(item.clientTags) ? item.clientTags : [],
        servicePrice: asNumber(
          item.totalPriceSnapshot ?? item.totalPrice ?? item.servicePrice,
          serviceItems.reduce((acc, serviceItem) => acc + asNumber(serviceItem.price), nestedNumber(item.service, ["price"])),
        ),
        serviceDurationMin: effectiveDuration,
        durationRuleLabel: safeText(item.durationRuleLabelSnapshot || item.ruleLabel),
        createdAt: asDate(item.createdAt) || startsAt,
        updatedAt: asDate(item.updatedAt) || startsAt,
        history: Array.isArray(item.history) ? item.history : [],
        isFitting: Boolean(item.isFitting),
        hasProductSale: Boolean(item.hasProductSale),
        productSalesCount: asNumber(item.productSalesCount),
        productItemsSoldCount: asNumber(item.productItemsSoldCount),
      };
    })
    .filter(Boolean);
}

export function renderAppointmentsLoading(elements) {
  elements.summary.innerHTML = Array.from({ length: 3 }, () => `<article class="ux-kpi agenda-kpi-loading"></article>`).join("");
  elements.tableBody.innerHTML = `<tr><td colspan="8" class="appts-td-loading">Carregando agendamentos...</td></tr>`;
  elements.mobileList.innerHTML = `<p class="ds-text-muted">Carregando agendamentos...</p>`;
  elements.periodSummary.textContent = "Filtrando agendamentos...";
}

export function renderAppointmentsError(elements, message) {
  const text = normalizeErrorMessage(message);
  elements.summary.innerHTML = `<div class="panel-msg panel-msg-error">${escapeHtml(text)}</div>`;
  elements.tableBody.innerHTML = `<tr><td colspan="8" class="appts-td-loading panel-msg-error">${escapeHtml(text)}</td></tr>`;
  elements.mobileList.innerHTML = `<p class="ds-text-muted">${escapeHtml(text)}</p>`;
}

export function renderAppointmentsFeedback(elements, type, message) {
  const modifier =
    type === "error" ? "panel-msg-error"
    : type === "success" ? "panel-msg-success"
    : "panel-msg-warning";
  elements.feedback.className = `panel-msg ${modifier}`;
  elements.feedback.textContent = safeText(message, "");
}

export function renderAppointmentsData(elements, items, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const periodLabel = safeText(options.periodLabel, "Periodo selecionado");
  const filterSummary = safeText(options.filterSummary, "Filtrando todos os agendamentos.");
  const todayTotal = items.filter((item) => formatDate(item.startsAt) === formatDate(now)).length;
  const confirmed = items.filter((item) => item.status === "CONFIRMED").length;
  const scheduled = items.filter((item) => item.status === "SCHEDULED").length;
  const inService = items.filter((item) => item.status === "IN_SERVICE").length;
  const completed = items.filter((item) => item.status === "COMPLETED").length;
  const lateCount = items.filter(
    (item) =>
      (item.status === "SCHEDULED" || item.status === "CONFIRMED") && item.startsAt.getTime() < now.getTime(),
  ).length;
  const next = [...items]
    .filter((item) => ["SCHEDULED", "CONFIRMED", "IN_SERVICE"].includes(item.status))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .find((item) => item.status === "IN_SERVICE" || item.startsAt.getTime() >= now.getTime());

  elements.periodSummary.textContent = `${periodLabel} | ${filterSummary}`;
  elements.summary.innerHTML = `
    <article class="ux-kpi agenda-next-card">
      <div class="ux-label">Proximo atendimento</div>
      <div class="ux-value-sm">${next ? `${formatTime(next.startsAt)} - ${escapeHtml(next.client)}` : "Sem proximo atendimento"}</div>
      <div class="ux-hint">${next ? `${escapeHtml(next.service)} com ${escapeHtml(next.professional)}` : "Nenhuma acao imediata no recorte."}</div>
    </article>
    <article class="ux-kpi">
      <div class="ux-label">Agenda do periodo</div>
      <div class="ux-value-sm">${todayTotal || items.length}</div>
      <div class="ux-hint">${confirmed} confirmados, ${scheduled} aguardando confirmacao</div>
    </article>
    <article class="ux-kpi">
      <div class="ux-label">Fluxo atual</div>
      <div class="ux-value-sm">${inService}</div>
      <div class="ux-hint">${completed} concluidos, ${lateCount} atrasados</div>
    </article>
  `;

  if (!items.length) {
    elements.empty.classList.remove("hidden");
    elements.empty.innerHTML = renderEmptyState({
      title: "Nao ha agendamentos para este periodo.",
      description: "Crie um novo horario, volte para hoje ou limpe os filtros para ampliar a busca.",
      action: `
        <div class="catalog-row-actions">
          <button type="button" id="appointmentsEmptyNew" class="ux-btn ux-btn-primary">Criar novo agendamento</button>
          <button type="button" id="appointmentsEmptyToday" class="ux-btn ux-btn-muted">Ver agenda de hoje</button>
          <button type="button" id="appointmentsEmptyClear" class="ux-btn ux-btn-muted">Limpar filtros</button>
        </div>
      `,
    });
    elements.tableWrap.classList.add("hidden");
    elements.mobileList.innerHTML = "";
    elements.tableBody.innerHTML = "";
    return;
  }

  elements.empty.classList.add("hidden");
  elements.tableWrap.classList.remove("hidden");

  elements.tableBody.innerHTML = items
    .map((item) => {
      const { flags, late, profile } = quickFlags(item, now, items);
      const itemCanCheckout = options.canCheckout !== false;
      const canNoShow = now.getTime() >= item.startsAt.getTime() + 15 * 60 * 1000;
      const actions = actionsForStatus(item.status, { canCheckout: itemCanCheckout, canEdit: options.canEdit, canNoShow });
      const primaryAction = primaryActionForStatus(item.status, { canCheckout: itemCanCheckout });
      return `
        <tr class="${late ? "appts-row-late" : ""}">
          <td class="appts-td">${formatTime(item.startsAt)}</td>
          <td class="appts-td">
            <div class="ds-cell-primary">${escapeHtml(item.client)}</div>
            <div class="ds-cell-secondary">${escapeHtml(item.clientPhone || "Sem telefone")}</div>
            ${item.hasProductSale ? `<div class="ux-badge ux-badge-success">Produto vendido</div>` : ""}
          </td>
          <td class="appts-td">${escapeHtml(item.service)}</td>
          <td class="appts-td">${escapeHtml(item.professional)}</td>
          <td class="appts-td">${item.serviceDurationMin} min</td>
          <td class="appts-td">${money(item.servicePrice)}</td>
          <td class="appts-td">
            <div class="appts-chip-group">
              ${renderStatusChip(item.status)}
              ${profileChip(profile)}
              ${flags.map((flag) => renderStatusChip(flag.status, { label: flag.label })).join("")}
            </div>
          </td>
          <td class="appts-td">
            <div class="catalog-row-actions">
              ${actions
                .map(
                  (action) =>
                    `<button data-action="${action}" data-id="${item.id}" class="${actionClass(action)} ${action === primaryAction ? "appointment-next-action" : ""}">${action === "DETAIL" && item.status === "COMPLETED" ? "Ver resumo" : actionLabel(action)}</button>`,
                )
                .join("")}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  elements.mobileList.innerHTML = items
    .map((item) => {
      const { flags, late, profile } = quickFlags(item, now, items);
      const itemCanCheckout = options.canCheckout !== false;
      const canNoShow = now.getTime() >= item.startsAt.getTime() + 15 * 60 * 1000;
      const actions = actionsForStatus(item.status, { canCheckout: itemCanCheckout, canEdit: options.canEdit, canNoShow });
      const primaryAction = primaryActionForStatus(item.status, { canCheckout: itemCanCheckout });
      return `
        <article class="ux-card appts-mobile-card ${late ? "appts-row-late" : ""}">
          <div class="appts-mobile-head">
            <div>
              <div class="ds-cell-primary">${formatTime(item.startsAt)} - ${escapeHtml(item.client)}</div>
              <div class="ds-cell-secondary">${escapeHtml(item.service)} | ${escapeHtml(item.professional)}</div>
            </div>
            ${renderStatusChip(item.status)}
          </div>
          <div class="appts-chip-group">
            ${profileChip(profile)}
            ${flags.map((flag) => renderStatusChip(flag.status, { label: flag.label })).join("")}
          </div>
          <div class="ds-cell-secondary">Telefone: ${escapeHtml(item.clientPhone || "Nao informado")} | Valor: ${money(item.servicePrice)}</div>
          ${item.hasProductSale ? `<div class="ux-badge ux-badge-success">Produto vendido (${item.productItemsSoldCount} item(ns))</div>` : ""}
          <div class="catalog-row-actions">
            ${actions
              .map(
                (action) =>
                  `<button data-action="${action}" data-id="${item.id}" class="${actionClass(action)} ${action === primaryAction ? "appointment-next-action" : ""}">${action === "DETAIL" && item.status === "COMPLETED" ? "Ver resumo" : actionLabel(action)}</button>`,
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");

  const bindActions = (root) => {
    root.querySelectorAll("[data-action][data-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (typeof options.onAction === "function") {
          await options.onAction(button.dataset.id, button.dataset.action, { openerElement: button });
        }
      });
    });
  };

  bindActions(elements.tableBody);
  bindActions(elements.mobileList);
}

export function renderAppointmentDetail(elements, item, allItems, options = {}) {
  if (!item) {
    elements.panel.innerHTML = "";
    elements.panel.classList.add("hidden");
    return;
  }

  const fromClient = allItems.filter((row) => row.clientId === item.clientId);
  const completedCount = fromClient.filter((row) => row.status === "COMPLETED").length;
  const noShowCount = fromClient.filter((row) => row.status === "NO_SHOW").length;
  const cancelledCount = fromClient.filter((row) => row.status === "CANCELLED").length;
  const profile = computeClientProfile(item, allItems);
  const delayInfo = getAppointmentDelayInfo(item);

  const itemCanCheckout = options.canCheckout !== false;
  const canNoShow = Date.now() >= item.startsAt.getTime() + 15 * 60 * 1000;
  const actions = actionsForStatus(item.status, { canCheckout: itemCanCheckout, canEdit: options.canEdit, canNoShow }).filter(
    (action) => action !== "DETAIL" && action !== "WHATSAPP",
  );
  const servicesDetail = (item.serviceItems?.length ? item.serviceItems : [{
    name: item.service,
    price: item.servicePrice,
    durationMin: item.serviceDurationMin,
  }]).map((serviceItem) => `
    <li>
      <strong>${escapeHtml(serviceItem.name || "Servico")}</strong>
      <span>${money(asNumber(serviceItem.price))} - ${asNumber(serviceItem.durationMin)} min</span>
    </li>
  `).join("");
  const historyEntries = Array.isArray(item.history) && item.history.length
    ? item.history
    : [
        { label: "Criado", at: item.createdAt },
        { label: "Ultima atualizacao", at: item.updatedAt },
      ];
  elements.panel.className = "";
  elements.panel.innerHTML = renderEntityDrawer({
    id: "appointmentEntityDrawer",
    open: true,
    title: item.client,
    subtitle: `${item.service} com ${item.professional}`,
    status: item.status,
    summary: `
      <dl class="op-summary-grid">
        <div><dt>Cliente</dt><dd>${escapeHtml(item.client)}</dd></div>
        <div><dt>Servico</dt><dd>${escapeHtml(item.service)}</dd></div>
        <div><dt>Profissional</dt><dd>${escapeHtml(item.professional)}</dd></div>
        <div><dt>Horario</dt><dd>${formatDateTime(item.startsAt)} - ${formatTime(item.endsAt)}</dd></div>
        <div><dt>Status</dt><dd>${renderStatusChip(item.status)}</dd></div>
        <div><dt>Valor</dt><dd>${money(item.servicePrice)}</dd></div>
        <div><dt>Duracao efetiva</dt><dd>${item.serviceDurationMin} min</dd></div>
        ${delayInfo?.minutes ? `<div><dt>Atraso</dt><dd>Atraso: ${delayInfo.minutes} min</dd></div>` : ""}
      </dl>
    `,
    details: `
      <div class="op-detail-list">
        <p><strong>Servicos do atendimento</strong></p>
        <ol class="appointment-services-detail">${servicesDetail}</ol>
        <p>Total: <strong>${money(item.servicePrice)}</strong> | Duracao efetiva: <strong>${item.serviceDurationMin} min</strong></p>
        ${item.durationRuleLabel ? `<p>Regra aplicada: <strong>${escapeHtml(item.durationRuleLabel)}</strong></p>` : ""}
        <p>Perfil: <strong>${profileLabel(profile)}</strong></p>
        <p>Historico do cliente no recorte: ${completedCount} concluidos, ${noShowCount} faltas, ${cancelledCount} cancelados.</p>
        <p>Produtos adicionais: <strong>${item.hasProductSale ? `sim (${item.productItemsSoldCount} item(ns))` : "nao registrados"}</strong></p>
        <p>Origem: <strong>${escapeHtml(safeText(item.origin, "MANUAL"))}</strong></p>
        <p>Observacoes: ${escapeHtml(item.notes || "Sem observacoes")}</p>
      </div>
    `,
    history: `
      <ol class="op-history-list">
        ${historyEntries
          .map((entry) => {
            const formatted = formatHistoryEntry(entry);
            return `<li><strong>${escapeHtml(formatted.label)}</strong><span>${escapeHtml(formatted.meta)}</span></li>`;
          })
          .join("")}
      </ol>
    `,
    technicalTrace: renderTechnicalTrace({
      id: item.id,
      referenceType: "APPOINTMENT",
      referenceId: item.id,
      auditEntity: "Appointment",
      auditAction: item.status,
    }),
    actions: `
      ${actions
        .map(
          (action) =>
            `<button type="button" data-drawer-appointment-action="${action}" data-id="${item.id}" class="ux-btn ${action === primaryActionForStatus(item.status, { canCheckout: itemCanCheckout }) ? "ux-btn-primary" : actionButtonTone(action)}">${action === "DETAIL" && item.status === "COMPLETED" ? "Ver resumo" : actionLabel(action)}</button>`,
        )
        .join("")}
    `,
  });
  elements.panel
    .querySelectorAll("[data-drawer-appointment-action]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        if (typeof options.onAction === "function") {
          await options.onAction(button.dataset.id, button.dataset.drawerAppointmentAction, { openerElement: button });
        }
      });
    });
  bindEntityDrawers(elements.panel);
  elements.panel.classList.remove("hidden");
}

function actionButtonTone(action) {
  if (action === "CANCELLED" || action === "NO_SHOW" || action === "REFUND") return "ux-btn-danger";
  if (action === "DELAY") return "ux-btn-muted";
  if (action === "COMPLETE") return "ux-btn-success";
  if (action === "CONFIRMED" || action === "IN_SERVICE") return "ux-btn-primary";
  return "ux-btn-muted";
}
