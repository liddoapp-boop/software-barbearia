import { renderInlineFeedback } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productImageUrl(product = {}) {
  const direct = String(product.imageUrl || product.image || "").trim();
  if (direct) return direct;
  const match = String(product.notes || "").match(/(?:Imagem|Image|imageUrl):\s*(https?:\/\/\S+)/i);
  return match ? match[1].trim() : "";
}

function productInitials(product = {}) {
  return String(product.name || "Produto")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "P";
}

function renderCartThumb(item = {}) {
  const imageUrl = productImageUrl(item);
  if (imageUrl) {
    return `<div class="pdv-cart-thumb has-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name || "Produto")}" loading="lazy" /></div>`;
  }
  return `<div class="pdv-cart-thumb">${escapeHtml(productInitials(item))}</div>`;
}

function normalizeQty(value) {
  const parsed = Math.trunc(toNumber(value, 0));
  return parsed > 0 ? parsed : 1;
}

export function createEmptyCart() {
  return [];
}

export function computeCartTotals(cart) {
  const items = Array.isArray(cart) ? cart : [];
  const totalAmount = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    totalItems,
  };
}

export function addItemToCart(cart, product, quantity) {
  if (!product) throw new Error("Selecione um produto valido");

  const safeQty = normalizeQty(quantity);
  const current = Array.isArray(cart) ? cart : [];
  const existing = current.find((item) => item.productId === product.id);
  const nextQty = (existing?.quantity ?? 0) + safeQty;

  if (nextQty > toNumber(product.stockQty)) {
    throw new Error(
      `Estoque insuficiente para ${product.name}. Disponivel=${toNumber(product.stockQty)}`,
    );
  }

  if (existing) {
    return current.map((item) =>
      item.productId === product.id
        ? { ...item, quantity: nextQty }
        : item,
    );
  }

  return [
    ...current,
    {
      productId: product.id,
      name: product.name,
      quantity: safeQty,
      unitPrice: toNumber(product.salePrice),
      stockQty: toNumber(product.stockQty),
      category: product.category || "Sem categoria",
      notes: product.notes || "",
      imageUrl: product.imageUrl || product.image || "",
    },
  ];
}

export function updateCartItemQty(cart, productId, quantity) {
  const safeQty = normalizeQty(quantity);
  return (Array.isArray(cart) ? cart : []).map((item) => {
    if (item.productId !== productId) return item;
    if (safeQty > item.stockQty) {
      throw new Error(`Estoque insuficiente para ${item.name}. Disponivel=${item.stockQty}`);
    }
    return { ...item, quantity: safeQty };
  });
}

export function removeCartItem(cart, productId) {
  return (Array.isArray(cart) ? cart : []).filter((item) => item.productId !== productId);
}

export function renderSaleFeedback(type, message, element) {
  renderInlineFeedback(element, type, message);
}

export function renderCart(cart, elements, handlers) {
  const items = Array.isArray(cart) ? cart : [];
  const { list, totalValue, totalItemsValue, checkoutButton } = elements;
  const totals = computeCartTotals(items);

  if (totalValue) totalValue.textContent = toMoney(totals.totalAmount);
  if (totalItemsValue) totalItemsValue.textContent = `${totals.totalItems} item(ns)`;
  if (checkoutButton) checkoutButton.disabled = items.length === 0;

  if (!list) return;
  if (!items.length) {
    list.innerHTML = `
      <div class="pdv-cart-empty">
        <p class="op-empty-title">Carrinho vazio</p>
        <p class="op-empty-description">Adicione produtos para registrar a venda.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const lineTotal = Number((item.unitPrice * item.quantity).toFixed(2));
      return `
        <article class="pdv-cart-item">
          <div class="pdv-cart-item-head">
            ${renderCartThumb(item)}
            <div>
              <strong class="pdv-cart-item-name">${escapeHtml(item.name)}</strong>
              <span class="pdv-cart-item-meta">Unitário ${toMoney(item.unitPrice)} · estoque ${escapeHtml(item.stockQty)}</span>
            </div>
            <button type="button" data-cart-remove="${item.productId}" class="ux-btn ux-btn-danger ux-btn-sm">
              Remover
            </button>
          </div>
          <div class="pdv-cart-qty-row">
            <div class="pdv-cart-stepper">
              <button type="button" data-cart-dec="${item.productId}" class="pdv-cart-stepper-btn">&#8722;</button>
              <span class="pdv-cart-stepper-qty">${item.quantity}</span>
              <button type="button" data-cart-inc="${item.productId}" class="pdv-cart-stepper-btn">&#43;</button>
            </div>
            <div class="pdv-cart-subtotal">Subtotal: ${toMoney(lineTotal)}</div>
          </div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll("[data-cart-remove]").forEach((button) => {
    button.addEventListener("click", () => handlers.onRemove(button.dataset.cartRemove));
  });
  list.querySelectorAll("[data-cart-dec]").forEach((button) => {
    button.addEventListener("click", () => handlers.onDecrease(button.dataset.cartDec));
  });
  list.querySelectorAll("[data-cart-inc]").forEach((button) => {
    button.addEventListener("click", () => handlers.onIncrease(button.dataset.cartInc));
  });
}
