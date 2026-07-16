import {
  bindEntityDrawers,
  renderEmptyState,
  renderPrimaryAction,
  renderStatusChip,
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

function bindImageFailureFallbacks(root) {
  root?.querySelectorAll("img[data-hide-on-error]").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.parentElement) image.parentElement.style.display = "none";
    }, { once: true });
  });
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

function enabledProfessionalsLabel(service = {}, limit = 8) {
  const professionals = Array.isArray(service.enabledProfessionals)
    ? service.enabledProfessionals.filter(Boolean)
    : [];
  if (!professionals.length) return "Todos os profissionais ativos";
  const names = professionals.map((item) => item.name || "Profissional").filter(Boolean);
  const visible = names.slice(0, limit).join(", ");
  const hidden = names.length - limit;
  return hidden > 0 ? `${visible} +${hidden}` : visible;
}

function renderProfessionalsCell(service = {}) {
  const professionals = Array.isArray(service.enabledProfessionals)
    ? service.enabledProfessionals.filter(Boolean)
    : [];

  if (!professionals.length) {
    return `<strong class="svc-prof-name">Todos</strong>`;
  }

  const first = professionals[0];
  const rest = professionals.slice(1);

  if (!rest.length) {
    return `<strong class="svc-prof-name">${escapeHtml(first.name || "Profissional")}</strong>`;
  }

  const items = professionals
    .map((p) => `<li>${escapeHtml(p.name || "Profissional")}</li>`)
    .join("");

  return `
    <div class="svc-prof-wrap">
      <strong class="svc-prof-name">${escapeHtml(first.name || "Profissional")}</strong>
      <button type="button" class="svc-prof-more" data-svc-prof-toggle aria-expanded="false">+${rest.length}</button>
      <ul class="svc-prof-dropdown" data-svc-prof-list role="listbox" aria-label="Profissionais habilitados">
        ${items}
      </ul>
    </div>
  `;
}

function renderKpi(title, value, subtitle = "", tone = "") {
  return `
    <article class="svc-kpi ${tone}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
    </article>
  `;
}

function marginColor(service = {}) {
  const pctVal = toNumber(service.estimatedMarginPct);
  if (pctVal >= 35) return "#15803d";
  if (pctVal >= 25) return "#b45309";
  return "#be123c";
}

function renderServiceCard(service = {}) {
  const status = serviceStatus(service);
  const isActive = service.isActive !== false;
  const marginPct = toNumber(service.estimatedMarginPct);

  return `
    <article class="svc-row ${isActive ? "" : "svc-row-inactive"}">
      <div class="svc-row-main" data-service-action="detail" data-service-id="${escapeHtml(service.id)}">
        <div class="svc-row-copy">
          <div class="svc-row-chips">
            ${renderStatusChip(status, { label: isActive ? "Ativo" : "Inativo" })}
            ${service.category ? `<span class="svc-category-tag">${escapeHtml(service.category)}</span>` : ""}
          </div>
          <strong>${escapeHtml(service.name || "Servico")}</strong>
          <span>${escapeHtml(service.description || "Sem descricao cadastrada.")}</span>
        </div>
        <div class="svc-row-col svc-row-col-prof">
          <span>Profissional</span>
          ${renderProfessionalsCell(service)}
        </div>
        <div class="svc-row-col">
          <span>Margem</span>
          <strong style="color:${marginColor(service)}">${escapeHtml(marginPct > 0 ? pct(marginPct) : "—")}</strong>
        </div>
        <div class="svc-row-price">
          <strong>${escapeHtml(money(service.price))}</strong>
          <span>${escapeHtml(String(toNumber(service.durationMinutes)))} min</span>
        </div>
      </div>
      <div class="svc-row-actions">
        <button type="button" data-service-action="detail" data-service-id="${escapeHtml(service.id)}" class="svc-row-btn svc-row-arrow" title="Ver detalhes">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </article>
  `;
}

