import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";
import { buildWhatsAppLinkFromPhone } from "./phone.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return toNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "Ativo";
  if (normalized === "AT_RISK") return "Em risco";
  if (normalized === "INACTIVE") return "Inativo";
  if (normalized === "VIP") return "VIP";
  if (normalized === "NEW") return "Novo";
  if (normalized === "RECURRING") return "Recorrente";
  return "Status";
}

function segmentLabel(segment) {
  const normalized = String(segment || "").toUpperCase();
  if (normalized === "VALUE_HIGH") return "Maior valor";
  if (normalized === "VALUE_MEDIUM") return "Valor medio";
  if (normalized === "VALUE_LOW") return "Valor baixo";
  return "Sem segmento";
}

function relationshipSignal(client = {}) {
  const status = String(client.status || "").toUpperCase();
  if (status === "VIP") return "VIP com alto potencial de recorrencia.";
  if (status === "AT_RISK") return "Cliente sem retorno dentro do ciclo esperado.";
  if (status === "INACTIVE") return "Cliente com potencial de reativacao.";
  if (toNumber(client.visits) > 1) return "Cliente recorrente em acompanhamento.";
  return "Cliente novo ou com pouco historico.";
}

function actionLabel(client = {}) {
  const status = String(client.status || "").toUpperCase();
  if (status === "VIP") return "Oferecer combo";
  if (status === "AT_RISK") return "Agendar retorno";
  if (status === "INACTIVE") return "Reativar cliente";
  if (!client.phone) return "Atualizar cadastro";
  if (toNumber(client.visits) <= 1) return "Chamar no WhatsApp";
  return "Manter relacionamento";
}

function actionDescription(client = {}) {
  const clean = String(client.recommendedAction || "").trim();
  if (clean) return clean;
  const status = String(client.status || "").toUpperCase();
  if (status === "VIP") return "Cliente valioso: manter contato ativo e sugerir proxima experiencia.";
  if (status === "AT_RISK") return "Contato manual para oferecer horario de retorno.";
  if (status === "INACTIVE") return "Contato manual para validar interesse e reativar relacionamento.";
  return "Acompanhar relacionamento e oferecer manutencao quando fizer sentido.";
}

function renderKpi(title, value, subtitle = "", tone = "") {
  return `
    <article class="ux-kpi client-kpi">
      <div class="ux-label">${escapeHtml(title)}</div>
      <div class="ux-value-sm ${tone}">${escapeHtml(value)}</div>
      ${subtitle ? `<div class="ux-hint">${escapeHtml(subtitle)}</div>` : ""}
    </article>
  `;
}

function renderWhatsAppAction(phone, label = "WhatsApp", clientId = "") {
  const parsed = buildWhatsAppLinkFromPhone(phone);
  const attrs = clientId ? `data-client-id="${escapeHtml(clientId)}"` : "";
  const icon = '<span aria-hidden="true" class="client-wa-mark">WA</span>';
  if (parsed.reason === "missing") {
    return `
      <button type="button" class="client-wa-action is-disabled" disabled title="Cliente sem telefone cadastrado">
        ${icon}<span>${escapeHtml(label)}</span>
      </button>
    `;
  }
  if (!parsed.ok) {
    return `
      <button type="button" data-clients-action="open-whatsapp-invalid" ${attrs} class="client-wa-action is-warning" title="Telefone invalido para WhatsApp">
        ${icon}<span>${escapeHtml(label)}</span>
      </button>
    `;
  }
  return `
    <a href="${escapeHtml(parsed.url)}" target="_blank" rel="noopener noreferrer" ${attrs} class="client-wa-action" title="Abrir conversa no WhatsApp">
      ${icon}<span>${escapeHtml(label)}</span>
    </a>
  `;
}

function renderTagChips(tags = []) {
  const normalized = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!normalized.length) return `<span class="text-xs text-slate-400">Sem tags comerciais</span>`;
  return normalized
    .slice(0, 5)
    .map((tag) => renderStatusChip(tag, { label: statusLabel(tag) }))
    .join("");
}

function normalizeClients(payload = {}) {
  return Array.isArray(payload.clients) ? payload.clients : [];
}

