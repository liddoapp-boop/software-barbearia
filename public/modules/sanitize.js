export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return escapeHtml(text || fallback);
}

export function safeAttr(value, fallback = "") {
  return safeText(value, fallback);
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function safeCurrency(value) {
  return safeNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function safeDate(value, fallback = "Sem data") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(fallback);
  return escapeHtml(date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }));
}
