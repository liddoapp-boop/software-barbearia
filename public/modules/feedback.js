function toneClasses(tone) {
  if (tone === "error") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "success") return "border-teal-200 bg-teal-50 text-teal-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

export function feedbackPanel(message, tone = "neutral") {
  return `<div class="rounded-lg border px-3 py-2 text-sm ${toneClasses(tone)}">${message}</div>`;
}

export function renderPanelMessage(element, message, tone = "neutral") {
  if (!element) return;
  element.innerHTML = feedbackPanel(message, tone);
}

export function renderInlineFeedback(element, type, message) {
  if (!element) return;
  if (!message) {
    element.className = "mt-2";
    element.innerHTML = "";
    return;
  }
  element.className = "mt-2";
  element.innerHTML = feedbackPanel(message, type || "neutral");
}
