import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";

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

function actionsForStatus(status) {
  if (status === "SCHEDULED" || status === "CONFIRMED" || status === "IN_SERVICE") {
    return ["CANCELLED", "DETAIL", "WHATSAPP"];
  }
  if (status === "COMPLETED") return ["REFUND", "DETAIL", "WHATSAPP"];
  return ["DETAIL", "WHATSAPP"];
}

function primaryActionForStatus(status) {
  if (status === "SCHEDULED" || status === "CONFIRMED" || status === "IN_SERVICE") return "CANCELLED";
  if (status === "COMPLETED") return "REFUND";
  return "DETAIL";
}

function actionLabel(action) {
  if (action === "CANCELLED") return "Cancelar";
  if (action === "DETAIL") return "Detalhes";
  if (action === "WHATSAPP") return "WhatsApp";
  if (action === "REFUND") return "Estornar atendimento";
  return action;
}

function actionClass(action) {
  if (action === "COMPLETE") return "ux-btn ux-btn-success";
  if (action === "CANCELLED") return "ux-btn ux-btn-danger";
  if (action === "NO_SHOW") return "ux-btn ux-btn-danger";
  if (action === "REFUND") return "ux-btn ux-btn-muted";
  if (action === "WHATSAPP") return "ux-btn ux-btn-muted";
  if (action === "DETAIL") return "ux-btn ux-btn-muted";
  return "ux-btn ux-btn-primary";
}

