import { renderPanelMessage } from "./feedback.js";

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
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function compactJson(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (_error) {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function eventDetails(event) {
  const details = [
    ["before", event.before ?? event.beforeJson],
    ["after", event.after ?? event.afterJson],
    ["metadata", event.metadata ?? event.metadataJson],
  ]
    .map(([label, value]) => {
      const text = compactJson(value);
      if (!text) return "";
      return `
        <details class="rounded-lg border border-slate-200 bg-slate-950/30 p-2">
          <summary class="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">${label}</summary>
          <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">${escapeHtml(text)}</pre>
        </details>
      `;
    })
    .filter(Boolean);

  if (!details.length) return `<p class="text-xs text-slate-500">Sem payload detalhado.</p>`;
  return `<div class="mt-3 grid grid-cols-1 gap-2">${details.join("")}</div>`;
}

function renderEvent(event) {
  return `
    <article class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">${escapeHtml(event.action || "-")}</span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">${escapeHtml(event.entity || "-")}</span>
          </div>
          <p class="mt-2 text-sm font-semibold text-slate-900">${escapeHtml(event.entityId || "-")}</p>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(event.method || "-")} ${escapeHtml(event.route || "-")}</p>
        </div>
        <div class="text-left sm:text-right">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Quando</p>
          <p class="text-sm font-bold text-slate-900">${escapeHtml(formatDateTime(event.createdAt))}</p>
        </div>
      </div>
      <dl class="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
        <div><dt class="font-semibold text-slate-500">Ator</dt><dd>${escapeHtml(event.actorEmail || event.actorId || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Role</dt><dd>${escapeHtml(event.actorRole || event.role || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Request ID</dt><dd class="break-all">${escapeHtml(event.requestId || "-")}</dd></div>
        <div><dt class="font-semibold text-slate-500">Idempotency</dt><dd class="break-all">${escapeHtml(event.idempotencyKey || "-")}</dd></div>
      </dl>
      ${eventDetails(event)}
    </article>
  `;
}

export function renderAuditLoading(elements) {
  if (elements.feedback) {
    renderPanelMessage(elements.feedback, "Carregando auditoria operacional...");
  }
  if (elements.list) {
    elements.list.innerHTML = "<p class='text-sm text-slate-500'>Buscando eventos...</p>";
  }
}

export function renderAuditError(elements, message = "Falha ao carregar auditoria.") {
  if (elements.feedback) {
    renderPanelMessage(elements.feedback, message, "error");
  }
  if (elements.list) {
    elements.list.innerHTML = "";
  }
}

export function renderAuditData(elements, payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (elements.feedback) {
    renderPanelMessage(
      elements.feedback,
      events.length
        ? `${events.length} evento(s) encontrados no filtro atual.`
        : "Nenhum evento encontrado no filtro atual.",
      events.length ? "success" : "info",
    );
  }
  if (!elements.list) return;
  if (!events.length) {
    elements.list.innerHTML = `
      <article class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        Nenhum evento de auditoria encontrado.
      </article>
    `;
    return;
  }
  elements.list.innerHTML = events.map(renderEvent).join("");
}
