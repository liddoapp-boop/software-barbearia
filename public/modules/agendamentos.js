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

function statusClass(status) {
  if (status === "SCHEDULED") return "bg-slate-100 text-slate-700";
  if (status === "CONFIRMED") return "bg-blue-100 text-blue-700";
  if (status === "IN_SERVICE") return "bg-amber-100 text-amber-700";
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (status === "CANCELLED") return "bg-red-100 text-red-700";
  if (status === "NO_SHOW") return "bg-rose-100 text-rose-700";
  return "bg-gray-100 text-gray-700";
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

function profileClass(profile) {
  if (profile === "VIP") return "bg-yellow-100 text-yellow-800";
  if (profile === "EM_RISCO") return "bg-red-100 text-red-700";
  if (profile === "INATIVO") return "bg-gray-200 text-gray-700";
  if (profile === "RECORRENTE") return "bg-indigo-100 text-indigo-700";
  return "bg-emerald-100 text-emerald-700";
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

  if (late) flags.push({ label: "Atrasado", className: "bg-amber-100 text-amber-700" });
  if (pendingConfirmation) {
    flags.push({
      label: "Pendente de confirmacao",
      className: "bg-blue-100 text-blue-700",
    });
  }
  if (profile === "VIP") flags.push({ label: "VIP", className: "bg-yellow-100 text-yellow-800" });
  if (profile === "EM_RISCO") flags.push({ label: "Cliente em risco", className: "bg-red-100 text-red-700" });
  if (upcoming) flags.push({ label: "Horario proximo", className: "bg-emerald-100 text-emerald-700" });
  if (hasNotes) flags.push({ label: "Tem observacao", className: "bg-violet-100 text-violet-700" });

  return { flags, late, profile };
}

function actionsForStatus(status) {
  if (status === "SCHEDULED") return ["CONFIRMED", "RESCHEDULE", "CANCELLED", "DETAIL", "WHATSAPP"];
  if (status === "CONFIRMED") {
    return ["IN_SERVICE", "RESCHEDULE", "CANCELLED", "NO_SHOW", "DETAIL", "WHATSAPP"];
  }
  if (status === "IN_SERVICE") return ["COMPLETE", "DETAIL", "WHATSAPP"];
  if (status === "COMPLETED") return ["REFUND", "DETAIL", "WHATSAPP"];
  return ["DETAIL", "WHATSAPP"];
}

function primaryActionForStatus(status) {
  if (status === "SCHEDULED") return "CONFIRMED";
  if (status === "CONFIRMED") return "IN_SERVICE";
  if (status === "IN_SERVICE") return "COMPLETE";
  if (status === "COMPLETED") return "REFUND";
  return "DETAIL";
}

function actionLabel(action) {
  if (action === "CONFIRMED") return "Confirmar";
  if (action === "IN_SERVICE") return "Iniciar";
  if (action === "COMPLETE") return "Concluir";
  if (action === "RESCHEDULE") return "Remarcar";
  if (action === "CANCELLED") return "Cancelar";
  if (action === "NO_SHOW") return "Falta";
  if (action === "DETAIL") return "Detalhes";
  if (action === "WHATSAPP") return "WhatsApp";
  if (action === "REFUND") return "Estornar atendimento";
  return action;
}

function actionClass(action) {
  if (action === "COMPLETE") return "bg-emerald-600 hover:bg-emerald-700 text-white";
  if (action === "CANCELLED") return "bg-red-600 hover:bg-red-700 text-white";
  if (action === "NO_SHOW") return "bg-rose-600 hover:bg-rose-700 text-white";
  if (action === "REFUND") return "bg-amber-600 hover:bg-amber-700 text-white";
  if (action === "WHATSAPP") return "bg-green-600 hover:bg-green-700 text-white";
  if (action === "DETAIL") return "bg-slate-100 hover:bg-slate-200 text-slate-700";
  return "bg-slate-900 hover:bg-slate-800 text-white";
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
  elements.summary.innerHTML = Array.from({ length: 8 }, () => `
    <article class="rounded-xl border border-slate-200 bg-white p-3 animate-pulse">
      <div class="h-3 w-24 bg-slate-200 rounded"></div>
      <div class="h-7 w-10 bg-slate-200 rounded mt-2"></div>
      <div class="h-3 w-32 bg-slate-200 rounded mt-2"></div>
    </article>
  `).join("");
  elements.tableBody.innerHTML = `
    <tr><td colspan="8" class="p-4 text-sm text-slate-500">Carregando agendamentos...</td></tr>
  `;
  elements.mobileList.innerHTML = "<p class='text-sm text-slate-500'>Carregando agendamentos...</p>";
  elements.periodSummary.textContent = "Filtrando agendamentos...";
}

export function renderAppointmentsError(elements, message) {
  const text = normalizeErrorMessage(message);
  elements.summary.innerHTML = `
    <article class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 col-span-full">
      ${text}
    </article>
  `;
  elements.tableBody.innerHTML = `
    <tr><td colspan="8" class="p-4 text-sm text-red-700">${text}</td></tr>
  `;
  elements.mobileList.innerHTML = `<p class='text-sm text-red-700'>${text}</p>`;
}

export function renderAppointmentsFeedback(elements, type, message) {
  const classes =
    type === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : type === "success"
        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
        : "bg-blue-50 border-blue-200 text-blue-700";
  elements.feedback.className = `rounded-xl border px-3 py-2 text-sm ${classes}`;
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
        <div class="flex flex-wrap justify-center gap-2">
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
        <tr class="${late ? "bg-amber-50" : "bg-white"} border-b border-slate-100">
          <td class="px-3 py-3 text-sm font-semibold text-slate-800">${formatTime(item.startsAt)}</td>
          <td class="px-3 py-3 text-sm text-slate-700">
            <div class="font-semibold">${item.client}</div>
            <div class="text-xs text-slate-500">${item.clientPhone || "Sem telefone"}</div>
            ${
              item.hasProductSale
                ? `<div class="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><span class="inline-flex h-4 min-w-[20px] items-center justify-center rounded bg-emerald-700 px-1 text-[9px] font-bold text-white">SALE</span> Produto vendido</div>`
                : ""
            }
          </td>
          <td class="px-3 py-3 text-sm text-slate-700">${item.service}</td>
          <td class="px-3 py-3 text-sm text-slate-700">${item.professional}</td>
          <td class="px-3 py-3 text-sm text-slate-700">${item.serviceDurationMin} min</td>
          <td class="px-3 py-3 text-sm text-slate-700">${money(item.servicePrice)}</td>
          <td class="px-3 py-3">
            <div class="flex flex-wrap gap-1">
              ${renderStatusChip(item.status)}
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${profileClass(profile)}">${profileLabel(profile)}</span>
              ${flags.map((flag) => `<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${flag.className}">${flag.label}</span>`).join("")}
            </div>
          </td>
          <td class="px-3 py-3">
            <div class="flex flex-wrap gap-1">
              ${actions
                .map(
                  (action) =>
                    `<button data-action="${action}" data-id="${item.id}" class="min-h-[36px] rounded-lg px-2 py-1 text-xs font-semibold ${actionClass(action)} ${action === primaryAction ? "appointment-next-action" : ""}">${actionLabel(action)}</button>`,
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
        <article class="rounded-xl border ${late ? "border-amber-300" : "border-slate-200"} bg-white p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-sm font-bold text-slate-900">${formatTime(item.startsAt)} - ${item.client}</div>
              <div class="text-xs text-slate-500">${item.service} | ${item.professional}</div>
            </div>
            ${renderStatusChip(item.status)}
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${profileClass(profile)}">${profileLabel(profile)}</span>
            ${flags.map((flag) => `<span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${flag.className}">${flag.label}</span>`).join("")}
          </div>
          <div class="mt-2 text-xs text-slate-500">Telefone: ${item.clientPhone || "Nao informado"} | Valor: ${money(item.servicePrice)}</div>
          ${
            item.hasProductSale
              ? `<div class="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><span class="inline-flex h-4 min-w-[20px] items-center justify-center rounded bg-emerald-700 px-1 text-[9px] font-bold text-white">SALE</span> Produto vendido (${item.productItemsSoldCount} item(ns))</div>`
              : ""
          }
          <div class="mt-2 flex flex-wrap gap-1">
            ${actions
              .map(
                (action) =>
                  `<button data-action="${action}" data-id="${item.id}" class="min-h-[40px] rounded-lg px-2 py-1 text-xs font-semibold ${actionClass(action)} ${action === primaryAction ? "appointment-next-action" : ""}">${actionLabel(action)}</button>`,
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