function renderProfessionalsList(service = {}, allProfessionals = []) {
  const enabled = Array.isArray(service.enabledProfessionals) ? service.enabledProfessionals : [];
  const candidates = enabled.length ? enabled : allProfessionals.filter((item) => item.enabled);
  if (!candidates.length) {
    return `<p class="ds-text-muted">Todos os profissionais ativos podem atender este servico.</p>`;
  }
  return `
    <div class="catalog-chip-list">
      ${candidates
        .map((item) => `<span>${escapeHtml(item.name || "Profissional")}</span>`)
        .join("")}
    </div>
  `;
}

const appointmentStatusPt = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluido",
  CANCELLED: "Cancelado",
  NO_SHOW: "Nao compareceu",
  IN_PROGRESS: "Em andamento",
};

function translateStatus(status) {
  return appointmentStatusPt[String(status).toUpperCase()] || status || "—";
}

function renderRecentUsage(usage = {}) {
  const recent = Array.isArray(usage.recent) ? usage.recent.slice(0, 5) : [];
  if (!recent.length) {
    return `<p class="ds-text-muted">Sem atendimentos recentes disponiveis para este servico.</p>`;
  }
  return `
    <ol class="svc-history-list">
      ${recent
        .map(
          (item) => `
            <li class="svc-history-item">
              <strong>${escapeHtml(item.client || "Cliente")} com ${escapeHtml(item.professional || "profissional")}</strong>
              <span>${escapeHtml(formatDateTime(item.startsAt))} · ${escapeHtml(translateStatus(item.status))} · ${escapeHtml(money(item.revenue))}</span>
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
      <div class="svc-kpi-grid">
        ${renderKpi("Serviços", String(toNumber(summary.totalServices)), "Catalogo total")}
        ${renderKpi("Ativos", String(toNumber(summary.activeServices)), "Vendaveis na agenda", "svc-kpi-success")}
        ${renderKpi("Inativos", String(toNumber(summary.inactiveServices)), "Fora da venda")}
        ${renderKpi("Ticket medio", money(summary.averageTicket), "Preco medio atual")}
        ${renderKpi("Mais vendido", summary.bestSellingService?.name || "-", summary.bestSellingService ? `${toNumber(summary.bestSellingService.salesCount)} venda(s)` : "Sem historico", "svc-kpi-highlight")}
        ${renderKpi("Precisam ajuste", String(adjustment), "Preco ou margem em atencao", adjustment ? "svc-kpi-warning" : "")}
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
      description: "Ajuste os filtros ou cadastre um servico para alimentar agenda e checkout.",
      action: renderPrimaryAction({
        label: "Adicionar primeiro servico",
        attrs: { "data-service-action": "create-empty", "data-service-id": "new" },
      }),
    });
    return;
  }

  elements.tableWrap.classList.remove("hidden");
  elements.tableWrap.innerHTML = `
    <div class="svc-list-head">
      <span>Catalogo</span>
      <strong>${services.length} ${services.length === 1 ? "serviço" : "serviços"}</strong>
    </div>
    <section class="svc-list">
      ${services.map(renderServiceCard).join("")}
    </section>
  `;
  bindProfToggles(elements.tableWrap);
}

function closeProfDropdowns(container) {
  container.querySelectorAll("[data-svc-prof-toggle][aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    btn.closest(".svc-prof-wrap")?.querySelector("[data-svc-prof-list]")?.classList.remove("is-open");
  });
}

