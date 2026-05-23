import { renderStatusChip } from "../components/operational-ui.js";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function kpi(title, value, subtitle = "", tone = "") {
  return `
    <article class="ux-kpi">
      <div class="ux-label">${escapeHtml(title)}</div>
      <div class="ux-value-sm ${tone}">${escapeHtml(value)}</div>
      ${subtitle ? `<div class="ux-hint">${escapeHtml(subtitle)}</div>` : ""}
    </article>
  `;
}

function emptyItem(message) {
  return `<p class="ds-text-muted">${escapeHtml(message)}</p>`;
}

function subscriptionChipStatus(status = "") {
  const s = String(status).toUpperCase();
  if (s === "ACTIVE") return "PAID";
  if (s === "PAST_DUE" || s === "PENDING") return "WARNING";
  return "CANCELED";
}

export function renderFidelizacaoLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando fidelizacao premium...");
  if (elements.packages) renderPanelMessage(elements.packages, "Carregando pacotes...");
  if (elements.subscriptions) renderPanelMessage(elements.subscriptions, "Carregando assinaturas...");
  if (elements.retention) renderPanelMessage(elements.retention, "Carregando retencao...");
  if (elements.multiunit) renderPanelMessage(elements.multiunit, "Carregando consolidado multiunidade...");
}

export function renderFidelizacaoError(elements, message = "Falha ao carregar modulo de fidelizacao.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
}

export function renderFidelizacaoData(elements, payload) {
  const loyalty = payload?.loyalty ?? { program: null, summary: {} };
  const packages = Array.isArray(payload?.packages?.packages) ? payload.packages.packages : [];
  const subscriptions = payload?.subscriptions ?? { summary: {}, subscriptions: [] };
  const retention = payload?.retention ?? { summary: {}, cases: [] };
  const multiunit = payload?.multiunit ?? { summary: {}, units: [] };

  if (elements.summary) {
    const programInfo = loyalty.program
      ? `${loyalty.program.type} — taxa ${toNumber(loyalty.program.conversionRate).toFixed(2)}`
      : "Nao configurado";
    elements.summary.innerHTML = `
      <div class="ds-kpi-row">
        ${kpi("Programa", loyalty.program?.name || "Nao configurado", programInfo)}
        ${kpi("Pontos creditados", toNumber(loyalty.summary.earned).toFixed(2), "Pontos acumulados", "ds-kpi-tone-success")}
        ${kpi("Pontos resgatados", toNumber(loyalty.summary.redeemed).toFixed(2), "Pontos utilizados", "ds-kpi-tone-warning")}
        ${kpi("MRR assinaturas", money(subscriptions.summary.mrr), "Receita recorrente mensal")}
        ${kpi("Receita consolidada", money(multiunit.summary.totalRevenue), "Multiunidade")}
      </div>
    `;
  }

  if (elements.packages) {
    elements.packages.innerHTML = packages.length
      ? `
        <section class="reports-detail-list">
          ${packages
            .map(
              (item) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${toNumber(item.sessionsTotal)} sessoes — validade ${toNumber(item.validityDays)} dias</span>
                  </div>
                  <div class="reports-row-value">
                    <strong>${escapeHtml(money(item.price))}</strong>
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Nenhum pacote ativo.");
  }

  if (elements.subscriptions) {
    const rows = Array.isArray(subscriptions.subscriptions) ? subscriptions.subscriptions : [];
    elements.subscriptions.innerHTML = `
      <p class="op-list-summary">Ativas: ${toNumber(subscriptions.summary.active)} | Atrasadas: ${toNumber(subscriptions.summary.pastDue)} | Canceladas: ${toNumber(subscriptions.summary.cancelled)}</p>
      ${
        rows.length
          ? `
            <section class="reports-detail-list">
              ${rows
                .slice(0, 6)
                .map(
                  (item) => `
                    <article class="reports-detail-row">
                      <div>
                        <strong>${escapeHtml(item.planName || item.planId)}</strong>
                        <span>Proxima cobranca: ${new Date(item.nextBillingAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div class="reports-row-value">
                        ${renderStatusChip(subscriptionChipStatus(item.status), { label: item.status })}
                      </div>
                    </article>
                  `,
                )
                .join("")}
            </section>
          `
          : emptyItem("Sem assinaturas para o periodo.")
      }
    `;
  }

  if (elements.retention) {
    const rows = Array.isArray(retention.cases) ? retention.cases : [];
    elements.retention.innerHTML = rows.length
      ? `
        <section class="reports-detail-list">
          ${rows
            .slice(0, 8)
            .map(
              (item) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(item.clientName || item.clientId)}</strong>
                    <span>${toNumber(item.daysWithoutReturn)} dias sem retorno</span>
                    <span>${escapeHtml(item.recommendedAction || "-")}</span>
                  </div>
                  <div class="reports-row-value">
                    ${renderStatusChip("WARNING", { label: item.riskLevel || "Risco" })}
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Sem casos de retencao abertos.");
  }

  if (elements.multiunit) {
    const rows = Array.isArray(multiunit.units) ? multiunit.units : [];
    elements.multiunit.innerHTML = rows.length
      ? `
        <section class="reports-detail-list">
          ${rows
            .map(
              (item) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(item.unitName)}</strong>
                    <span>Atend. ${toNumber(item.appointments)} | Conc. ${toNumber(item.completed)} | Ocup. ${toNumber(item.occupancyRate)}%</span>
                  </div>
                  <div class="reports-row-value">
                    <strong>${escapeHtml(money(item.revenue))}</strong>
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `
      : emptyItem("Sem dados de multiunidade para o periodo.");
  }
}
