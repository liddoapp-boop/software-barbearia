import { renderStatusChip } from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function executionChipStatus(status = "") {
  const s = String(status).toUpperCase();
  if (s === "SUCCESS") return "PAID";
  if (s === "FAILED") return "CANCELED";
  return "WARNING";
}

function ruleTriggerLabel(triggerType) {
  if (triggerType === "INACTIVITY") return "Inatividade";
  if (triggerType === "BIRTHDAY") return "Aniversario";
  if (triggerType === "HIGH_RISK") return "Risco alto";
  return triggerType || "-";
}

function ruleChannelLabel(channel) {
  if (channel === "WHATSAPP") return "WhatsApp";
  if (channel === "SMS") return "SMS";
  if (channel === "EMAIL") return "E-mail";
  if (channel === "MANUAL") return "Manual";
  return channel || "-";
}

function ruleTargetLabel(target) {
  if (target === "SEGMENT") return "Segmento";
  if (target === "CLIENT") return "Cliente";
  return target || "-";
}

function kpi(title, value, subtitle = "", tone = "") {
  return `
    <article class="ux-kpi">
      <div class="ux-label">${escapeHtml(title)}</div>
      <div class="ux-value-sm ${tone}">${escapeHtml(String(value))}</div>
      ${subtitle ? `<div class="ux-hint">${escapeHtml(subtitle)}</div>` : ""}
    </article>
  `;
}

function emptyItem(message) {
  return `<p class="ds-text-muted">${escapeHtml(message)}</p>`;
}

export function renderAutomacoesLoading(elements) {
  if (elements.rules) renderPanelMessage(elements.rules, "Carregando regras de automacao...");
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando saude de automacoes...");
  if (elements.executions) renderPanelMessage(elements.executions, "Carregando execucoes...");
  if (elements.scoring) renderPanelMessage(elements.scoring, "Carregando scoring...");
  if (elements.logs) renderPanelMessage(elements.logs, "Carregando logs de integracoes...");
}

export function renderAutomacoesError(elements, message = "Falha ao carregar modulo de automacoes.") {
  if (elements.rules) renderPanelMessage(elements.rules, "Regras de automacao indisponiveis.", "error");
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.executions) renderPanelMessage(elements.executions, "Execucoes indisponiveis.", "error");
  if (elements.scoring) renderPanelMessage(elements.scoring, "Scoring indisponivel.", "error");
  if (elements.logs) renderPanelMessage(elements.logs, "Logs indisponiveis.", "error");
}

