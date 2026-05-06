import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getDisplayStatus(product = {}) {
  const quantity = toNumber(product.quantity);
  const minimum = toNumber(product.minimumStock);
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (minimum > 0 && quantity <= Math.max(1, Math.floor(minimum / 2))) return "CRITICAL";
  if (product.status === "LOW_STOCK" || (minimum > 0 && quantity <= minimum)) return "LOW_STOCK";
  return "IN_STOCK";
}

function statusWeight(status) {
  return {
    OUT_OF_STOCK: 5,
    CRITICAL: 4,
    LOW_STOCK: 3,
    IN_STOCK: 1,
  }[status] || 0;
}

function sortProductsForAction(products = []) {
  return [...products].sort((a, b) => {
    const statusDiff = statusWeight(getDisplayStatus(b)) - statusWeight(getDisplayStatus(a));
    if (statusDiff !== 0) return statusDiff;
    const stockRatioA = toNumber(a.minimumStock) > 0 ? toNumber(a.quantity) / toNumber(a.minimumStock) : 99;
    const stockRatioB = toNumber(b.minimumStock) > 0 ? toNumber(b.quantity) / toNumber(b.minimumStock) : 99;
    if (stockRatioA !== stockRatioB) return stockRatioA - stockRatioB;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
}

function getActionSuggestion(product = {}) {
  const status = getDisplayStatus(product);
  if (status === "OUT_OF_STOCK") return "Registrar entrada antes da proxima venda.";
  if (status === "CRITICAL") return "Repor hoje ou ajustar o saldo.";
  if (status === "LOW_STOCK") return "Planejar reposicao.";
  return "Monitorar saldo.";
}

function movementLabel(movement = {}) {
  if (movement.referenceType === "PRODUCT_SALE") return "Saida por venda de produto";
  if (movement.referenceType === "PRODUCT_REFUND" || movement.referenceType === "PRODUCT_SALE_REFUND") {
    return "Entrada por devolucao";
  }
  if (movement.referenceType === "SERVICE_CONSUMPTION") return "Consumo por servico";
  if (movement.referenceType === "INTERNAL") {
    if (movement.movementType === "LOSS") return "Perda";
    return "Consumo interno";
  }
  if (movement.type === "ADJUSTMENT" || movement.referenceType === "ADJUSTMENT") return "Ajuste manual";
  if (movement.movementType === "IN" || movement.type === "IN") return "Entrada manual";
  if (movement.movementType === "OUT" || movement.type === "OUT") return "Saida manual";
  return movement.reason || "Movimentacao de estoque";
}

function movementExplanation(movement = {}) {
  if (movement.referenceType === "PRODUCT_SALE") return "Este produto saiu do estoque por uma venda.";
  if (movement.referenceType === "PRODUCT_REFUND" || movement.referenceType === "PRODUCT_SALE_REFUND") {
    return "Este produto voltou ao estoque por uma devolucao.";
  }
  if (movement.referenceType === "ADJUSTMENT") return "Este movimento foi feito manualmente.";
  if (movement.referenceType === "SERVICE_CONSUMPTION") return "Este produto foi consumido por um servico.";
  if (movement.referenceType === "INTERNAL") return "Este movimento foi registrado como uso interno ou perda.";
  return "Movimentacao registrada no estoque.";
}

function movementTypeLabel(movement = {}) {
  const type = movement.movementType || movement.type;
  if (type === "IN") return "Entrada";
  if (type === "OUT") return "Saida";
  if (type === "LOSS") return "Perda";
  if (type === "INTERNAL_USE") return "Consumo interno";
  return "Ajuste";
}

function relatedMovements(payload = {}, productId) {
  const recent = Array.isArray(payload.recentMovements) ? payload.recentMovements : [];
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  const seen = new Set();
  return [...recent, ...logs]
    .filter((item) => item.productId === productId)
    .filter((item) => {
      const key = item.id || `${item.productId}-${item.createdAt || item.occurredAt}-${item.quantity}-${item.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.occurredAt || b.createdAt).getTime() - new Date(a.occurredAt || a.createdAt).getTime());
}

function suggestionForProduct(payload = {}, productId) {
  return (Array.isArray(payload.replenishmentSuggestions) ? payload.replenishmentSuggestions : []).find(
    (item) => item.productId === productId,
  );
}

function renderSummaryCards(container, products = [], payload = {}) {
  if (!container) return;
  const outOfStock = products.filter((item) => getDisplayStatus(item) === "OUT_OF_STOCK").length;
  const critical = products.filter((item) => getDisplayStatus(item) === "CRITICAL").length;
  const lowStock = products.filter((item) => getDisplayStatus(item) === "LOW_STOCK").length;
  const suggestions = Array.isArray(payload.replenishmentSuggestions)
    ? payload.replenishmentSuggestions.length
    : 0;
  const estimatedValue = toNumber(payload.summary?.estimatedStockValue);

  const cards = [
    { title: "Sem estoque", value: outOfStock, tone: outOfStock ? "text-red-700" : "text-slate-900" },
    { title: "Criticos", value: critical, tone: critical ? "text-red-700" : "text-slate-900" },
    { title: "Estoque baixo", value: lowStock, tone: lowStock ? "text-amber-700" : "text-slate-900" },
    { title: "Reposicao sugerida", value: suggestions, tone: suggestions ? "text-amber-700" : "text-slate-900" },
    { title: "Valor estimado", value: money(estimatedValue), tone: "text-slate-900" },
  ];

  container.innerHTML = cards
    .map(
      (card) => `
        <article class="ux-kpi inventory-attention-card">
          <p class="ux-label">${escapeHtml(card.title)}</p>
          <p class="ux-value-sm ${card.tone}">${escapeHtml(card.value)}</p>
        </article>
      `,
    )
    .join("");
}

function renderActionButtons(product) {
  return `
    <div class="inventory-row-actions">
      <button type="button" data-inventory-action="detail" data-product-id="${escapeHtml(product.id)}" class="ux-btn ux-btn-muted">Ver detalhes</button>
      <button type="button" data-inventory-action="add" data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" class="ux-btn ux-btn-success">Ajustar estoque</button>
    </div>
  `;
}

function renderDesktopRows(container, products = []) {
  if (!container) return;
  container.innerHTML = products
    .map((item) => {
      const displayStatus = getDisplayStatus(item);
      return `
        <tr class="inventory-row inventory-row-${displayStatus.toLowerCase()}">
          <td class="px-3 py-3 align-top">
            <div class="text-sm font-semibold text-slate-100">${escapeHtml(item.name)}</div>
            <div class="text-xs text-slate-400 mt-1">${escapeHtml(item.category || "Sem categoria")}</div>
          </td>
          <td class="px-3 py-3 align-top">
            <div class="text-sm text-slate-100">Atual: <strong>${toNumber(item.quantity)}</strong></div>
            <div class="text-xs text-slate-400 mt-1">Minimo: ${toNumber(item.minimumStock)}</div>
          </td>
          <td class="px-3 py-3 align-top">
            <div class="text-sm font-semibold text-slate-100">${escapeHtml(getActionSuggestion(item))}</div>
            <div class="text-xs text-slate-400 mt-1">Venda: ${money(item.salePrice)}</div>
          </td>
          <td class="px-3 py-3 align-top">${renderStatusChip(displayStatus)}</td>
          <td class="px-3 py-3 align-top">${renderActionButtons(item)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMobileCards(container, products = []) {
  if (!container) return;
  container.innerHTML = products
    .map((item) => {
      const displayStatus = getDisplayStatus(item);
      return `
        <article class="ux-card inventory-product-card inventory-row-${displayStatus.toLowerCase()}">
          <div class="inventory-product-card-head">
            <div>
              <div class="text-sm font-semibold text-slate-100">${escapeHtml(item.name)}</div>
              <div class="text-xs text-slate-400 mt-1">${escapeHtml(item.category || "Sem categoria")}</div>
            </div>
            ${renderStatusChip(displayStatus)}
          </div>
          <div class="inventory-product-stock">
            <div><span>Atual</span><strong>${toNumber(item.quantity)}</strong></div>
            <div><span>Minimo</span><strong>${toNumber(item.minimumStock)}</strong></div>
          </div>
          <p class="inventory-action-suggestion">${escapeHtml(getActionSuggestion(item))}</p>
          ${renderActionButtons(item)}
        </article>
      `;
    })
    .join("");
}

export function renderStockLoading(elements) {
  if (elements.summaryCards) {
    renderPanelMessage(elements.summaryCards, "Carregando estoque operacional...");
  }
  if (elements.tableBody) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="px-3 py-6 text-center text-sm text-slate-500">Carregando produtos...</td>
      </tr>
    `;
  }
  if (elements.mobileList) {
    renderPanelMessage(elements.mobileList, "Carregando produtos...");
  }
}

export function renderStockError(elements, message = "Falha ao carregar estoque.") {
  if (elements.summaryCards) renderPanelMessage(elements.summaryCards, message, "error");
  if (elements.tableBody) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="px-3 py-6 text-center text-sm text-red-700">${escapeHtml(message)}</td>
      </tr>
    `;
  }
  if (elements.mobileList) renderPanelMessage(elements.mobileList, message, "error");
}

export function renderStockData(elements, payload = {}) {
  const products = sortProductsForAction(Array.isArray(payload.products) ? payload.products : []);
  const categories = Array.isArray(payload.categories) ? payload.categories : [];

  renderSummaryCards(elements.summaryCards, products, payload);

  if (elements.categoryFilter) {
    const previous = elements.categoryFilter.value || "";
    elements.categoryFilter.innerHTML = `
      <option value="">Todas categorias</option>
      ${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}
    `;
    if (categories.includes(previous)) {
      elements.categoryFilter.value = previous;
    }
  }

  if (elements.emptyState) {
    elements.emptyState.classList.toggle("hidden", products.length > 0);
    elements.emptyState.innerHTML = renderEmptyState({
      title: "Nenhum produto encontrado no estoque.",
      description: "Cadastre um produto ou ajuste os filtros para voltar a operar a lista.",
      action: renderPrimaryAction({
        label: "Novo produto",
        id: "inventoryEmptyAddBtn",
        type: "button",
      }),
    });
  }
  if (elements.tableWrap) {
    elements.tableWrap.classList.toggle("hidden", products.length === 0);
    elements.tableWrap.classList.toggle("xl:block", products.length > 0);
  }

  if (!products.length) {
    if (elements.tableBody) elements.tableBody.innerHTML = "";
    if (elements.mobileList) elements.mobileList.innerHTML = "";
    return;
  }

  renderDesktopRows(elements.tableBody, products);
  renderMobileCards(elements.mobileList, products);
}

export function renderStockProductDrawer(elements, payload = {}, productId) {
  const product = (Array.isArray(payload.products) ? payload.products : []).find((item) => item.id === productId);
  if (!elements.drawerHost || !product) return;

  const displayStatus = getDisplayStatus(product);
  const movements = relatedMovements(payload, productId);
  const suggestion = suggestionForProduct(payload, productId);
  const latestMovement = movements[0] || {};

  const summary = `
    <dl class="op-summary-grid">
      <div><dt>Produto</dt><dd>${escapeHtml(product.name)}</dd></div>
      <div><dt>Categoria</dt><dd>${escapeHtml(product.category || "Sem categoria")}</dd></div>
      <div><dt>Quantidade atual</dt><dd>${toNumber(product.quantity)}</dd></div>
      <div><dt>Estoque minimo</dt><dd>${toNumber(product.minimumStock)}</dd></div>
      <div><dt>Preco de venda</dt><dd>${money(product.salePrice)}</dd></div>
      <div><dt>Custo</dt><dd>${toNumber(product.costPrice) > 0 ? money(product.costPrice) : "-"}</dd></div>
      <div><dt>Valor em estoque</dt><dd>${money(product.estimatedValue)}</dd></div>
      <div><dt>Sugestao</dt><dd>${escapeHtml(getActionSuggestion(product))}</dd></div>
    </dl>
  `;

  const details = `
    <div class="inventory-drawer-actions">
      <button type="button" data-inventory-action="add" data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" class="ux-btn ux-btn-success">Registrar entrada</button>
      <button type="button" data-inventory-action="remove" data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" class="ux-btn ux-btn-muted">Registrar saida</button>
      <button type="button" data-inventory-action="edit" data-product-id="${escapeHtml(product.id)}" class="ux-btn ux-btn-muted">Editar produto</button>
      <button type="button" data-inventory-action="delete" data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}" class="ux-btn ux-btn-danger">Inativar produto</button>
    </div>
    ${
      suggestion
        ? `<p class="inventory-drawer-note">Reposicao sugerida: comprar ${toNumber(suggestion.recommendedPurchaseQty)} unidade(s). Estimativa de ruptura: ${toNumber(suggestion.estimatedDaysToRupture)} dia(s).</p>`
        : `<p class="inventory-drawer-note">Sem reposicao urgente sugerida agora.</p>`
    }
  `;

  const history = movements.length
    ? `
      <div class="inventory-movement-list">
        ${movements
          .map(
            (movement) => `
              <article class="inventory-movement-item">
                <div>
                  <strong>${escapeHtml(movementLabel(movement))}</strong>
                  <span>${escapeHtml(movementExplanation(movement))}</span>
                </div>
                <dl>
                  <div><dt>Tipo</dt><dd>${escapeHtml(movementTypeLabel(movement))}</dd></div>
                  <div><dt>Quantidade</dt><dd>${toNumber(movement.quantity)}</dd></div>
                  <div><dt>Data</dt><dd>${formatDateTime(movement.occurredAt || movement.createdAt)}</dd></div>
                  <div><dt>Origem</dt><dd>${escapeHtml(movementLabel(movement))}</dd></div>
                  <div><dt>Referencia</dt><dd>${escapeHtml(movement.reason || movementExplanation(movement))}</dd></div>
                </dl>
              </article>
            `,
          )
          .join("")}
      </div>
    `
    : `<p class="text-sm text-slate-400">Sem movimentacoes recentes para este produto.</p>`;

  const technicalTrace = renderTechnicalTrace({
    productId: product.id,
    stockMovementId: latestMovement.id,
    referenceType: latestMovement.referenceType,
    referenceId: latestMovement.referenceId,
    auditEntity: "stock_movement",
    auditAction: latestMovement.referenceType === "ADJUSTMENT" ? "STOCK_MANUAL_MOVEMENT" : latestMovement.referenceType,
  });

  elements.drawerHost.innerHTML = renderEntityDrawer({
    id: "inventoryProductDrawer",
    title: product.name,
    subtitle: product.category || "Sem categoria",
    status: displayStatus,
    open: true,
    summary,
    details,
    history,
    technicalTrace,
  });
  bindEntityDrawers(elements.drawerHost);
}
