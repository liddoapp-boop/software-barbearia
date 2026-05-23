import {
  bindEntityDrawers,
  renderEmptyState,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Number(toNumber(value)).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pct(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function initials(name = "") {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeCatalogServices(services = [], professionalId = "") {
  return (Array.isArray(services) ? services : [])
    .filter((service) => service && service.active !== false && service.isActive !== false)
    .filter((service) => {
      const ids = service.enabledProfessionalIds || service.professionalIds || [];
      return !Array.isArray(ids) || ids.length === 0 || ids.includes(professionalId);
    });
}

function serviceNamesForProfessional(services = [], professionalId = "", limit = 3) {
  const enabled = normalizeCatalogServices(services, professionalId);
  if (!enabled.length) return "Servicos nao mapeados neste recorte";
  const names = enabled.map((service) => service.name || "Servico").filter(Boolean);
  const visible = names.slice(0, limit).join(", ");
  const hidden = names.length - limit;
  return hidden > 0 ? `${visible} +${hidden}` : visible;
}

function pendingCommissionFor(professionalId = "", commissions = []) {
  return (Array.isArray(commissions) ? commissions : [])
    .filter((item) => (item.professionalId || item.professional?.id) === professionalId)
    .filter((item) => String(item.status || "").toUpperCase() === "PENDING")
    .reduce((acc, item) => acc + toNumber(item.amount || item.commissionAmount || item.value), 0);
}

function renderKpi(title, value, subtitle = "", tone = "") {
  return `
    <article class="team-kpi ${tone}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </article>
  `;
}

function renderProfessionalCard(item = {}, context = {}) {
  const services = normalizeCatalogServices(context.services, item.professionalId);
  const pendingCommission = pendingCommissionFor(item.professionalId, context.commissions);
  const name = item.name || "Profissional";
  return `
    <article class="team-row">
      <div class="team-row-main" data-professional-action="detail" data-professional-id="${escapeHtml(item.professionalId)}">
        <div class="team-avatar">${escapeHtml(initials(name))}</div>
        <div class="team-copy">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(services.length ? serviceNamesForProfessional(context.services, item.professionalId, 4) : "Sem servicos vinculados no catalogo carregado.")}</span>
          <div class="team-chips">
            <span class="team-chip team-chip-green">Ativo</span>
            <span class="team-chip">Pode atender</span>
            ${pendingCommission ? `<span class="team-chip team-chip-warn">Comissao ${escapeHtml(money(pendingCommission))}</span>` : ""}
          </div>
        </div>
        <div class="team-metric">
          <strong>${escapeHtml(money(item.revenue))}</strong>
          <span>Producao</span>
        </div>
        <div class="team-metric">
          <strong>${escapeHtml(String(toNumber(item.completed)))}</strong>
          <span>Atend.</span>
        </div>
        <div class="team-metric">
          <strong>${escapeHtml(pct(item.occupancyRate))}</strong>
          <span>Ocupacao</span>
        </div>
      </div>
      <div class="team-row-actions">
        <button type="button" data-professional-action="open-agenda" data-professional-id="${escapeHtml(item.professionalId)}" class="team-icon-btn" title="Ver agenda">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
        </button>
        <button type="button" data-professional-action="open-commissions" data-professional-id="${escapeHtml(item.professionalId)}" class="team-icon-btn" title="Ver comissoes">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>
        </button>
        <button type="button" data-professional-action="detail" data-professional-id="${escapeHtml(item.professionalId)}" class="team-arrow-btn" title="Ver detalhes">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </article>
  `;
}

function renderServiceChips(services = []) {
  if (!services.length) return `<p class="ds-text-muted">Sem servicos habilitados no catalogo carregado.</p>`;
  return `
    <div class="catalog-chip-list">
      ${services.map((service) => `<span>${escapeHtml(service.name || "Servico")}</span>`).join("")}
    </div>
  `;
}

const appointmentStatusPt = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluido",
  CANCELLED: "Cancelado",
  CANCELED: "Cancelado",
  NO_SHOW: "Nao compareceu",
  BLOCKED: "Bloqueado",
};

function formatApptDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function renderRecentAppointments(professionalId = "", appointments = []) {
  const recent = (Array.isArray(appointments) ? appointments : [])
    .filter((item) => item.professionalId === professionalId)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    .slice(0, 5);
  if (!recent.length) {
    return `<p class="ds-text-muted">Sem agenda recente disponivel neste recorte.</p>`;
  }
  return `
    <ol class="op-history-list">
      ${recent
        .map(
          (item) => {
            const statusKey = String(item.status || "").toUpperCase();
            const statusPt = appointmentStatusPt[statusKey] || item.status || "Status";
            const dateStr = formatApptDate(item.startsAt);
            return `
              <li>
                <strong>${escapeHtml(item.service || item.serviceName || "Atendimento")} com ${escapeHtml(item.client || item.clientName || "cliente")}</strong>
                <span>${escapeHtml(dateStr)} · ${escapeHtml(statusPt)}</span>
              </li>
            `;
          },
        )
        .join("")}
    </ol>
  `;
}

export function renderProfessionalsLoading(elements) {
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando catalogo de profissionais...");
  }
  if (elements.table) {
    renderPanelMessage(elements.table, "Organizando profissionais ativos...");
  }
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderProfessionalsError(
  elements,
  message = "Falha ao carregar desempenho de profissionais.",
) {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.table) renderPanelMessage(elements.table, "Dados indisponiveis.", "error");
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderProfessionalsData(elements, payload, context = {}) {
  const summary = payload?.summary ?? {
    totalRevenue: 0,
    totalCompleted: 0,
    bestRevenue: null,
    bestOccupancy: null,
  };
  const professionals = Array.isArray(payload?.professionals) ? payload.professionals : [];

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="team-kpi-grid">
        ${renderKpi("Producao", money(summary.totalRevenue), "Receita no recorte")}
        ${renderKpi("Atendimentos", String(toNumber(summary.totalCompleted)), "Concluidos no periodo")}
        ${renderKpi("Destaque", summary.bestRevenue?.name || "-", summary.bestRevenue ? money(summary.bestRevenue.revenue) : "Sem historico", "team-kpi-positive")}
      </div>
    `;
  }

  if (!elements.table) return;
  if (!professionals.length) {
    elements.table.innerHTML = renderEmptyState({
      title: "Nenhum profissional encontrado.",
      description: "Ajuste o filtro ou confira se ha profissionais ativos cadastrados para a unidade.",
    });
    return;
  }

  elements.table.innerHTML = `
    <div class="team-list-head">
      <span>Equipe no recorte</span>
      <strong>${professionals.length} ${professionals.length === 1 ? "profissional" : "profissionais"}</strong>
    </div>
    <section class="team-list">
      ${professionals.map((item) => renderProfessionalCard(item, context)).join("")}
    </section>
  `;
}

export function renderProfessionalDrawer(elements, professional = {}, context = {}) {
  if (!elements?.drawerHost || !professional?.professionalId) return;

  const services = normalizeCatalogServices(context.services, professional.professionalId);
  const commissions = (Array.isArray(context.commissions) ? context.commissions : []).filter(
    (item) => (item.professionalId || item.professional?.id) === professional.professionalId,
  );
  const pendingCommission = pendingCommissionFor(professional.professionalId, commissions);
  const paidCommission = commissions
    .filter((item) => String(item.status || "").toUpperCase() === "PAID")
    .reduce((acc, item) => acc + toNumber(item.amount || item.commissionAmount || item.value), 0);

  const recentAppointmentsHtml = renderRecentAppointments(professional.professionalId, context.appointments);
  const serviceChipsHtml = renderServiceChips(services);
  const occupancyPct = toNumber(professional.occupancyRate);
  const occupancyColor = occupancyPct >= 70 ? "#22c55e" : occupancyPct >= 40 ? "#f59e0b" : "#94a3b8";

  elements.drawerHost.innerHTML = `
    <aside class="op-drawer is-open" id="professionalDrawer" aria-hidden="false">
      <div class="op-drawer-backdrop" data-drawer-close></div>
      <article class="op-drawer-panel team-drawer" role="dialog" aria-modal="true" aria-label="Detalhes do profissional">

        <header class="team-drawer-head">
          <div class="team-drawer-hero">
            <div class="team-drawer-avatar">${escapeHtml(initials(professional.name))}</div>
            <div class="team-drawer-hero-info">
              <h2>${escapeHtml(professional.name || "Profissional")}</h2>
              <p class="team-drawer-role">Profissional · Pode atender</p>
              <div class="team-chips">
                <span class="team-chip team-chip-green">Ativo</span>
                ${services.length ? `<span class="team-chip">${services.length} ${services.length === 1 ? "servico" : "servicos"}</span>` : ""}
              </div>
            </div>
          </div>
          <button type="button" class="team-drawer-close" data-drawer-close aria-label="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div class="team-drawer-metrics">
          <div>
            <strong>${escapeHtml(money(professional.revenue))}</strong>
            <span>Producao</span>
          </div>
          <div>
            <strong>${escapeHtml(String(toNumber(professional.completed)))}</strong>
            <span>Atendimentos</span>
          </div>
          <div>
            <strong style="color:${occupancyColor}">${escapeHtml(pct(professional.occupancyRate))}</strong>
            <span>Ocupacao</span>
          </div>
        </div>

        <div class="team-drawer-body">

          <section class="team-drawer-section">
            <h3>Desempenho no periodo</h3>
            <div class="team-info-grid">
              <div>
                <span>Ticket medio</span>
                <strong>${escapeHtml(money(professional.ticketAverage))}</strong>
              </div>
              <div>
                <span>Total agendado</span>
                <strong>${escapeHtml(String(toNumber(professional.total)))}</strong>
              </div>
              <div>
                <span>Comissao pendente</span>
                <strong style="${pendingCommission ? "color:#f59e0b" : ""}">${escapeHtml(pendingCommission ? money(pendingCommission) : "—")}</strong>
              </div>
              <div>
                <span>Comissao paga</span>
                <strong style="${paidCommission ? "color:#22c55e" : ""}">${escapeHtml(paidCommission ? money(paidCommission) : "—")}</strong>
              </div>
            </div>
          </section>

          <section class="team-drawer-section">
            <h3>Servicos habilitados</h3>
            ${serviceChipsHtml}
          </section>

          <section class="team-drawer-section">
            <details class="team-accordion" open>
              <summary>Agenda recente</summary>
              <div class="team-accordion-body">${recentAppointmentsHtml}</div>
            </details>
          </section>

        </div>

        <footer class="team-drawer-footer">
          <button type="button" data-professional-action="open-agenda" data-professional-id="${escapeHtml(professional.professionalId)}" class="team-footer-btn team-footer-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
            Ver agenda
          </button>
          <button type="button" data-professional-action="open-commissions" data-professional-id="${escapeHtml(professional.professionalId)}" class="team-footer-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>
            Ver comissoes
          </button>
          <button type="button" data-professional-action="edit" data-professional-id="${escapeHtml(professional.professionalId)}" class="team-footer-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            Editar
          </button>
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