function bindProfToggles(container) {
  if (container._svcProfBound) return;
  container._svcProfBound = true;

  container.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-svc-prof-toggle]");
    if (toggleBtn) {
      e.stopPropagation();
      const wrap = toggleBtn.closest(".svc-prof-wrap");
      const list = wrap?.querySelector("[data-svc-prof-list]");
      if (!list) return;
      const isOpen = toggleBtn.getAttribute("aria-expanded") === "true";
      closeProfDropdowns(container);
      if (!isOpen) {
        toggleBtn.setAttribute("aria-expanded", "true");
        list.classList.add("is-open");
      }
      return;
    }
    closeProfDropdowns(container);
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) closeProfDropdowns(container);
  });
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
  const professionals = Array.isArray(payload.professionals) ? payload.professionals : [];
  const isActive = service.isActive !== false;
  const marginPct = toNumber(service.estimatedMarginPct);

  elements.drawerHost.innerHTML = `
    <aside class="op-drawer is-open" id="serviceDrawer" aria-hidden="false">
      <div class="op-drawer-backdrop" data-drawer-close></div>
      <article class="op-drawer-panel team-drawer" role="dialog" aria-modal="true" aria-label="Detalhes do servico">

        <header class="team-drawer-head">
          <div class="team-drawer-hero">
            <div class="team-drawer-hero-info">
              <h2>${escapeHtml(service.name || "Servico")}</h2>
              <p class="team-drawer-role">${escapeHtml(service.category || "Sem categoria")} · ${escapeHtml(toNumber(service.durationMinutes))} min</p>
              <div class="svc-drawer-chips">
                <span class="svc-drawer-chip ${isActive ? "svc-drawer-chip-green" : "svc-drawer-chip-muted"}">${isActive ? "Ativo" : "Inativo"}</span>
              </div>
            </div>
          </div>
          <button type="button" class="team-drawer-close" data-drawer-close aria-label="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div class="team-drawer-metrics">
          <div>
            <strong>${escapeHtml(money(usage.totalRevenue || service.revenueGenerated))}</strong>
            <span>Receita</span>
          </div>
          <div>
            <strong>${escapeHtml(String(toNumber(usage.totalCompleted || service.salesCount)))}</strong>
            <span>Vendas</span>
          </div>
          <div>
            <strong style="color:${marginColor(service)}">${escapeHtml(marginPct > 0 ? pct(marginPct) : "—")}</strong>
            <span>Margem</span>
          </div>
        </div>

        <div class="team-drawer-body">

          ${service.imageUrl ? `
          <div class="svc-detail-img">
            <img src="${escapeHtml(service.imageUrl)}" alt="${escapeHtml(service.name)}" loading="lazy" data-hide-on-error />
          </div>
          ` : ""}

          <section class="team-drawer-section">
            <h3>Detalhes</h3>
            <div class="team-info-grid">
              <div><span>Preco</span><strong>${escapeHtml(money(service.price))}</strong></div>
              <div><span>Duracao</span><strong>${escapeHtml(String(toNumber(service.durationMinutes)))} min</strong></div>
              <div><span>Custo estimado</span><strong>${escapeHtml(money(service.estimatedCost))}</strong></div>
              <div><span>Margem estimada</span><strong style="color:${marginColor(service)}">${escapeHtml(money(service.estimatedMargin))} (${escapeHtml(pct(service.estimatedMarginPct))})</strong></div>
              <div><span>Ultima venda</span><strong>${escapeHtml(formatDateTime(usage.lastSoldAt || service.lastCompletedAt))}</strong></div>
            </div>
          </section>

          ${service.description ? `
          <section class="team-drawer-section">
            <h3>Descricao</h3>
            <p class="svc-drawer-desc">${escapeHtml(service.description)}</p>
          </section>
          ` : ""}

          <section class="team-drawer-section">
            <h3>Profissionais habilitados</h3>
            ${renderProfessionalsList(service, professionals)}
          </section>

          <section class="team-drawer-section">
            <details class="team-accordion">
              <summary>Atendimentos recentes</summary>
              <div class="team-accordion-body">${renderRecentUsage(usage)}</div>
            </details>
          </section>

        </div>

        <footer class="team-drawer-footer">
          <button type="button" data-service-action="edit" data-service-id="${escapeHtml(service.id)}" class="team-footer-btn team-footer-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            Editar servico
          </button>
          <button type="button" data-service-action="toggle-status" data-service-id="${escapeHtml(service.id)}" data-next-active="${isActive ? "false" : "true"}" class="team-footer-btn">
            ${isActive ? "Inativar" : "Ativar"}
          </button>
          <button type="button" data-service-action="duplicate" data-service-id="${escapeHtml(service.id)}" class="team-footer-btn">
            Duplicar
          </button>
        </footer>

      </article>
    </aside>
  `;
  elements.drawerHost.classList.remove("hidden");
  bindImageFailureFallbacks(elements.drawerHost);
  bindEntityDrawers(elements.drawerHost);
  elements.drawerHost.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.drawerHost.classList.add("hidden");
    });
  });
}

