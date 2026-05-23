import {
  bindEntityDrawers,
  renderEmptyState,
  renderPrimaryAction,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";
import { buildWhatsAppLinkFromPhone } from "./phone.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return toNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(status) {
  const n = String(status || "").toUpperCase();
  if (n === "ACTIVE") return "Ativo";
  if (n === "AT_RISK") return "Em risco";
  if (n === "INACTIVE") return "Inativo";
  if (n === "VIP") return "VIP";
  if (n === "NEW") return "Novo";
  if (n === "RECURRING") return "Recorrente";
  return "Status";
}

function segmentLabel(segment) {
  const n = String(segment || "").toUpperCase();
  if (n === "VALUE_HIGH") return "Maior valor";
  if (n === "VALUE_MEDIUM") return "Valor médio";
  if (n === "VALUE_LOW") return "Valor baixo";
  return "Sem segmento";
}

function actionLabel(client = {}) {
  const s = String(client.status || "").toUpperCase();
  if (s === "VIP") return "Oferecer combo";
  if (s === "AT_RISK") return "Agendar retorno";
  if (s === "INACTIVE") return "Reativar cliente";
  if (!client.phone) return "Atualizar cadastro";
  if (toNumber(client.visits) <= 1) return "Chamar no WhatsApp";
  return "Manter relacionamento";
}

function actionDescription(client = {}) {
  const clean = String(client.recommendedAction || "").trim();
  if (clean) return clean;
  const s = String(client.status || "").toUpperCase();
  if (s === "VIP") return "Cliente valioso: manter contato ativo e sugerir próxima experiência.";
  if (s === "AT_RISK") return "Contato manual para oferecer horário de retorno.";
  if (s === "INACTIVE") return "Contato manual para validar interesse e reativar relacionamento.";
  return "Acompanhar relacionamento e oferecer manutenção quando fizer sentido.";
}

