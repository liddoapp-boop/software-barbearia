import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusBadge(status) {
  if (status === "SUCCESS") return "bg-teal-100 text-teal-800";
  if (status === "FAILED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function webhookStatusBadge(status) {
  if (status === "SUCCESS") return "bg-teal-100 text-teal-800";
  return "bg-red-100 text-red-800";
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

export function renderAutomacoesLoading(elements) {
  if (elements.rules) {
    renderPanelMessage(elements.rules, "Carregando regras de automacao...");
  }
  if (elements.summary) {
    renderPanelMessage(elements.summary, "Carregando saude de automacoes...");
  }
  if (elements.executions) {
    renderPanelMessage(elements.executions, "Carregando execucoes...");
  }
  if (elements.scoring) {
    renderPanelMessage(elements.scoring, "Carregando scoring...");
  }
  if (elements.logs) {
    renderPanelMessage(elements.logs, "Carregando logs de integracoes...");
  }
}

export function renderAutomacoesError(elements, message = "Falha ao carregar modulo de automacoes.") {
  if (elements.rules) {
    renderPanelMessage(elements.rules, "Regras de automacao indisponiveis.", "error");
  }
  if (elements.summary) {
    renderPanelMessage(elements.summary, message, "error");
  }
  if (elements.executions) {
    renderPanelMessage(elements.executions, "Execucoes indisponiveis.", "error");
  }
  if (elements.scoring) {
    renderPanelMessage(elements.scoring, "Scoring indisponivel.", "error");
  }
  if (elements.logs) {
    renderPanelMessage(elements.logs, "Logs indisponiveis.", "error");
  }
}

export function renderAutomacoesData(elements, payload) {
  const rulesRows = Array.isArray(payload?.rules?.rules) ? payload.rules.rules : [];
  const executionsSummary = payload?.executions?.summary ?? {};
  const executionRows = Array.isArray(payload?.executions?.executions)
    ? payload.executions.executions
    : [];
  const scoringRows = Array.isArray(payload?.scoring?.clients) ? payload.scoring.clients : [];
  const webhookSummary = payload?.webhookLogs?.summary ?? {};
  const webhookRows = Array.isArray(payload?.webhookLogs?.logs) ? payload.webhookLogs.logs : [];

  if (elements.rules) {
    elements.rules.innerHTML = rulesRows.length
      ? rulesRows
          .map(
            (row) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <strong class="text-sm text-gray-900">${row.name}</strong>
                  <span class="text-xs px-2 py-0.5 rounded-full ${row.isActive ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-700"}">
                    ${row.isActive ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div class="mt-1 text-xs text-gray-600">
                  Trigger: ${ruleTriggerLabel(row.triggerType)} | Canal: ${ruleChannelLabel(row.channel)} | Alvo: ${ruleTargetLabel(row.target)}
                </div>
                <div class="text-xs text-gray-600 mt-1">
                  Template: ${row.messageTemplate || "-"}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  Atualizada em: ${row.updatedAt ? new Date(row.updatedAt).toLocaleString("pt-BR") : "-"}
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-edit-rule="${row.id}"
                    class="rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 px-3 py-1.5 text-xs font-semibold"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    data-toggle-rule="${row.id}"
                    data-next-active="${row.isActive ? "false" : "true"}"
                    class="rounded-lg ${row.isActive ? "bg-amber-600 hover:bg-amber-700" : "bg-teal-700 hover:bg-teal-800"} text-white px-3 py-1.5 text-xs font-semibold"
                  >
                    ${row.isActive ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </article>
            `,
          )
          .join("")
      : emptyMessage("Sem regras para os filtros atuais.");
  }

  if (elements.summary) {
    elements.summary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-8 gap-2">
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Regras</div>
          <div class="text-lg font-bold text-gray-900">${rulesRows.length}</div>
        </article>
        <article class="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <div class="text-xs text-teal-700">Regras ativas</div>
          <div class="text-lg font-bold text-teal-800">${rulesRows.filter((item) => item.isActive).length}</div>
        </article>
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Execucoes</div>
          <div class="text-lg font-bold text-gray-900">${toNumber(executionsSummary.total)}</div>
        </article>
        <article class="rounded-lg border border-teal-200 bg-teal-50 p-3">
          <div class="text-xs text-teal-700">Sucesso</div>
          <div class="text-lg font-bold text-teal-800">${toNumber(executionsSummary.success)}</div>
        </article>
        <article class="rounded-lg border border-red-200 bg-red-50 p-3">
          <div class="text-xs text-red-700">Falha</div>
          <div class="text-lg font-bold text-red-800">${toNumber(executionsSummary.failed)}</div>
        </article>
        <article class="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div class="text-xs text-amber-700">Pendentes</div>
          <div class="text-lg font-bold text-amber-800">${toNumber(executionsSummary.pending)}</div>
        </article>
        <article class="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div class="text-xs text-indigo-700">Logs webhooks</div>
          <div class="text-lg font-bold text-indigo-800">${toNumber(webhookSummary.total)}</div>
        </article>
        <article class="rounded-lg border border-gray-200 bg-white p-3">
          <div class="text-xs text-gray-500">Clientes em score</div>
          <div class="text-lg font-bold text-gray-900">${scoringRows.length}</div>
        </article>
      </div>
    `;
  }

  if (elements.executions) {
    elements.executions.innerHTML = executionRows.length
      ? executionRows
          .slice(0, 20)
          .map(
            (row) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2">
                  <strong class="text-sm text-gray-800">${row.campaignType}</strong>
                  <span class="text-xs px-2 py-0.5 rounded-full ${statusBadge(row.status)}">${row.status}</span>
                </div>
                <div class="mt-1 text-xs text-gray-600">
                  Cliente: ${row.clientName || row.clientId || "N/A"} | Tentativas: ${toNumber(row.attempts)}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  Inicio: ${row.startedAt ? new Date(row.startedAt).toLocaleString("pt-BR") : "-"}
                </div>
                ${
                  row.errorMessage
                    ? `<div class="text-xs text-red-700 mt-1">${row.errorMessage}</div>`
                    : ""
                }
                ${
                  row.status === "FAILED"
                    ? `<button type="button" data-reprocess-execution="${row.id}" class="mt-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 text-xs font-semibold">Reprocessar</button>`
                    : ""
                }
              </article>
            `,
          )
          .join("")
      : emptyMessage("Sem execucoes para os filtros atuais.");
  }

  if (elements.scoring) {
    elements.scoring.innerHTML = scoringRows.length
      ? scoringRows
          .slice(0, 20)
          .map(
            (row) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2">
                  <strong class="text-sm text-gray-800">${row.clientName || row.clientId}</strong>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">${row.riskLevel}</span>
                </div>
                <div class="text-xs text-gray-600 mt-1">Score: ${toNumber(row.riskScore).toFixed(2)} | Retorno: ${toNumber(row.returnProbability).toFixed(2)}%</div>
                <div class="text-xs text-gray-500 mt-1">${Array.isArray(row.reasons) ? row.reasons.join(" | ") : "-"}</div>
              </article>
            `,
          )
          .join("")
      : emptyMessage("Sem clientes no scoring para os filtros atuais.");
  }

  if (elements.logs) {
    elements.logs.innerHTML = webhookRows.length
      ? webhookRows
          .slice(0, 20)
          .map(
            (row) => `
              <article class="rounded-lg border border-gray-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2">
                  <strong class="text-sm text-gray-800">${row.provider}</strong>
                  <span class="text-xs px-2 py-0.5 rounded-full ${webhookStatusBadge(row.status)}">${row.status}</span>
                </div>
                <div class="mt-1 text-xs text-gray-600">
                  ${row.direction} | HTTP ${toNumber(row.httpStatus)} | Tentativa ${toNumber(row.attempt)}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  Correlation: ${row.correlationId || "-"}
                </div>
                ${
                  row.errorMessage
                    ? `<div class="text-xs text-red-700 mt-1">${row.errorMessage}</div>`
                    : ""
                }
              </article>
            `,
          )
          .join("")
      : emptyMessage("Sem logs de integracao para os filtros atuais.");
  }
}

function emptyMessage(message) {
  return `<div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">${message}</div>`;
}
