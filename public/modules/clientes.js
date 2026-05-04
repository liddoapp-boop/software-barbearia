import { renderPanelMessage } from "./feedback.js";
import { buildWhatsAppLinkFromPhone } from "./phone.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
}

function statusBadge(status) {
  if (status === "ACTIVE") return "bg-emerald-900/40 text-emerald-200 border-emerald-700";
  if (status === "AT_RISK") return "bg-amber-900/40 text-amber-200 border-amber-700";
  if (status === "VIP") return "bg-blue-900/40 text-blue-200 border-blue-700";
  return "bg-slate-700/50 text-slate-200 border-slate-600";
}

function statusLabel(status) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "AT_RISK") return "Em risco";
  if (status === "VIP") return "VIP";
  return "Inativo";
}

function segmentLabel(segment) {
  if (segment === "VALUE_HIGH") return "Valor alto";
  if (segment === "VALUE_MEDIUM") return "Valor medio";
  return "Valor baixo";
}

function renderWhatsAppAction(phone) {
  const parsed = buildWhatsAppLinkFromPhone(phone);
  const baseClasses =
    "inline-flex min-h-[36px] items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition";
  const icon = '<span aria-hidden="true" class="inline-flex h-4 min-w-[20px] items-center justify-center rounded bg-emerald-700 px-1 text-[10px] font-bold text-white">WA</span>';
  const desktopText = '<span class="hidden sm:inline">WhatsApp</span>';

  if (parsed.reason === "missing") {
    return `
      <button
        type="button"
        class="${baseClasses} border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
        disabled
        title="Cliente sem telefone cadastrado"
        aria-label="Cliente sem telefone cadastrado"
      >
        ${icon}
        ${desktopText}
      </button>
    `;
  }

  if (!parsed.ok) {
    return `
      <button
        type="button"
        data-clients-action="open-whatsapp-invalid"
        class="${baseClasses} border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        title="Telefone invalido para WhatsApp"
        aria-label="Telefone invalido para WhatsApp"
      >
        ${icon}
        ${desktopText}
      </button>
    `;
  }

  return `
    <a
      href="${parsed.url}"
      target="_blank"
      rel="noopener noreferrer"
      class="${baseClasses} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      title="Abrir conversa no WhatsApp"
      aria-label="Abrir conversa no WhatsApp"
    >
      ${icon}
      ${desktopText}
    </a>
  `;
}

export function renderClientsLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando indicadores de clientes...");
  }
  if (elements.automationSignals) {
    renderPanelMessage(elements.automationSignals, "Carregando sinais de automacao para clientes...");
  }
  if (elements.reactivationQueue) {
    renderPanelMessage(elements.reactivationQueue, "Analisando fila de reativacao...");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Carregando carteira de clientes...");
  }
}

export function renderClientsError(elements, message = "Falha ao carregar clientes.") {
  if (elements.summary) {
    renderPanelMessage(elements.summary, message, "error");
  }
  if (elements.automationSignals) {
    renderPanelMessage(elements.automationSignals, "Sinais de automacao indisponiveis.", "error");
  }
  if (elements.reactivationQueue) {
    renderPanelMessage(elements.reactivationQueue, "Fila de reativacao indisponivel.", "error");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Dados de clientes indisponiveis.", "error");
  }
}

