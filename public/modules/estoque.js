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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function statusMeta(status) {
  if (status === "OUT_OF_STOCK") {
    return {
      label: "Sem estoque",
      tone: "text-red-700 bg-red-100 border-red-200",
    };
  }
  if (status === "LOW_STOCK") {
    return {
      label: "Estoque baixo",
      tone: "text-amber-700 bg-amber-100 border-amber-200",
    };
  }
  return {
    label: "Em estoque",
    tone: "text-emerald-700 bg-emerald-100 border-emerald-200",
  };
}

function logLabel(type) {
  if (type === "IN") return "Entrada";
  if (type === "OUT") return "Saida";
  return "Ajuste";
}

function renderSummaryCards(container, summary = {}, lastMovement = null) {
  if (!container) return;
  const cards = [
    {
      title: "Total de produtos",
      value: toNumber(summary.totalProducts),
      tone: "text-slate-900",
    },
    {
      title: "Itens em estoque",
      value: toNumber(summary.itemsInStock),
      tone: "text-emerald-700",
    },
    {
      title: "Produtos com estoque baixo",
      value: toNumber(summary.lowStockCount),
      tone: toNumber(summary.lowStockCount) > 0 ? "text-amber-700" : "text-slate-900",
    },
    {
      title: "Valor estimado em estoque",
      value: money(summary.estimatedStockValue),
      tone: "text-slate-900",
    },
    {
      title: "Ultima movimentacao",
      value: lastMovement ? `${logLabel(lastMovement.type)} • ${formatDateTime(lastMovement.createdAt)}` : "Sem movimentacoes",
      tone: "text-slate-900",
    },
  ];

  container.innerHTML = cards
    .map(
      (card) => `
        <article class="ux-kpi">
          <p class="ux-label">${card.title}</p>
          <p class="ux-value-sm ${card.tone}">${card.value}</p>
        </article>
      `,
    )
    .join("");
}

function renderDesktopRows(container, products = []) {
  if (!container) return;
  container.innerHTML = products
    .map((item) => {
      const status = statusMeta(item.status);
      return `
        <tr class="border-t border-slate-200">
          <td class="px-3 py-3 align-top">
            <div class="text-sm font-semibold text-slate-100">${item.name}</div>
            <div class="text-xs text-slate-400 mt-1">${item.category || "Sem categoria"}</div>
            ${item.notes ? `<div class="text-xs text-slate-400 mt-1">${item.notes}</div>` : ""}
          </td>
          <td class="px-3 py-3 align-top">
            <div class="text-sm text-slate-100">Atual: <strong>${toNumber(item.quantity)}</strong></div>
            <div class="text-xs text-slate-400 mt-1">Minimo: ${toNumber(item.minimumStock)}</div>
          </td>
          <td class="px-3 py-3 align-top">
            <div class="text-sm text-slate-100">Venda: <strong>${money(item.salePrice)}</strong></div>
            <div class="text-xs text-slate-400 mt-1">Custo: ${item.costPrice > 0 ? money(item.costPrice) : "-"}</div>
          </td>
          <td class="px-3 py-3 align-top">
            <span class="inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${status.tone}">${status.label}</span>
          </td>
          <td class="px-3 py-3 align-top">
            <div class="flex flex-wrap gap-1">
              <button type="button" data-inventory-action="edit" data-product-id="${item.id}" class="ux-btn ux-btn-muted">Editar</button>
              <button type="button" data-inventory-action="add" data-product-id="${item.id}" data-product-name="${item.name}" class="ux-btn ux-btn-success">+ Quantidade</button>
              <button type="button" data-inventory-action="remove" data-product-id="${item.id}" data-product-name="${item.name}" class="ux-btn ux-btn-muted">- Quantidade</button>
              <button type="button" data-inventory-action="delete" data-product-id="${item.id}" data-product-name="${item.name}" class="ux-btn ux-btn-danger">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMobileCards(container, products = []) {
  if (!container) return;
  container.innerHTML = products
    .map((item) => {
      const status = statusMeta(item.status);
      return `
        <article class="ux-card">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-sm font-semibold text-slate-100">${item.name}</div>
              <div class="text-xs text-slate-400 mt-1">${item.category || "Sem categoria"}</div>
            </div>
            <span class="inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${status.tone}">${status.label}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-300">
            <div>Atual: <strong>${toNumber(item.quantity)}</strong></div>
            <div>Minimo: <strong>${toNumber(item.minimumStock)}</strong></div>
            <div>Venda: <strong>${money(item.salePrice)}</strong></div>
            <div>Custo: <strong>${item.costPrice > 0 ? money(item.costPrice) : "-"}</strong></div>
          </div>
          ${item.notes ? `<div class="text-xs text-slate-400 mt-2">${item.notes}</div>` : ""}
          <div class="flex flex-wrap gap-1 mt-3">
            <button type="button" data-inventory-action="edit" data-product-id="${item.id}" class="ux-btn ux-btn-muted">Editar</button>
            <button type="button" data-inventory-action="add" data-product-id="${item.id}" data-product-name="${item.name}" class="ux-btn ux-btn-success">+ Quantidade</button>
            <button type="button" data-inventory-action="remove" data-product-id="${item.id}" data-product-name="${item.name}" class="ux-btn ux-btn-muted">- Quantidade</button>
            <button type="button" data-inventory-action="delete" data-product-id="${item.id}" data-product-name="${item.name}" class="ux-btn ux-btn-danger">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

export function renderStockLoading(elements) {
  if (elements.summaryCards) {
    renderPanelMessage(elements.summaryCards, "Carregando modulo de estoque...");
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
        <td colspan="5" class="px-3 py-6 text-center text-sm text-red-700">${message}</td>
      </tr>
    `;
  }
  if (elements.mobileList) renderPanelMessage(elements.mobileList, message, "error");
}

export function renderStockData(elements, payload = {}) {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const categories = Array.isArray(payload.categories) ? payload.categories : [];

  renderSummaryCards(elements.summaryCards, payload.summary || {}, payload.lastMovement || null);

  if (elements.categoryFilter) {
    const previous = elements.categoryFilter.value || "";
    elements.categoryFilter.innerHTML = `
      <option value="">Todas categorias</option>
      ${categories
        .map((item) => `<option value="${item}">${item}</option>`)
        .join("")}
    `;
    if (categories.includes(previous)) {
      elements.categoryFilter.value = previous;
    }
  }

  if (elements.emptyState) {
    elements.emptyState.classList.toggle("hidden", products.length > 0);
  }
  if (elements.tableWrap) {
    elements.tableWrap.classList.toggle("hidden", products.length === 0);
    elements.tableWrap.classList.toggle("xl:block", products.length > 0);
  }

  if (!products.length) {
    if (elements.tableBody) {
      elements.tableBody.innerHTML = "";
    }
    if (elements.mobileList) {
      elements.mobileList.innerHTML = "";
    }
    return;
  }

  renderDesktopRows(elements.tableBody, products);
  renderMobileCards(elements.mobileList, products);
}