function summarizePriority(clients = []) {
  return clients.find((client) => client.status === "AT_RISK" || client.status === "INACTIVE")
    || clients.find((client) => client.status === "VIP")
    || clients[0]
    || null;
}

function renderClientCard(client = {}) {
  const clientId = client.clientId || client.id || "";
  const daysWithoutReturn =
    client.daysWithoutReturn == null
      ? "Sem visita registrada"
      : `${toNumber(client.daysWithoutReturn)} dias sem retorno`;
  const status = client.status || "NEW";
  return `
    <article class="client-row client-row-${escapeHtml(String(status).toLowerCase())}">
      <div class="client-row-main">
        <div class="client-row-identity">
          <div class="client-row-meta">
            ${renderStatusChip(status, { label: statusLabel(status) })}
            ${client.segment ? renderStatusChip("INFO", { label: segmentLabel(client.segment) }) : ""}
            ${toNumber(client.visits) > 1 ? renderStatusChip("RECURRING") : ""}
          </div>
          <strong>${escapeHtml(client.fullName || "Cliente")}</strong>
          <span>${escapeHtml(client.phone || "Telefone nao informado")}</span>
        </div>
        <div class="client-row-value">
          <span>Valor gerado</span>
          <strong>${escapeHtml(money(client.ltv || client.revenue || 0))}</strong>
          <small>Ticket ${escapeHtml(money(client.averageTicket || 0))}</small>
        </div>
      </div>
      <div class="client-row-facts">
        <div><span>Ultima visita</span><strong>${escapeHtml(formatDate(client.lastVisitAt))}</strong></div>
        <div><span>Recencia</span><strong>${escapeHtml(daysWithoutReturn)}</strong></div>
        <div><span>Sinal comercial</span><strong>${escapeHtml(relationshipSignal(client))}</strong></div>
        <div><span>Proxima acao</span><strong>${escapeHtml(actionLabel(client))}</strong></div>
      </div>
      <div class="client-row-action-strip">
        <p>${escapeHtml(actionDescription(client))}</p>
        <div class="client-row-actions">
          ${renderWhatsAppAction(client.phone, "WhatsApp", clientId)}
          <button type="button" data-clients-action="detail" data-client-id="${escapeHtml(clientId)}" class="ux-btn ux-btn-muted">Ver detalhes</button>
        </div>
      </div>
    </article>
  `;
}

function renderAttentionQueue(queue = []) {
  if (!queue.length) {
    return `
      <section class="client-priority-strip">
        <span>Fila comercial</span>
        <strong>Nenhum cliente critico para reativacao neste filtro.</strong>
      </section>
    `;
  }
  return `
    <section class="client-priority-strip">
      <span>Prioridade comercial</span>
      <strong>${escapeHtml(queue[0].fullName || "Cliente")} merece contato primeiro: ${escapeHtml(actionLabel(queue[0]))}.</strong>
    </section>
  `;
}

