import { escapeHtml } from "./sanitize.js";

function toneClass(tone) {
  if (tone === "error") return "panel-msg-error";
  if (tone === "warning") return "panel-msg-warning";
  if (tone === "success") return "panel-msg-success";
  return "";
}

export function feedbackPanel(message, tone = "neutral") {
  return `<div class="panel-msg ${toneClass(tone)}">${escapeHtml(message)}</div>`;
}

export function renderPanelMessage(element, message, tone = "neutral") {
  if (!element) return;
  element.innerHTML = feedbackPanel(message, tone);
}

export function renderInlineFeedback(element, type, message) {
  if (!element) return;
  if (!message) {
    element.className = "panel-msg-host";
    element.innerHTML = "";
    return;
  }
  element.className = "panel-msg-host";
  element.innerHTML = feedbackPanel(message, type || "neutral");
}