export function renderAutomacoesData(elements, payload) {
  const rulesRows = Array.isArray(payload?.rules?.rules) ? payload.rules.rules : [];
  const executionsSummary = payload?.executions?.summary ?? {};
  const executionRows = Array.isArray(payload?.executions?.executions) ? payload.executions.executions : [];
  const scoringRows = Array.isArray(payload?.scoring?.clients) ? payload.scoring.clients : [];
  const webhookSummary = payload?.webhookLogs?.summary ?? {};
  const webhookRows = Array.isArray(payload?.webhookLogs?.logs) ? payload.webhookLogs.logs : [];

  if (elements.rules) {
    elements.rules.innerHTML = rulesRows.length
      ? `
        <section class="catalog-list">
          ${rulesRows
            .map(
              (row) => `
                <article class="catalog-row">
                  <div class="catalog-row-main">
                    <div class="catalog-row-copy">
                      <div class="catalog-row-meta">
                        ${renderStatusChip(row.isActive ? "ACTIVE" : "CANCELED", { label: row.isActive ? "Ativa" : "Inativa" })}
                      </div>
                      <strong>${escapeHtml(row.name)}</strong>
                      <span>Trigger: ${escapeHtml(ruleTriggerLabel(row.triggerType))} | Canal: ${escapeHtml(ruleChannelLabel(row.channel))} | Alvo: ${escapeHtml(ruleTargetLabel(row.target))}</span>
                      <span>${escapeHtml(row.messageTemplate || "-")}</span>
                    </div>
                  </div>
                  <div class="catalog-row-action-strip">
                    <p>Atualizada em: ${escapeHtml(row.updatedAt ? new Date(row.updatedAt).toLocaleString("pt-BR") : "-")}</p>
                    <div class="catalog-row-actions">
                      <button type="button" data-edit-rule="${escapeHtml(row.id)}" class="ux-btn ux-btn-muted">Editar</button>
                      <button type="button" data-toggle-rule="${escapeHtml(row.id)}" data-next-active="${row.isActive ? "false" : "true"}" class="ux-btn ${row.isActive ? "ux-btn-muted" : "ux-btn-primary"}">${row.isActive ? "Desativar" : "Ativar"}</button>
                    </div>
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Sem regras para os filtros atuais.");
  }

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="ds-kpi-row">
        ${kpi("Regras", rulesRows.length, "Cadastradas")}
        ${kpi("Ativas", rulesRows.filter((row) => row.isActive).length, "", "ds-kpi-tone-success")}
        ${kpi("Execucoes", toNumber(executionsSummary.total), "No periodo")}
        ${kpi("Sucesso", toNumber(executionsSummary.success), "", "ds-kpi-tone-success")}
        ${kpi("Falha", toNumber(executionsSummary.failed), "", "ds-kpi-tone-danger")}
        ${kpi("Pendentes", toNumber(executionsSummary.pending), "", "ds-kpi-tone-warning")}
        ${kpi("Logs webhooks", toNumber(webhookSummary.total), "Integracoes")}
        ${kpi("Clientes em score", scoringRows.length, "")}
      </div>
    `;
  }

  if (elements.executions) {
    elements.executions.innerHTML = executionRows.length
      ? `
        <section class="reports-detail-list">
          ${executionRows
            .slice(0, 20)
            .map(
              (row) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(row.campaignType)}</strong>
                    <span>Cliente: ${escapeHtml(row.clientName || row.clientId || "N/A")} · Tentativas: ${toNumber(row.attempts)}</span>
                    <span>Inicio: ${escapeHtml(row.startedAt ? new Date(row.startedAt).toLocaleString("pt-BR") : "-")}</span>
                    ${row.errorMessage ? `<span class="ds-text-muted">${escapeHtml(row.errorMessage)}</span>` : ""}
                  </div>
                  <div class="reports-row-value">
                    ${renderStatusChip(executionChipStatus(row.status), { label: row.status })}
                    ${row.status === "FAILED" ? `<button type="button" data-reprocess-execution="${escapeHtml(row.id)}" class="ux-btn ux-btn-muted">Reprocessar</button>` : ""}
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Sem execucoes para os filtros atuais.");
  }

  if (elements.scoring) {
    elements.scoring.innerHTML = scoringRows.length
      ? `
        <section class="reports-detail-list">
          ${scoringRows
            .slice(0, 20)
            .map(
              (row) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(row.clientName || row.clientId)}</strong>
                    <span>Score: ${toNumber(row.riskScore).toFixed(2)} · Retorno: ${toNumber(row.returnProbability).toFixed(2)}%</span>
                    <span>${escapeHtml(Array.isArray(row.reasons) ? row.reasons.join(" | ") : "-")}</span>
                  </div>
                  <div class="reports-row-value">
                    ${renderStatusChip("WARNING", { label: row.riskLevel || "Risco" })}
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Sem clientes no scoring para os filtros atuais.");
  }

  if (elements.logs) {
    elements.logs.innerHTML = webhookRows.length
      ? `
        <section class="reports-detail-list">
          ${webhookRows
            .slice(0, 20)
            .map(
              (row) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(row.provider)}</strong>
                    <span>${escapeHtml(row.direction)} · HTTP ${toNumber(row.httpStatus)} · Tentativa ${toNumber(row.attempt)}</span>
                    <span>Correlation: ${escapeHtml(row.correlationId || "-")}</span>
                    ${row.errorMessage ? `<span class="ds-text-muted">${escapeHtml(row.errorMessage)}</span>` : ""}
                  </div>
                  <div class="reports-row-value">
                    ${renderStatusChip(row.status === "SUCCESS" ? "PAID" : "CANCELED", { label: row.status })}
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Sem logs de integracao para os filtros atuais.");
  }
}