export function renderClientsLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando carteira de clientes...");
  }
  if (elements.automationSignals) elements.automationSignals.innerHTML = "";
  if (elements.reactivationQueue) {
    renderPanelMessage(elements.reactivationQueue, "Organizando fila comercial...");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Preparando historico progressivo...");
  }
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderClientsError(elements, message = "Falha ao carregar clientes.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.automationSignals) elements.automationSignals.innerHTML = "";
  if (elements.reactivationQueue) {
    renderPanelMessage(elements.reactivationQueue, "Fila comercial indisponivel.", "error");
  }
  if (elements.table) renderPanelMessage(elements.table, "Dados de clientes indisponiveis.", "error");
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderClientsData(elements, payload, options = {}) {
  const summary = payload?.summary ?? {};
  const clients = normalizeClients(payload);
  const reactivationQueue = Array.isArray(payload?.reactivationQueue) ? payload.reactivationQueue : [];
  const automationSignals = payload?.automationSignals ?? {};
  const priority = summarizePriority(clients);

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2">
        ${renderKpi("Ativos", String(toNumber(summary.active)), "Prontos para relacionamento", "text-emerald-700")}
        ${renderKpi("Em risco", String(toNumber(summary.atRisk)), "Precisam de retorno", "text-amber-700")}
        ${renderKpi("Inativos", String(toNumber(summary.inactive)), "Potencial de reativacao", "text-slate-500")}
        ${renderKpi("VIP", String(toNumber(summary.vip)), "Maior prioridade comercial", "text-indigo-700")}
        ${renderKpi("Ticket medio", money(summary.averageTicket), "Historico do filtro")}
        ${renderKpi("Potencial", money(summary.potentialReactivationRevenue), "Reativacao estimada", "text-emerald-700")}
      </div>
      ${
        priority
          ? `<div class="client-next-decision">
              <span>Decisao sugerida</span>
              <strong>${escapeHtml(priority.fullName)}: ${escapeHtml(actionLabel(priority))}</strong>
              <p>${escapeHtml(actionDescription(priority))}</p>
            </div>`
          : ""
      }
    `;
  }

  if (elements.reactivationQueue) {
    elements.reactivationQueue.innerHTML = renderAttentionQueue(reactivationQueue);
  }

  if (elements.automationSignals) {
    const count = toNumber(automationSignals.clientsWithRecentAutomation);
    const playbooks = toNumber(automationSignals.reactivationPlaybookExecutions);
    elements.automationSignals.innerHTML = `
      <details class="client-progressive-panel">
        <summary>Sinais comerciais preservados</summary>
        <div class="op-detail-list">
          <p>${count} cliente(s) tiveram automacao recente registrada.</p>
          <p>${playbooks} execucao(oes) de playbook de reativacao aparecem neste recorte.</p>
          <p>Esses sinais orientam a decisao, mas nao disparam mensagem automaticamente.</p>
        </div>
      </details>
    `;
  }

  if (!elements.table) return;
  if (!clients.length) {
    elements.table.innerHTML = renderEmptyState({
      title: options.hasActiveFilters ? "Nenhum cliente encontrado." : "Voce ainda nao cadastrou clientes.",
      description: options.hasActiveFilters
        ? "Ajuste busca, status, segmento ou periodo para ampliar a carteira."
        : "Crie sua carteira para comecar agendamentos, vendas, fidelizacao e reativacao.",
      action: renderPrimaryAction({
        label: "Adicionar primeiro cliente",
        attrs: { "data-clients-action": "add-first" },
      }),
    });
    return;
  }

  elements.table.innerHTML = `
    <section class="client-relationship-list">
      ${clients.map(renderClientCard).join("")}
    </section>
  `;
}

function renderOperationalHistory(client = {}, context = {}) {
  const appointments = Array.isArray(context.appointments) ? context.appointments : [];
  const productSales = Array.isArray(context.productSales) ? context.productSales : [];
  const recentAppointments = appointments.slice(0, 5);
  const recentSales = productSales.slice(0, 5);
  const facts = [
    client.lastVisitAt
      ? "Este cliente realizou atendimento recentemente."
      : "Ainda nao ha atendimento concluido preservado neste recorte.",
    client.daysWithoutReturn != null && toNumber(client.daysWithoutReturn) > 40
      ? "Cliente sem retorno ha muitos dias."
      : "",
    toNumber(client.ltv) > 0 ? "Cliente com historico de valor gerado." : "",
    String(client.status).toUpperCase() === "INACTIVE" ? "Cliente com potencial de reativacao." : "",
  ].filter(Boolean);

  return `
    <details class="client-progressive-panel" open>
      <summary>Leitura operacional</summary>
      <div class="op-detail-list">${facts.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>
    </details>
    <details class="client-progressive-panel">
      <summary>Agendamentos e servicos recentes</summary>
      ${
        recentAppointments.length
          ? `<ol class="op-history-list">
              ${recentAppointments
                .map(
                  (item) =>
                    `<li><strong>${escapeHtml(item.service || "Atendimento")}</strong><span>${escapeHtml(formatDateTime(item.startsAt))} - ${escapeHtml(item.status || "Status")}</span></li>`,
                )
                .join("")}
            </ol>`
          : `<p class="text-sm text-slate-400">Sem agendamentos recentes disponiveis neste recorte.</p>`
      }
    </details>
    <details class="client-progressive-panel">
      <summary>Produtos comprados e devolucoes</summary>
      ${
        recentSales.length
          ? `<ol class="op-history-list">
              ${recentSales
                .map(
                  (sale) =>
                    `<li><strong>${escapeHtml(sale.itemsSummary || "Compra de produto")}</strong><span>${escapeHtml(sale.soldAtLabel || "-")} - ${escapeHtml(sale.amount || "")}</span></li>`,
                )
                .join("")}
            </ol>`
          : `<p class="text-sm text-slate-400">Sem compras de produtos vinculadas no historico carregado.</p>`
      }
    </details>
  `;
}

function renderRelationshipLayer(client = {}) {
  return `
    <dl class="op-summary-grid">
      <div><dt>Recorrencia</dt><dd>${escapeHtml(client.visitFrequencyDays == null ? "Sem padrao definido" : `${toNumber(client.visitFrequencyDays).toFixed(1)} dias`)}</dd></div>
      <div><dt>Risco</dt><dd>${escapeHtml(statusLabel(client.status))}</dd></div>
      <div><dt>Profissional preferido</dt><dd>${escapeHtml(client.preferredProfessionalName || "Nao identificado")}</dd></div>
      <div><dt>Preferencias</dt><dd>${escapeHtml(client.preferences || "Sem preferencias registradas")}</dd></div>
      <div><dt>Observacoes</dt><dd>${escapeHtml(client.notes || "Sem observacoes")}</dd></div>
      <div><dt>Tags comerciais</dt><dd><span class="client-tag-inline">${renderTagChips(client.tags)}</span></dd></div>
    </dl>
  `;
}

export function renderClientDrawer(elements, client = {}, context = {}) {
  if (!elements.drawerHost || !(client.clientId || client.id)) return;
  const clientId = client.clientId || client.id;
  const status = client.status || "NEW";
  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Nome</dt><dd>${escapeHtml(client.fullName || "Cliente")}</dd></div>
      <div><dt>Telefone</dt><dd>${escapeHtml(client.phone || "Nao informado")}</dd></div>
      <div><dt>E-mail</dt><dd>${escapeHtml(client.email || "Nao informado")}</dd></div>
      <div><dt>Status</dt><dd>${renderStatusChip(status, { label: statusLabel(status) })}</dd></div>
      <div><dt>Tags</dt><dd><span class="client-tag-inline">${renderTagChips(client.tags)}</span></dd></div>
      <div><dt>Ultima visita</dt><dd>${escapeHtml(formatDate(client.lastVisitAt))}</dd></div>
      <div><dt>Valor total</dt><dd>${escapeHtml(money(client.ltv || client.revenue || 0))}</dd></div>
      <div><dt>Proxima acao</dt><dd>${escapeHtml(actionLabel(client))}</dd></div>
    </dl>
    <p class="client-drawer-action-note">${escapeHtml(actionDescription(client))}</p>
  `;

  const actions = `
    ${renderWhatsAppAction(client.phone, "Chamar no WhatsApp", clientId)}
    <button type="button" data-clients-action="schedule" data-client-id="${escapeHtml(clientId)}" class="ux-btn ux-btn-primary">Criar agendamento</button>
    <button type="button" class="ux-btn ux-btn-muted" disabled title="Edicao completa depende do fluxo de atualizacao">Atualizar cadastro</button>
    <button type="button" data-clients-action="open-financial" data-client-id="${escapeHtml(clientId)}" class="ux-btn ux-btn-muted">Ver historico financeiro</button>
  `;

  const technicalTrace = renderTechnicalTrace({
    clientId,
    businessId: client.businessId,
    unitId: client.unitId || context.unitId,
    customerId: client.customerId,
    preferredProfessionalId: client.preferredProfessionalId,
    status,
    tags: client.tags,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    auditLogId: client.auditLogId,
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "clientDrawer",
    title: client.fullName || "Cliente",
    subtitle: `${statusLabel(status)} - ${client.phone || "telefone nao informado"}`,
    status,
    open: true,
    summary,
    details: renderOperationalHistory(client, context),
    history: renderRelationshipLayer(client),
    technicalTrace,
    actions,
  });
  elements.drawerHost.classList.remove("hidden");
  bindEntityDrawers(elements.drawerHost);
  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
