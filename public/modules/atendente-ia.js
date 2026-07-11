import { escapeHtml } from "./sanitize.js";

export const AI_QUICK_SUGGESTIONS = [
  "Fiz corte no Joao e ele pagou no Pix.",
  "Vendi uma pomada para o Lucas.",
  "Agenda o Pedro amanha as 10h para corte.",
  "Cancelei o horario do Carlos porque ele avisou que nao vem.",
  "Quanto vendi hoje?",
];

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatValue(value) {
  if (typeof value === "number") return money(value) || String(value);
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function intentLabel(intent = "") {
  const labels = {
    checkout_service: "Atendimento / checkout",
    product_sale: "Venda de produto",
    schedule_appointment: "Agendamento",
    cancel_appointment: "Cancelamento",
    report_query: "Consulta de relatorio",
    unknown: "Nao identificado",
  };
  return labels[intent] || labels.unknown;
}

export function renderAtendenteIaShell() {
  return `
    <div class="ai-owner-workbench">
      <header class="op-page-header">
        <div class="op-page-header-main">
          <h1 class="op-page-title">Atendente IA</h1>
          <p class="op-page-subtitle">Interprete comandos do dono e prepare uma previa antes de qualquer acao.</p>
        </div>
      </header>

      <section class="ux-card ai-owner-panel">
        <div class="ai-owner-fixed-warning">
          A IA apenas prepara a acao. Nada e executado sem confirmacao.
        </div>

        <label class="ds-form-label" for="aiOwnerMessage">Mensagem do dono</label>
        <textarea id="aiOwnerMessage" class="ds-input ai-owner-textarea" rows="5" maxlength="1000" placeholder="Ex.: Fiz corte e barba no Joao, ele pagou 50 no Pix."></textarea>

        <div class="ai-owner-suggestions" aria-label="Sugestoes rapidas">
          ${AI_QUICK_SUGGESTIONS.map((item) => `<button type="button" class="ux-btn ux-btn-muted" data-ai-suggestion="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}
        </div>

        <div class="catalog-row-actions">
          <button type="button" id="aiOwnerInterpretBtn" class="ux-btn ux-btn-primary">Interpretar</button>
          <button type="button" id="aiOwnerConfirmBtn" class="ux-btn ux-btn-muted" disabled>Confirmar acao</button>
        </div>
        <p class="ds-text-muted">Execucao sera liberada na proxima etapa.</p>
      </section>

      <section class="ux-card ai-owner-preview">
        <h2 class="ux-section-label">Previa estruturada</h2>
        <div id="aiOwnerFeedback" class="ds-mb"></div>
        <div id="aiOwnerPreview">${renderAtendenteIaEmpty()}</div>
      </section>
    </div>
  `;
}

export function renderAtendenteIaEmpty() {
  return `<p class="ds-text-muted">Digite uma mensagem ou use uma sugestao rapida para gerar a previa.</p>`;
}

export function renderAtendenteIaLoading() {
  return `<p class="ds-text-muted">Interpretando mensagem com IA...</p>`;
}

export function renderAtendenteIaError(message = "Nao foi possivel interpretar a mensagem.") {
  return `<div class="panel-message panel-message-error">${escapeHtml(message)}</div>`;
}

export function renderAtendenteIaPreview(payload = {}) {
  const draft = payload.draft && typeof payload.draft === "object" ? payload.draft : {};
  const missing = Array.isArray(payload.missingFields) ? payload.missingFields : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const draftRows = Object.entries(draft);

  return `
    <div class="ai-owner-preview-grid">
      <div><dt>Modo</dt><dd>${escapeHtml(payload.mode || "preview_only")}</dd></div>
      <div><dt>Intencao</dt><dd>${escapeHtml(intentLabel(payload.intent))}</dd></div>
      <div><dt>Confianca</dt><dd>${escapeHtml(`${Math.round(Number(payload.confidence || 0) * 100)}%`)}</dd></div>
      <div><dt>Executado</dt><dd>${payload.executed === false ? "Nao" : "Nao"}</dd></div>
    </div>
    <div class="owner-flow-summary">${escapeHtml(payload.summary || "Previa sem resumo.")}</div>
    <section class="catalog-list">
      ${
        draftRows.length
          ? draftRows.map(([key, value]) => `
              <article class="catalog-row">
                <div class="catalog-row-main">
                  <div class="catalog-row-copy">
                    <strong>${escapeHtml(key)}</strong>
                    <span>${escapeHtml(formatValue(value))}</span>
                  </div>
                </div>
              </article>
            `).join("")
          : `<p class="ds-text-muted">Nenhum campo estruturado identificado.</p>`
      }
    </section>
    ${
      missing.length
        ? `<div class="panel-message panel-message-warning">Campos faltantes: ${escapeHtml(missing.join(", "))}</div>`
        : ""
    }
    ${
      warnings.length
        ? `<div class="panel-message panel-message-warning">${warnings.map((item) => escapeHtml(item)).join("<br>")}</div>`
        : ""
    }
  `;
}