export function renderServiceEditPanel(elements, service = {}, professionals = [], callbacks = {}) {
  if (!elements?.drawerHost) return;

  const selectedIds = new Set(Array.isArray(service.enabledProfessionalIds) ? service.enabledProfessionalIds : []);
  const profOptions = professionals
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}" ${selectedIds.has(p.id) ? "selected" : ""}>${escapeHtml(p.name || "Profissional")}</option>`,
    )
    .join("");

  const imagePreviewId = `svc-img-preview-${service.id || "new"}`;

  elements.drawerHost.innerHTML = `
    <aside class="op-drawer is-open" id="serviceEditPanel" aria-hidden="false">
      <div class="op-drawer-backdrop" data-svc-edit-close></div>
      <article class="op-drawer-panel team-drawer" role="dialog" aria-modal="true" aria-label="Editar servico">

        <header class="team-drawer-head">
          <div class="team-drawer-hero-info">
            <h2>Editar servico</h2>
            <p class="team-drawer-role">${escapeHtml(service.name || "Servico")}</p>
          </div>
          <button type="button" class="team-drawer-close" data-svc-edit-close aria-label="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </header>

        <div class="team-drawer-body svc-edit-body">
          <form id="svcEditForm" class="svc-edit-form" novalidate>
            <input type="hidden" id="svcEditId" value="${escapeHtml(service.id || "")}" />

            <div class="svc-edit-field svc-edit-full">
              <label for="svcEditName">Nome do servico *</label>
              <input id="svcEditName" type="text" maxlength="120" required value="${escapeHtml(service.name || "")}" class="svc-edit-input" />
            </div>

            <div class="svc-edit-row">
              <div class="svc-edit-field">
                <label for="svcEditPrice">Preco (R$)</label>
                <input id="svcEditPrice" type="number" min="0" step="0.01" value="${escapeHtml(String(toNumber(service.price)))}" class="svc-edit-input" />
              </div>
              <div class="svc-edit-field">
                <label for="svcEditDuration">Duracao (min)</label>
                <input id="svcEditDuration" type="number" min="1" step="1" value="${escapeHtml(String(toNumber(service.durationMinutes)))}" class="svc-edit-input" />
              </div>
            </div>

            <div class="svc-edit-row">
              <div class="svc-edit-field">
                <label for="svcEditCategory">Categoria</label>
                <input id="svcEditCategory" type="text" maxlength="120" value="${escapeHtml(service.category || "")}" class="svc-edit-input" />
              </div>
            </div>

            <div class="svc-edit-row">
              <div class="svc-edit-field">
                <label for="svcEditCost">Custo estimado (R$)</label>
                <input id="svcEditCost" type="number" min="0" step="0.01" value="${escapeHtml(String(toNumber(service.estimatedCost)))}" class="svc-edit-input" />
              </div>
              <div class="svc-edit-field">
                <label for="svcEditStatus">Status</label>
                <select id="svcEditStatus" class="svc-edit-input">
                  <option value="true" ${service.isActive !== false ? "selected" : ""}>Ativo</option>
                  <option value="false" ${service.isActive === false ? "selected" : ""}>Inativo</option>
                </select>
              </div>
            </div>

            <div class="svc-edit-field svc-edit-full">
              <label for="svcEditDescription">Descricao</label>
              <textarea id="svcEditDescription" maxlength="1000" rows="2" class="svc-edit-input">${escapeHtml(service.description || "")}</textarea>
            </div>

            <div class="svc-edit-field svc-edit-full">
              <label for="svcEditImageUrl">Imagem do servico (URL)</label>
              <input id="svcEditImageUrl" type="url" maxlength="500" value="${escapeHtml(service.imageUrl || "")}" class="svc-edit-input" placeholder="https://..." />
              ${service.imageUrl ? `<div class="svc-edit-img-preview" id="${imagePreviewId}"><img src="${escapeHtml(service.imageUrl)}" alt="Preview" data-hide-on-error /></div>` : `<div class="svc-edit-img-preview" id="${imagePreviewId}" style="display:none"><img alt="Preview" /></div>`}
            </div>

            <div class="svc-edit-field svc-edit-full">
              <label for="svcEditProfessionals">Profissionais habilitados</label>
              <select id="svcEditProfessionals" multiple class="svc-edit-input svc-edit-select-multi">
                ${profOptions}
              </select>
              <p class="svc-edit-hint">Segure Ctrl (ou Cmd no Mac) para selecionar varios</p>
            </div>

            <div class="svc-edit-field svc-edit-full">
              <label for="svcEditNotes">Observacoes</label>
              <textarea id="svcEditNotes" maxlength="1000" rows="2" class="svc-edit-input">${escapeHtml(service.notes || "")}</textarea>
            </div>

            <div id="svcEditFeedback"></div>
          </form>
        </div>

        <footer class="team-drawer-footer">
          <button type="submit" form="svcEditForm" class="team-footer-btn team-footer-primary">Salvar alteracoes</button>
          <button type="button" data-svc-edit-close class="team-footer-btn">Cancelar</button>
        </footer>

      </article>
    </aside>
  `;

  elements.drawerHost.classList.remove("hidden");
  bindImageFailureFallbacks(elements.drawerHost);

  const imgInput = elements.drawerHost.querySelector("#svcEditImageUrl");
  const imgPreview = elements.drawerHost.querySelector(`#${imagePreviewId}`);
  if (imgInput && imgPreview) {
    imgInput.addEventListener("input", () => {
      const url = imgInput.value.trim();
      const img = imgPreview.querySelector("img");
      if (url && img) {
        img.src = url;
        imgPreview.style.display = "";
      } else {
        imgPreview.style.display = "none";
      }
    });
  }

  elements.drawerHost.querySelectorAll("[data-svc-edit-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (typeof callbacks.onCancel === "function") callbacks.onCancel();
    });
  });

  const form = elements.drawerHost.querySelector("#svcEditForm");
  if (form && typeof callbacks.onSubmit === "function") {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = elements.drawerHost.querySelector("#svcEditName")?.value.trim() || "";
      if (!name) { showEditFeedback(elements, "Nome obrigatorio"); return; }
      const price = Number(elements.drawerHost.querySelector("#svcEditPrice")?.value || 0);
      const durationMinutes = Number(elements.drawerHost.querySelector("#svcEditDuration")?.value || 0);
      if (durationMinutes <= 0) { showEditFeedback(elements, "Duracao deve ser maior que zero"); return; }
      const select = elements.drawerHost.querySelector("#svcEditProfessionals");
      const professionalIds = select ? Array.from(select.selectedOptions).map((o) => o.value) : [];
      callbacks.onSubmit({
        name,
        price,
        durationMinutes,
        category: elements.drawerHost.querySelector("#svcEditCategory")?.value.trim() || undefined,
        description: elements.drawerHost.querySelector("#svcEditDescription")?.value.trim() || undefined,
        defaultCommissionRate: 0,
        estimatedCost: Number(elements.drawerHost.querySelector("#svcEditCost")?.value || 0),
        isActive: elements.drawerHost.querySelector("#svcEditStatus")?.value === "true",
        notes: elements.drawerHost.querySelector("#svcEditNotes")?.value.trim() || undefined,
        imageUrl: elements.drawerHost.querySelector("#svcEditImageUrl")?.value.trim() || undefined,
        professionalIds,
      });
    });
  }
}

function showEditFeedback(elements, message) {
  const fb = elements.drawerHost?.querySelector("#svcEditFeedback");
  if (fb) fb.innerHTML = `<p class="svc-edit-error">${escapeHtml(message)}</p>`;
}
