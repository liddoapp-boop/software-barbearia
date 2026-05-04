import { renderInlineFeedback } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value) {
  return `R$ ${toNumber(value).toFixed(2)}`;
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
      <div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-center">
        <p class="text-sm font-semibold text-gray-700">Carrinho vazio.</p>
        <p class="text-xs text-gray-500 mt-1">Adicione produtos para registrar a venda.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const lineTotal = Number((item.unitPrice * item.quantity).toFixed(2));
      return `
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="flex items-start justify-between gap-2">
            <strong class="text-sm text-gray-800">${item.name}</strong>
            <button type="button" data-cart-remove="${item.productId}" class="rounded-md border border-red-200 bg-red-50 text-red-700 px-2 py-1 text-xs font-semibold">
              Remover
            </button>
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <div class="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden">
              <button type="button" data-cart-dec="${item.productId}" class="px-3 py-2 text-sm bg-white text-gray-700">-</button>
              <span class="px-3 py-2 text-sm bg-gray-50 text-gray-800 min-w-[48px] text-center">${item.quantity}</span>
              <button type="button" data-cart-inc="${item.productId}" class="px-3 py-2 text-sm bg-white text-gray-700">+</button>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-500">Unitario: ${toMoney(item.unitPrice)}</div>
              <div class="text-sm font-bold text-gray-900">Subtotal: ${toMoney(lineTotal)}</div>
            </div>
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