function formatPhone(phone) {
  if (!phone) return "Sem telefone";
  const d = String(phone).replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function clientInitials(fullName = "") {
  return (
    String(fullName)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function normalizeClients(payload = {}) {
  return Array.isArray(payload.clients) ? payload.clients : [];
}

const WA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

function renderCompactWa(phone, clientId = "") {
  if (!phone) {
    return `<button type="button" class="cl-wa-icon cl-wa-icon-disabled" disabled title="Sem telefone">${WA_SVG}</button>`;
  }
  const parsed = buildWhatsAppLinkFromPhone(phone);
  if (!parsed.ok) {
    return `<button type="button" data-clients-action="open-whatsapp-invalid" data-client-id="${escapeHtml(clientId)}" class="cl-wa-icon" title="Telefone inválido">${WA_SVG}</button>`;
  }
  return `<a href="${escapeHtml(parsed.url)}" target="_blank" rel="noopener noreferrer" class="cl-wa-icon" title="Abrir WhatsApp">${WA_SVG}</a>`;
}

function renderTagChips(tags = []) {
  const normalized = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!normalized.length) return `<span class="cl-empty-text">Sem tags</span>`;
  return normalized
    .slice(0, 6)
    .map((tag) => `<span class="cl-chip cl-chip-neutral">${escapeHtml(statusLabel(tag))}</span>`)
    .join("");
}

function renderClientCard(client = {}) {
  const clientId = client.clientId || client.id || "";
  const status = client.status || "NEW";
  const statusKey = String(status).toLowerCase();
  const initials = clientInitials(client.fullName);
  const lastVisit = client.lastVisitAt
    ? new Date(client.lastVisitAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "—";
  const recency =
    client.daysWithoutReturn == null ? "—" : `${toNumber(client.daysWithoutReturn)}d`;

  return `
    <article class="cl-row cl-row-${escapeHtml(statusKey)}">
      <div class="cl-row-body" data-clients-action="detail" data-client-id="${escapeHtml(clientId)}">
        <div class="cl-avatar cl-avatar-${escapeHtml(statusKey)}">${escapeHtml(initials)}</div>
        <div class="cl-identity">
          <strong class="cl-name">${escapeHtml(client.fullName || "Cliente")}</strong>
          <span class="cl-phone">${escapeHtml(formatPhone(client.phone))}</span>
        </div>
        <div class="cl-chips">
          <span class="cl-chip cl-chip-${escapeHtml(statusKey)}">${escapeHtml(statusLabel(status))}</span>
        </div>
        <div class="cl-visit">
          <strong>${escapeHtml(lastVisit)}</strong>
          <span>${escapeHtml(recency)}</span>
        </div>
        <div class="cl-ltv">
          <strong>${escapeHtml(money(client.ltv || client.revenue || 0))}</strong>
          <span>Tk ${escapeHtml(money(client.averageTicket || 0))}</span>
        </div>
      </div>
      <div class="cl-row-actions">
        ${renderCompactWa(client.phone, clientId)}
        <button type="button" data-clients-action="detail" data-client-id="${escapeHtml(clientId)}" class="cl-detail-btn" title="Ver detalhes">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </article>
  `;
}

function renderAttentionQueue(queue = []) {
  const actionableQueue = queue.filter((client) =>
    ["AT_RISK", "INACTIVE"].includes(String(client.status || "").toUpperCase()),
  );
  if (!actionableQueue.length) return "";
  const priority = actionableQueue[0];
  const days =
    priority.daysWithoutReturn == null ? "" : ` · ${toNumber(priority.daysWithoutReturn)} dias sem retorno`;
  const impact =
    priority.estimatedImpact == null ? "" : ` · potencial ${money(priority.estimatedImpact)}`;
  return `
    <div class="cl-priority-strip cl-priority-strip-alert">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <span>Prioridade comercial</span>
        <p><strong>${escapeHtml(priority.fullName || "Cliente")}</strong> — ${escapeHtml(actionLabel(priority))}${escapeHtml(days)}${escapeHtml(impact)}</p>
      </div>
    </div>
  `;
}

export function renderClientsLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando carteira de clientes...");
  if (elements.toolbar) elements.toolbar.innerHTML = "";
  if (elements.automationSignals) elements.automationSignals.innerHTML = "";
  if (elements.reactivationQueue)
    renderPanelMessage(elements.reactivationQueue, "Organizando fila comercial...");
  if (elements.table) renderPanelMessage(elements.table, "Preparando histórico...");
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderClientsError(elements, message = "Falha ao carregar clientes.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.toolbar) elements.toolbar.innerHTML = "";
  if (elements.automationSignals) elements.automationSignals.innerHTML = "";
  if (elements.reactivationQueue)
    renderPanelMessage(elements.reactivationQueue, "Fila comercial indisponível.", "error");
  if (elements.table) renderPanelMessage(elements.table, "Dados de clientes indisponíveis.", "error");
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderClientsData(elements, payload, options = {}) {
  const summary = payload?.summary ?? {};
  const clients = normalizeClients(payload);
  const reactivationQueue = Array.isArray(payload?.reactivationQueue) ? payload.reactivationQueue : [];
  const automationSignals = payload?.automationSignals ?? {};

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="cl-kpi-strip">
        <article class="ux-kpi cl-kpi cl-kpi-main">
          <div class="ux-label">Carteira ativa</div>
          <div class="ux-value-sm">${toNumber(summary.active)}</div>
          <div class="ux-hint">${toNumber(summary.vip)} VIP · ${toNumber(summary.totalClients)} clientes no recorte</div>
        </article>
        <article class="ux-kpi cl-kpi">
          <div class="ux-label">Atenção</div>
          <div class="ux-value-sm ${toNumber(summary.atRisk) + toNumber(summary.inactive) > 0 ? "ds-kpi-tone-warning" : ""}">${toNumber(summary.atRisk) + toNumber(summary.inactive)}</div>
          <div class="ux-hint">${toNumber(summary.atRisk)} em risco · ${toNumber(summary.inactive)} inativos</div>
        </article>
        <article class="ux-kpi cl-kpi">
          <div class="ux-label">Potencial</div>
          <div class="ux-value-sm">${money(summary.potentialReactivationRevenue)}</div>
          <div class="ux-hint">Ticket médio ${money(summary.averageTicket)}</div>
        </article>
      </div>
    `;
  }

  if (elements.toolbar) {
    elements.toolbar.innerHTML = `
      <div class="cl-toolbar">
        <div class="cl-toolbar-left">
          <span class="cl-toolbar-count">${clients.length} cliente${clients.length !== 1 ? "s" : ""}</span>
        </div>
        <button type="button" data-clients-action="add-new" class="cl-add-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Novo cliente
        </button>
      </div>
    `;
  }

  if (elements.reactivationQueue) {
    elements.reactivationQueue.innerHTML = renderAttentionQueue(reactivationQueue);
  }

  if (elements.automationSignals) {
    const count = toNumber(automationSignals.clientsWithRecentAutomation);
    const playbooks = toNumber(automationSignals.reactivationPlaybookExecutions);
    elements.automationSignals.innerHTML =
      count > 0
        ? `<details class="cl-accordion cl-accordion-subtle">
            <summary>Sinais de automação — ${count} cliente(s) com atividade recente</summary>
            <div class="cl-accordion-body">
              <p>${count} cliente(s) tiveram automação recente registrada.</p>
              <p>${playbooks} execução(ões) de playbook de reativação neste recorte.</p>
            </div>
          </details>`
        : "";
  }

  if (!elements.table) return;
  if (!clients.length) {
    elements.table.innerHTML = renderEmptyState({
      title: options.hasActiveFilters ? "Nenhum cliente encontrado." : "Você ainda não cadastrou clientes.",
      description: options.hasActiveFilters
        ? "Ajuste busca, status, segmento ou período para ampliar a carteira."
        : "Crie sua carteira para começar agendamentos, vendas, fidelização e reativação.",
      action: renderPrimaryAction({
        label: "Adicionar primeiro cliente",
        attrs: { "data-clients-action": "add-first" },
      }),
    });
    return;
  }

  elements.table.innerHTML = `
    <div class="cl-day-hdr">CLIENTES NO RECORTE</div>
    <div class="cl-list">${clients.map(renderClientCard).join("")}</div>
  `;
}

export function renderClientDrawer(elements, client = {}, context = {}) {
  if (!elements.drawerHost || !(client.clientId || client.id)) return;
  const clientId = client.clientId || client.id;
  const status = client.status || "NEW";
  const sk = String(status).toLowerCase();
  const initials = clientInitials(client.fullName);

  const appointments = Array.isArray(context.appointments) ? context.appointments : [];
  const productSales = Array.isArray(context.productSales) ? context.productSales : [];

  const parsedWa = buildWhatsAppLinkFromPhone(client.phone);
  const waBtn = parsedWa.ok
    ? `<a href="${escapeHtml(parsedWa.url)}" target="_blank" rel="noopener noreferrer" class="cl-footer-btn cl-footer-btn-wa">${WA_SVG} WhatsApp</a>`
    : `<button type="button" class="cl-footer-btn cl-footer-btn-wa" disabled style="opacity:.38;cursor:not-allowed">${WA_SVG} WhatsApp</button>`;

  elements.drawerHost.innerHTML = `
    <aside class="op-drawer is-open" id="clientDrawer" aria-hidden="false">
      <div class="op-drawer-backdrop" data-drawer-close></div>
      <article class="op-drawer-panel cl-drawer" role="dialog" aria-modal="true" aria-label="Detalhes do cliente">

        <header class="cl-drawer-header">
          <div class="cl-drawer-hero">
            <div class="cl-drawer-avatar cl-avatar-${escapeHtml(sk)}">${escapeHtml(initials)}</div>
            <div>
              <h2 class="cl-drawer-name">${escapeHtml(client.fullName || "Cliente")}</h2>
              <div class="cl-drawer-meta">
                <span class="cl-chip cl-chip-${escapeHtml(sk)}">${escapeHtml(statusLabel(status))}</span>
                <span class="cl-drawer-phone">${escapeHtml(formatPhone(client.phone))}</span>
              </div>
            </div>
          </div>
          <button type="button" class="cl-drawer-close" data-drawer-close aria-label="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div class="cl-drawer-metrics">
          <div class="cl-metric">
            <strong>${escapeHtml(money(client.ltv || client.revenue || 0))}</strong>
            <span>Total gerado</span>
          </div>
          <div class="cl-metric">
            <strong>${escapeHtml(String(toNumber(client.visits)))}</strong>
            <span>Visitas</span>
          </div>
          <div class="cl-metric">
            <strong>${escapeHtml(money(client.averageTicket || 0))}</strong>
            <span>Ticket médio</span>
          </div>
        </div>

        <div class="cl-drawer-body">

          <section class="cl-drawer-section">
            <h3 class="cl-section-title">Informações</h3>
            <div class="cl-info-grid">
              <div class="cl-info-row"><span>Telefone</span><strong>${escapeHtml(formatPhone(client.phone) || "—")}</strong></div>
              <div class="cl-info-row"><span>E-mail</span><strong>${escapeHtml(client.email || "—")}</strong></div>
              <div class="cl-info-row"><span>Última visita</span><strong>${escapeHtml(formatDate(client.lastVisitAt))}</strong></div>
              <div class="cl-info-row"><span>Recorrência</span><strong>${escapeHtml(client.visitFrequencyDays == null ? "—" : `${toNumber(client.visitFrequencyDays).toFixed(0)} dias`)}</strong></div>
              <div class="cl-info-row"><span>Profissional pref.</span><strong>${escapeHtml(client.preferredProfessionalName || "—")}</strong></div>
              ${client.preferences ? `<div class="cl-info-row"><span>Preferências</span><strong>${escapeHtml(client.preferences)}</strong></div>` : ""}
              ${client.notes ? `<div class="cl-info-row"><span>Observações</span><strong>${escapeHtml(client.notes)}</strong></div>` : ""}
            </div>
            <div class="cl-action-note">
              <span>${escapeHtml(actionLabel(client))}</span>
              <p>${escapeHtml(actionDescription(client))}</p>
            </div>
          </section>

          <section class="cl-drawer-section">
            <h3 class="cl-section-title">Histórico</h3>
            <details class="cl-accordion" open>
              <summary>Agendamentos recentes</summary>
              <div class="cl-accordion-body">
                ${
                  appointments.length
                    ? `<ol class="cl-history-list">${appointments
                        .slice(0, 5)
                        .map(
                          (a) =>
                            `<li><strong>${escapeHtml(a.service || "Atendimento")}</strong><span>${escapeHtml(formatDateTime(a.startsAt))} — ${escapeHtml(a.status || "")}</span></li>`,
                        )
                        .join("")}</ol>`
                    : `<p class="cl-empty-text">Sem agendamentos recentes neste recorte.</p>`
                }
              </div>
            </details>
            <details class="cl-accordion">
              <summary>Compras de produtos</summary>
              <div class="cl-accordion-body">
                ${
                  productSales.length
                    ? `<ol class="cl-history-list">${productSales
                        .slice(0, 5)
                        .map(
                          (s) =>
                            `<li><strong>${escapeHtml(s.itemsSummary || "Compra")}</strong><span>${escapeHtml(s.soldAtLabel || "—")} — ${escapeHtml(s.amount || "")}</span></li>`,
                        )
                        .join("")}</ol>`
                    : `<p class="cl-empty-text">Sem compras vinculadas no histórico.</p>`
                }
              </div>
            </details>
            <details class="cl-accordion">
              <summary>Segmento e tags</summary>
              <div class="cl-accordion-body">
                <div class="cl-info-row"><span>Segmento</span><strong>${escapeHtml(segmentLabel(client.segment))}</strong></div>
                <div class="cl-info-row cl-tags-row"><span>Tags</span><div class="cl-tag-row">${renderTagChips(client.tags)}</div></div>
              </div>
            </details>
          </section>

        </div>

        <footer class="cl-drawer-footer">
          ${waBtn}
          <button type="button" data-clients-action="schedule" data-client-id="${escapeHtml(clientId)}" class="cl-footer-btn cl-footer-btn-primary">Criar agendamento</button>
        </footer>

      </article>
    </aside>
  `;

  elements.drawerHost.classList.remove("hidden");
  bindEntityDrawers(elements.drawerHost);
  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}