export function renderClientsData(elements, payload, options = {}) {
  const summary = payload?.summary ?? {
    active: 0,
    atRisk: 0,
    inactive: 0,
    vip: 0,
    totalRevenue: 0,
    averageTicket: 0,
    totalClients: 0,
    potentialReactivationRevenue: 0,
  };
  const clients = Array.isArray(payload?.clients) ? payload.clients : [];
  const reactivationQueue = Array.isArray(payload?.reactivationQueue)
    ? payload.reactivationQueue
    : [];
  const automationSignals = payload?.automationSignals ?? {
    clientsWithRecentAutomation: 0,
    reactivationPlaybookExecutions: 0,
    recentClients: [],
  };

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2">
        <article class="ux-kpi">
          <div class="ux-label">Total de clientes</div>
          <div class="ux-value-sm">${toNumber(summary.totalClients)}</div>
        </article>
        <article class="ux-kpi">
          <div class="ux-label">Ativos</div>
          <div class="ux-value-sm text-emerald-300">${toNumber(summary.active)}</div>
        </article>
        <article class="ux-kpi">
          <div class="ux-label">Em risco</div>
          <div class="ux-value-sm text-amber-300">${toNumber(summary.atRisk)}</div>
        </article>
        <article class="ux-kpi">
          <div class="ux-label">VIP</div>
          <div class="ux-value-sm text-blue-300">${toNumber(summary.vip)}</div>
        </article>
        <article class="ux-kpi">
          <div class="ux-label">Receita</div>
          <div class="ux-value-sm">${money(summary.totalRevenue)}</div>
        </article>
        <article class="ux-kpi">
          <div class="ux-label">Potencial de reativacao</div>
          <div class="ux-value-sm text-emerald-300">${money(summary.potentialReactivationRevenue)}</div>
        </article>
      </div>
    `;
  }

  if (elements.reactivationQueue) {
    if (!reactivationQueue.length) {
      renderPanelMessage(
        elements.reactivationQueue,
        "Sem clientes criticos na fila de reativacao neste momento.",
      );
    } else {
      elements.reactivationQueue.innerHTML = `
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div class="text-sm font-semibold text-emerald-900 mb-2">Fila de Reativacao Prioritaria</div>
          <div class="space-y-2">
            ${reactivationQueue
              .slice(0, 8)
              .map(
                (item, index) => `
                <article class="rounded-lg border border-emerald-200 bg-white p-2">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-xs font-semibold text-emerald-700">Prioridade ${index + 1}</div>
                    <div class="text-xs text-emerald-700">${statusLabel(item.status)} | Score ${toNumber(item.reactivationScore).toFixed(1)}</div>
                  </div>
                  <div class="text-sm font-semibold text-gray-900 mt-1">${item.fullName}</div>
                  <div class="text-xs text-gray-600 mt-1">
                    ${item.daysWithoutReturn == null ? "Sem historico recente" : `${item.daysWithoutReturn} dias sem retorno`} | Canal: ${item.channelHint === "WHATSAPP" ? "WhatsApp" : "Ligacao"}
                  </div>
                  <div class="text-xs text-emerald-800 mt-1">Impacto estimado: ${money(item.estimatedImpact)}</div>
                  <div class="text-xs text-gray-700 mt-1">${item.recommendedAction}</div>
                </article>
              `,
              )
              .join("")}
          </div>
        </div>
      `;
    }
  }

  if (elements.automationSignals) {
    const recentClients = Array.isArray(automationSignals.recentClients)
      ? automationSignals.recentClients
      : [];
    elements.automationSignals.innerHTML = `
      <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div><span class="text-indigo-700">Clientes com automacao recente:</span> <strong class="text-indigo-900">${toNumber(automationSignals.clientsWithRecentAutomation)}</strong></div>
          <div><span class="text-indigo-700">Playbooks de reativacao:</span> <strong class="text-indigo-900">${toNumber(automationSignals.reactivationPlaybookExecutions)}</strong></div>
        </div>
        <div class="mt-2 space-y-1">
          ${
            recentClients.length
              ? recentClients
                  .slice(0, 4)
                  .map(
                    (item) => `
                      <div class="text-xs text-indigo-800">
                        ${item.fullName || "Cliente"} | ${item.lastAutomationType || "-"} | ${item.lastAutomationAt ? new Date(item.lastAutomationAt).toLocaleString("pt-BR") : "-"}
                      </div>
                    `,
                  )
                  .join("")
              : "<div class='text-xs text-indigo-800'>Sem automacoes recentes para clientes nesta janela.</div>"
          }
        </div>
      </div>
    `;
  }

  if (!elements.table) return;
  if (!clients.length) {
    if (options.hasActiveFilters) {
      renderPanelMessage(elements.table, "Nenhum cliente encontrado para os filtros atuais.");
      return;
    }
    elements.table.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p class="text-base font-semibold text-slate-700">Voce ainda nao cadastrou clientes.</p>
        <p class="text-sm text-slate-500 mt-1">Crie sua carteira para comecar agendamentos, fidelizacao e reativacao.</p>
        <button
          type="button"
          data-clients-action="add-first"
          class="mt-3 min-h-[44px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-semibold"
        >
          Adicionar primeiro cliente
        </button>
      </div>
    `;
    return;
  }

  elements.table.innerHTML = clients
    .map((client) => {
      const daysLabel =
        client.daysWithoutReturn == null ? "Sem historico de retorno" : `${client.daysWithoutReturn} dias sem voltar`;
      const tags = Array.isArray(client.tags) && client.tags.length
        ? client.tags.map((tag) => `<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">${tag}</span>`).join(" ")
        : "<span class='text-xs text-gray-400'>Sem tags</span>";
      const visitFrequencyLabel =
        client.visitFrequencyDays == null ? "Sem padrao" : `${toNumber(client.visitFrequencyDays).toFixed(1)} dias`;

      return `
        <article class="ux-card">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <strong class="text-base text-slate-100">${client.fullName}</strong>
              <div class="text-sm text-slate-300 mt-1">${client.phone || "Telefone nao informado"}</div>
            </div>
            <div class="flex items-center gap-2">
              ${renderWhatsAppAction(client.phone)}
              <span class="ux-badge ${statusBadge(client.status)}">${statusLabel(client.status)}</span>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">${tags}</div>
          <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-300">
            <div><span class="text-slate-400">Segmento</span><br/><strong class="text-slate-100">${segmentLabel(client.segment)}</strong></div>
            <div><span class="text-slate-400">Ultima visita</span><br/><strong class="text-slate-100">${client.lastVisitAt ? new Date(client.lastVisitAt).toLocaleDateString("pt-BR") : "-"}</strong></div>
            <div><span class="text-slate-400">Sem retorno</span><br/><strong class="text-slate-100">${daysLabel}</strong></div>
            <div><span class="text-slate-400">Impacto estimado</span><br/><strong class="text-emerald-300">${money(client.estimatedReactivationImpact)}</strong></div>
          </div>
          <div class="text-xs text-slate-300 mt-2">${client.recommendedAction || "Sem acao recomendada."}</div>
        </article>
      `;
    })
    .join("");
}
