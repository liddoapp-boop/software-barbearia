import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderStatusChip,
  renderTechnicalTrace,
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
    <article class="ux-kpi catalog-kpi">
      <div class="ux-label">${escapeHtml(title)}</div>
      <div class="ux-value-sm ${tone}">${escapeHtml(value)}</div>
      ${subtitle ? `<div class="ux-hint">${escapeHtml(subtitle)}</div>` : ""}
    </article>
  `;
}

function renderProfessionalCard(item = {}, context = {}) {
  const services = normalizeCatalogServices(context.services, item.professionalId);
  const pendingCommission = pendingCommissionFor(item.professionalId, context.commissions);
  return `
    <article class="catalog-row professional-catalog-row">
      <div class="catalog-row-main">
        <div class="catalog-row-copy">
          <div class="catalog-row-meta">
            ${renderStatusChip("ACTIVE", { label: "Profissional ativo" })}
            ${renderStatusChip("INFO", { label: "Pode atender" })}
          </div>
          <strong>${escapeHtml(item.name || "Profissional")}</strong>
          <span>${escapeHtml(services.length ? serviceNamesForProfessional(context.services, item.professionalId, 4) : "Sem servicos vinculados no catalogo carregado.")}</span>
        </div>
        <div class="catalog-row-price">
          <span>Producao no periodo</span>
          <strong>${escapeHtml(money(item.revenue))}</strong>
          <small>${escapeHtml(toNumber(item.completed))} atendimento(s)</small>
        </div>
      </div>

      <div class="catalog-row-facts">
        <div><span>Servicos que executa</span><strong>${escapeHtml(services.length ? `${services.length} servico(s)` : "Nao mapeado")}</strong></div>
        <div><span>Ticket medio</span><strong>${escapeHtml(money(item.ticketAverage))}</strong></div>
        <div><span>Ocupacao</span><strong>${escapeHtml(pct(item.occupancyRate))}</strong></div>
        <div><span>Comissao pendente</span><strong>${escapeHtml(pendingCommission ? money(pendingCommission) : "Sem pendencia no recorte")}</strong></div>
      </div>

      <div class="catalog-row-action-strip">
        <p>Ativo para agenda. Comissoes, agenda relacionada e rastreabilidade ficam no detalhe.</p>
        <div class="catalog-row-actions">
          <button type="button" data-professional-action="detail" data-professional-id="${escapeHtml(item.professionalId)}" class="ux-btn ux-btn-muted">Ver detalhes</button>
          <button type="button" data-professional-action="open-agenda" data-professional-id="${escapeHtml(item.professionalId)}" class="ux-btn ux-btn-muted">Ver agenda</button>
          <button type="button" data-professional-action="open-commissions" data-professional-id="${escapeHtml(item.professionalId)}" class="ux-btn ux-btn-muted">Ver comissoes</button>
        </div>
      </div>
    </article>
  `;
}

function renderServiceChips(services = []) {
  if (!services.length) return `<p class="text-sm text-slate-400">Sem servicos habilitados no catalogo carregado.</p>`;
  return `
    <div class="catalog-chip-list">
      ${services.map((service) => `<span>${escapeHtml(service.name || "Servico")}</span>`).join("")}
    </div>
  `;
}

function renderRecentAppointments(professionalId = "", appointments = []) {
  const recent = (Array.isArray(appointments) ? appointments : [])
    .filter((item) => item.professionalId === professionalId)
    .slice(0, 5);
  if (!recent.length) {
    return `<p class="text-sm text-slate-400">Sem agenda recente disponivel neste recorte.</p>`;
  }
  return `
    <ol class="op-history-list">
      ${recent
        .map(
          (item) => `
            <li>
              <strong>${escapeHtml(item.service || "Atendimento")} com ${escapeHtml(item.client || "cliente")}</strong>
              <span>${escapeHtml(item.startsAtLabel || item.startsAt || "-")} - ${escapeHtml(item.status || "Status")}</span>
            </li>
          `,
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
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        ${renderKpi("Producao no periodo", money(summary.totalRevenue), "Receita gerada")}
        ${renderKpi("Atendimentos concluidos", String(toNumber(summary.totalCompleted)), "Equipe ativa")}
        ${renderKpi("Maior producao", summary.bestRevenue?.name || "-", summary.bestRevenue ? money(summary.bestRevenue.revenue) : "Sem historico", "text-emerald-700")}
        ${renderKpi("Maior ocupacao", summary.bestOccupancy?.name || "-", summary.bestOccupancy ? pct(summary.bestOccupancy.occupancyRate) : "Sem historico")}
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
    <section class="catalog-list professional-catalog-list">
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

  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Nome</dt><dd>${escapeHtml(professional.name || "Profissional")}</dd></div>
      <div><dt>Status</dt><dd>${renderStatusChip("ACTIVE", { label: "Profissional ativo" })}</dd></div>
      <div><dt>Perfil/funcao</dt><dd>${escapeHtml(professional.role || "Atendimento")}</dd></div>
      <div><dt>Contato</dt><dd>${escapeHtml(professional.phone || professional.email || "Nao informado")}</dd></div>
    </dl>
  `;

  const details = `
    <details class="client-progressive-panel" open>
      <summary>Operacao</summary>
      <div class="op-detail-list">
        <p><strong>Servicos habilitados:</strong> ${escapeHtml(services.length ? `${services.length} servico(s)` : "Sem vinculo explicito")}</p>
        ${renderServiceChips(services)}
        <p><strong>Producao resumida:</strong> ${escapeHtml(money(professional.revenue))} em ${escapeHtml(toNumber(professional.completed))} atendimento(s) concluido(s).</p>
        <p><strong>Comissao pendente:</strong> ${escapeHtml(pendingCommission ? money(pendingCommission) : "Sem pendencia no recorte")}</p>
        <p><strong>Comissao paga:</strong> ${escapeHtml(paidCommission ? money(paidCommission) : "Sem pagamento no recorte")}</p>
      </div>
    </details>
    <details class="client-progressive-panel">
      <summary>Agenda recente</summary>
      ${renderRecentAppointments(professional.professionalId, context.appointments)}
    </details>
  `;

  const history = `
    <dl class="op-summary-grid">
      <div><dt>Atendimentos concluidos</dt><dd>${escapeHtml(toNumber(professional.completed))}</dd></div>
      <div><dt>Receita gerada</dt><dd>${escapeHtml(money(professional.revenue))}</dd></div>
      <div><dt>Ticket medio</dt><dd>${escapeHtml(money(professional.ticketAverage))}</dd></div>
      <div><dt>Ocupacao</dt><dd>${escapeHtml(pct(professional.occupancyRate))}</dd></div>
      <div><dt>Total na agenda</dt><dd>${escapeHtml(toNumber(professional.total))}</dd></div>
      <div><dt>Comissao estimada/pendente</dt><dd>${escapeHtml(pendingCommission ? money(pendingCommission) : "Sem pendencia")}</dd></div>
    </dl>
  `;

  const actions = `
    <button type="button" data-professional-action="open-agenda" data-professional-id="${escapeHtml(professional.professionalId)}" class="ux-btn ux-btn-primary">Ver agenda relacionada</button>
    <button type="button" data-professional-action="open-commissions" data-professional-id="${escapeHtml(professional.professionalId)}" class="ux-btn ux-btn-muted">Ver comissoes</button>
    <button type="button" class="ux-btn ux-btn-muted" disabled title="Edicao depende do fluxo de cadastro de profissionais">Editar profissional</button>
  `;

  const technicalTrace = renderTechnicalTrace({
    professionalId: professional.professionalId,
    userId: professional.userId,
    commissionRuleIds: professional.commissionRuleIds,
    serviceIds: services.map((service) => service.id),
    status: "ACTIVE",
    metadataJson: {
      professional,
      services,
      commissions,
    },
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "professionalDrawer",
    title: professional.name || "Profissional",
    subtitle: `Producao no periodo: ${money(professional.revenue)}`,
    status: "ACTIVE",
    open: true,
    summary,
    details,
    history,
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