export function normalizeAppointmentsPayload(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .map((item) => {
      const startsAt = asDate(item.startsAt);
      const endsAt = asDate(item.endsAt);
      if (!startsAt || !endsAt) return null;
      return {
        id: safeText(item.id),
        unitId: safeText(item.unitId),
        clientId: safeText(item.clientId),
        professionalId: safeText(item.professionalId),
        serviceId: safeText(item.serviceId),
        startsAt,
        endsAt,
        status: safeText(item.status, "SCHEDULED"),
        client: safeText(item.client, "Cliente"),
        clientPhone: safeText(item.clientPhone, ""),
        professional: safeText(item.professional, "Profissional"),
        service: safeText(item.service, "Servico"),
        notes: safeText(item.notes, ""),
        origin: safeText(item.origin, "MANUAL"),
        confirmation: Boolean(item.confirmation),
        clientTags: Array.isArray(item.clientTags) ? item.clientTags : [],
        servicePrice: asNumber(item.servicePrice),
        serviceDurationMin: asNumber(item.serviceDurationMin),
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
  elements.summary.innerHTML = `<div class="panel-msg panel-msg-error">${text}</div>`;
  elements.tableBody.innerHTML = `<tr><td colspan="8" class="appts-td-loading panel-msg-error">${text}</td></tr>`;
  elements.mobileList.innerHTML = `<p class="ds-text-muted">${text}</p>`;
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
      <div class="ux-value-sm">${next ? `${formatTime(next.startsAt)} - ${next.client}` : "Sem proximo atendimento"}</div>
      <div class="ux-hint">${next ? `${next.service} com ${next.professional}` : "Nenhuma acao imediata no recorte."}</div>
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
      const actions = actionsForStatus(item.status);
      const primaryAction = primaryActionForStatus(item.status);
      return `
        <tr class="${late ? "appts-row-late" : ""}">
          <td class="appts-td">${formatTime(item.startsAt)}</td>
          <td class="appts-td">
            <div class="ds-cell-primary">${item.client}</div>
            <div class="ds-cell-secondary">${item.clientPhone || "Sem telefone"}</div>
            ${item.hasProductSale ? `<div class="ux-badge ux-badge-success">Produto vendido</div>` : ""}
          </td>
          <td class="appts-td">${item.service}</td>
          <td class="appts-td">${item.professional}</td>
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
                    `<button data-action="${action}" data-id="${item.id}" class="${actionClass(action)} ${action === primaryAction ? "appointment-next-action" : ""}">${actionLabel(action)}</button>`,
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
      const actions = actionsForStatus(item.status);
      const primaryAction = primaryActionForStatus(item.status);
      return `
        <article class="ux-card appts-mobile-card ${late ? "appts-row-late" : ""}">
          <div class="appts-mobile-head">
            <div>
              <div class="ds-cell-primary">${formatTime(item.startsAt)} - ${item.client}</div>
              <div class="ds-cell-secondary">${item.service} | ${item.professional}</div>
            </div>
            ${renderStatusChip(item.status)}
          </div>
          <div class="appts-chip-group">
            ${profileChip(profile)}
            ${flags.map((flag) => renderStatusChip(flag.status, { label: flag.label })).join("")}
          </div>
          <div class="ds-cell-secondary">Telefone: ${item.clientPhone || "Nao informado"} | Valor: ${money(item.servicePrice)}</div>
          ${item.hasProductSale ? `<div class="ux-badge ux-badge-success">Produto vendido (${item.productItemsSoldCount} item(ns))</div>` : ""}
          <div class="catalog-row-actions">
            ${actions
              .map(
                (action) =>
                  `<button data-action="${action}" data-id="${item.id}" class="${actionClass(action)} ${action === primaryAction ? "appointment-next-action" : ""}">${actionLabel(action)}</button>`,
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
          await options.onAction(button.dataset.id, button.dataset.action);
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

  const actions = actionsForStatus(item.status).filter((action) => action !== "DETAIL" && action !== "WHATSAPP");
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
        <div><dt>Cliente</dt><dd>${item.client}</dd></div>
        <div><dt>Servico</dt><dd>${item.service}</dd></div>
        <div><dt>Profissional</dt><dd>${item.professional}</dd></div>
        <div><dt>Horario</dt><dd>${formatDateTime(item.startsAt)} - ${formatTime(item.endsAt)}</dd></div>
        <div><dt>Status</dt><dd>${renderStatusChip(item.status)}</dd></div>
        <div><dt>Valor</dt><dd>${money(item.servicePrice)}</dd></div>
      </dl>
    `,
    details: `
      <div class="op-detail-list">
        <p>Perfil: <strong>${profileLabel(profile)}</strong></p>
        <p>Historico do cliente no recorte: ${completedCount} concluidos, ${noShowCount} faltas, ${cancelledCount} cancelados.</p>
        <p>Produtos adicionais: <strong>${item.hasProductSale ? `sim (${item.productItemsSoldCount} item(ns))` : "nao registrados"}</strong></p>
        <p>Origem: <strong>${safeText(item.origin, "MANUAL")}</strong></p>
        <p>Observacoes: ${item.notes || "Sem observacoes"}</p>
      </div>
    `,
    history: `
      <ol class="op-history-list">
        ${historyEntries
          .map((entry) => {
            const label = safeText(entry.label || entry.action || entry.status || entry.type, "Movimento");
            const at = asDate(entry.at || entry.createdAt || entry.timestamp || entry.date);
            return `<li><strong>${label}</strong><span>${at ? formatDateTime(at) : "Sem data registrada"}</span></li>`;
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
            `<button type="button" data-drawer-appointment-action="${action}" data-id="${item.id}" class="ux-btn ${action === primaryActionForStatus(item.status) ? "ux-btn-primary" : actionButtonTone(action)}">${actionLabel(action)}</button>`,
        )
        .join("")}
    `,
  });
  elements.panel
    .querySelectorAll("[data-drawer-appointment-action]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        if (typeof options.onAction === "function") {
          await options.onAction(button.dataset.id, button.dataset.drawerAppointmentAction);
        }
      });
    });
  bindEntityDrawers(elements.panel);
  elements.panel.classList.remove("hidden");
}

function actionButtonTone(action) {
  if (action === "CANCELLED" || action === "NO_SHOW" || action === "REFUND") return "ux-btn-danger";
  if (action === "COMPLETE") return "ux-btn-success";
  return "ux-btn-muted";
}
