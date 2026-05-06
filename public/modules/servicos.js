import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPrimaryAction,
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function serviceStatus(service = {}) {
  return service.isActive === false ? "INACTIVE" : "ACTIVE";
}

function serviceStatusLabel(service = {}) {
  return service.isActive === false ? "Servico inativo" : "Servico ativo";
}

function enabledProfessionalsLabel(service = {}, limit = 3) {
  const professionals = Array.isArray(service.enabledProfessionals)
    ? service.enabledProfessionals.filter(Boolean)
    : [];
  if (!professionals.length) return "Todos os profissionais ativos";
  const names = professionals.map((item) => item.name || "Profissional").filter(Boolean);
  const visible = names.slice(0, limit).join(", ");
  const hidden = names.length - limit;
  return hidden > 0 ? `${visible} +${hidden}` : visible;
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

function marginSignal(service = {}) {
  const marginPct = toNumber(service.estimatedMarginPct);
  if (marginPct <= 0 && toNumber(service.estimatedMargin) <= 0) return "Margem sem base";
  if (marginPct < 25) return "Precisa ajuste";
  if (marginPct < 35) return "Margem em atencao";
  return "Margem saudavel";
}

function renderServiceCard(service = {}) {
  const status = serviceStatus(service);
  return `
    <article class="catalog-row service-catalog-row">
      <div class="catalog-row-main">
        <div class="catalog-row-copy">
          <div class="catalog-row-meta">
            ${renderStatusChip(status, { label: serviceStatusLabel(service) })}
            ${service.category ? renderStatusChip("INFO", { label: service.category }) : ""}
            ${toNumber(service.salesCount) > 0 ? renderStatusChip("RECURRING", { label: "Com historico" }) : ""}
          </div>
          <strong>${escapeHtml(service.name || "Servico")}</strong>
          <span>${escapeHtml(service.description || "Sem descricao curta cadastrada.")}</span>
        </div>
        <div class="catalog-row-price">
          <span>Preco</span>
          <strong>${escapeHtml(money(service.price))}</strong>
          <small>${escapeHtml(toNumber(service.durationMinutes))} min</small>
        </div>
      </div>

      <div class="catalog-row-facts">
        <div><span>Executado por</span><strong>${escapeHtml(enabledProfessionalsLabel(service))}</strong></div>
        <div><span>Custo estimado</span><strong>${escapeHtml(money(service.estimatedCost))}</strong></div>
        <div><span>Margem estimada</span><strong>${escapeHtml(money(service.estimatedMargin))} (${escapeHtml(pct(service.estimatedMarginPct))})</strong></div>
        <div><span>Uso no periodo</span><strong>${escapeHtml(toNumber(service.salesCount))} venda(s) - ${escapeHtml(money(service.revenueGenerated))}</strong></div>
      </div>

      <div class="catalog-row-action-strip">
        <p>${escapeHtml(marginSignal(service))}. Relacao com agenda, checkout e comissoes fica no detalhe.</p>
        <div class="catalog-row-actions">
          <button type="button" data-service-action="detail" data-service-id="${escapeHtml(service.id)}" class="ux-btn ux-btn-muted">Ver detalhes</button>
          <button type="button" data-service-action="edit" data-service-id="${escapeHtml(service.id)}" class="ux-btn ux-btn-muted">Editar</button>
          <button type="button" data-service-action="duplicate" data-service-id="${escapeHtml(service.id)}" class="ux-btn ux-btn-muted">Duplicar</button>
          <button
            type="button"
            data-service-action="toggle-status"
            data-service-id="${escapeHtml(service.id)}"
            data-next-active="${service.isActive ? "false" : "true"}"
            class="ux-btn ${service.isActive ? "ux-btn-muted" : "ux-btn-success"}"
          >${service.isActive ? "Inativar" : "Ativar"}</button>
        </div>
      </div>
    </article>
  `;
}

function renderProfessionalsList(service = {}, allProfessionals = []) {
  const enabled = Array.isArray(service.enabledProfessionals) ? service.enabledProfessionals : [];
  const candidates = enabled.length ? enabled : allProfessionals.filter((item) => item.enabled);
  if (!candidates.length) {
    return `<p class="text-sm text-slate-400">Todos os profissionais ativos podem atender este servico.</p>`;
  }
  return `
    <div class="catalog-chip-list">
      ${candidates
        .map((item) => `<span>${escapeHtml(item.name || "Profissional")}</span>`)
        .join("")}
    </div>
  `;
}

function renderRecentUsage(usage = {}) {
  const recent = Array.isArray(usage.recent) ? usage.recent.slice(0, 5) : [];
  if (!recent.length) {
    return `<p class="text-sm text-slate-400">Sem atendimentos recentes disponiveis para este servico.</p>`;
  }
  return `
    <ol class="op-history-list">
      ${recent
        .map(
          (item) => `
            <li>
              <strong>${escapeHtml(item.client || "Cliente")} com ${escapeHtml(item.professional || "profissional")}</strong>
              <span>${escapeHtml(formatDateTime(item.startsAt))} - ${escapeHtml(item.status || "Status")} - ${escapeHtml(money(item.revenue))}</span>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

export function renderServicesLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando catalogo de servicos...");
  if (elements.tableWrap) renderPanelMessage(elements.tableWrap, "Organizando catalogo operacional...");
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderServicesError(elements, message = "Falha ao carregar servicos.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.tableWrap) renderPanelMessage(elements.tableWrap, message, "error");
  if (elements.drawerHost) elements.drawerHost.innerHTML = "";
}

export function renderServicesData(elements, payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : [];
  const summary = payload.summary || {};
  const categories = Array.isArray(payload.categories) ? payload.categories : [];

  if (elements.summary) {
    const adjustment = Array.isArray(summary.priceAdjustmentCandidates)
      ? summary.priceAdjustmentCandidates.length
      : 0;
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2">
        ${renderKpi("Servicos", String(toNumber(summary.totalServices)), "Catalogo total")}
        ${renderKpi("Ativos", String(toNumber(summary.activeServices)), "Vendaveis na agenda", "text-emerald-700")}
        ${renderKpi("Inativos", String(toNumber(summary.inactiveServices)), "Fora da venda")}
        ${renderKpi("Ticket medio", money(summary.averageTicket), "Preco medio atual")}
        ${renderKpi("Mais vendido", summary.bestSellingService?.name || "-", summary.bestSellingService ? `${toNumber(summary.bestSellingService.salesCount)} venda(s)` : "Sem historico")}
        ${renderKpi("Precisam ajuste", String(adjustment), "Preco ou margem em atencao", adjustment ? "text-amber-700" : "")}
      </div>
    `;
  }

  if (elements.categoryFilter) {
    const previous = elements.categoryFilter.value || "";
    elements.categoryFilter.innerHTML = `
      <option value="">Todas categorias</option>
      ${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}
    `;
    if (categories.includes(previous)) elements.categoryFilter.value = previous;
  }

  if (!elements.tableWrap) return;
  if (!services.length) {
    elements.tableWrap.innerHTML = renderEmptyState({
      title: "Nenhum servico encontrado.",
      description: "Ajuste os filtros ou cadastre um servico para alimentar agenda, checkout e comissoes.",
      action: renderPrimaryAction({
        label: "Adicionar primeiro servico",
        attrs: { "data-service-action": "create-empty", "data-service-id": "new" },
      }),
    });
    return;
  }

  elements.tableWrap.classList.remove("hidden");
  elements.tableWrap.innerHTML = `
    <section class="catalog-list service-catalog-list">
      ${services.map(renderServiceCard).join("")}
    </section>
  `;
}

export function renderServiceDetail(elements, payload = null) {
  if (!elements?.drawerHost) return;
  if (!payload?.service) {
    elements.drawerHost.classList.add("hidden");
    elements.drawerHost.innerHTML = "";
    return;
  }

  const service = payload.service;
  const usage = payload.usage || {};
  const financialImpact = payload.financialImpact || {};
  const professionals = Array.isArray(payload.professionals) ? payload.professionals : [];
  const status = serviceStatus(service);

  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Nome</dt><dd>${escapeHtml(service.name || "Servico")}</dd></div>
      <div><dt>Categoria</dt><dd>${escapeHtml(service.category || "Sem categoria")}</dd></div>
      <div><dt>Preco</dt><dd>${escapeHtml(money(service.price))}</dd></div>
      <div><dt>Duracao</dt><dd>${escapeHtml(toNumber(service.durationMinutes))} min</dd></div>
      <div><dt>Status</dt><dd>${renderStatusChip(status, { label: serviceStatusLabel(service) })}</dd></div>
      <div><dt>Descricao curta</dt><dd>${escapeHtml(service.description || "Sem descricao cadastrada")}</dd></div>
    </dl>
  `;

  const details = `
    <details class="client-progressive-panel" open>
      <summary>Operacao</summary>
      <div class="op-detail-list">
        <p><strong>Executado por:</strong> ${escapeHtml(enabledProfessionalsLabel(service, 8))}</p>
        ${renderProfessionalsList(service, professionals)}
        <p><strong>Comissao padrao:</strong> ${escapeHtml(pct(service.defaultCommissionRate))}</p>
        <p><strong>Custo estimado:</strong> ${escapeHtml(money(service.estimatedCost))}</p>
        <p><strong>Margem estimada:</strong> ${escapeHtml(money(service.estimatedMargin))} (${escapeHtml(pct(service.estimatedMarginPct))})</p>
        <p><strong>Observacoes:</strong> ${escapeHtml(service.notes || "Sem observacoes")}</p>
      </div>
    </details>
  `;

  const history = `
    <details class="client-progressive-panel" open>
      <summary>Uso e impacto</summary>
      <div class="op-detail-list">
        <p><strong>Quantidade vendida/agendada:</strong> ${escapeHtml(toNumber(usage.totalCompleted || service.salesCount))}</p>
        <p><strong>Receita gerada:</strong> ${escapeHtml(money(usage.totalRevenue || service.revenueGenerated))}</p>
        <p><strong>Ultima venda/atendimento:</strong> ${escapeHtml(formatDateTime(usage.lastSoldAt || service.lastCompletedAt))}</p>
        <p><strong>Custo total estimado:</strong> ${escapeHtml(money(financialImpact.estimatedCostTotal))}</p>
        <p><strong>Lucro total estimado:</strong> ${escapeHtml(money(financialImpact.estimatedProfitTotal))}</p>
        <p>Agenda usa servico + profissional; checkout gera receita; comissao usa a regra vigente quando aplicavel.</p>
      </div>
    </details>
    <details class="client-progressive-panel">
      <summary>Atendimentos recentes</summary>
      ${renderRecentUsage(usage)}
    </details>
  `;

  const actions = `
    <button type="button" data-service-action="edit" data-service-id="${escapeHtml(service.id)}" class="ux-btn ux-btn-primary">Editar servico</button>
    <button type="button" data-service-action="toggle-status" data-service-id="${escapeHtml(service.id)}" data-next-active="${service.isActive ? "false" : "true"}" class="ux-btn ux-btn-muted">${service.isActive ? "Inativar" : "Ativar"}</button>
    <button type="button" data-service-action="duplicate" data-service-id="${escapeHtml(service.id)}" class="ux-btn ux-btn-muted">Duplicar</button>
  `;

  const technicalTrace = renderTechnicalTrace({
    id: service.id,
    serviceId: service.id,
    businessId: service.businessId,
    unitId: service.unitId,
    enabledProfessionalIds: service.enabledProfessionalIds,
    status,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    metadataJson: {
      service,
      usage,
      financialImpact,
      professionals,
    },
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "serviceDrawer",
    title: service.name || "Servico",
    subtitle: `${service.category || "Sem categoria"} - ${money(service.price)} - ${toNumber(service.durationMinutes)} min`,
    status,
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
