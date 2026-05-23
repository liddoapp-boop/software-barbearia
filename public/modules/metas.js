import { renderStatusChip, renderEmptyState } from "../components/operational-ui.js";
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

function pct(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paceMeta(status) {
  if (status === "ABOVE_RHYTHM") {
    return {
      label: "Acima do ritmo",
      chipStatus: "PAID",
      barTone: "tone-success",
      message: "A operacao esta performando acima da expectativa do periodo.",
    };
  }
  if (status === "ON_TRACK") {
    return {
      label: "Dentro do ritmo",
      chipStatus: "WARNING",
      barTone: "tone-warning",
      message: "A meta segue no ritmo esperado. Mantenha a consistencia diaria.",
    };
  }
  return {
    label: "Abaixo do ritmo",
    chipStatus: "CANCELED",
    barTone: "tone-danger",
    message: "A operacao esta abaixo do ritmo esperado e requer acao imediata.",
  };
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

function emptyBlock(message) {
  return `<p class="ds-text-muted">${escapeHtml(message)}</p>`;
}

export function renderMetasLoading(elements) {
  if (elements.feedback) renderPanelMessage(elements.feedback, "Carregando metas e performance...");
  if (elements.cards) renderPanelMessage(elements.cards, "Calculando indicadores da meta...");
  if (elements.progress) renderPanelMessage(elements.progress, "Calculando ritmo de desempenho...");
  if (elements.professionals) renderPanelMessage(elements.professionals, "Carregando ranking de profissionais...");
  if (elements.services) renderPanelMessage(elements.services, "Carregando servicos mais relevantes...");
  if (elements.insights) renderPanelMessage(elements.insights, "Gerando insights acionaveis...");
}

export function renderMetasError(elements, message = "Falha ao carregar metas e performance.") {
  if (elements.feedback) renderPanelMessage(elements.feedback, message, "error");
  if (elements.cards) elements.cards.innerHTML = emptyBlock("Nao foi possivel calcular os indicadores da meta.");
  if (elements.progress) elements.progress.innerHTML = emptyBlock("Nao foi possivel calcular o progresso da meta.");
  if (elements.professionals) elements.professionals.innerHTML = emptyBlock("Nao foi possivel carregar ranking de profissionais.");
  if (elements.services) elements.services.innerHTML = emptyBlock("Nao foi possivel carregar ranking de servicos.");
  if (elements.insights) elements.insights.innerHTML = emptyBlock("Nao foi possivel gerar insights acionaveis.");
}

export function renderMetasData(elements, payload = {}) {
  const summary = payload.summary || {};
  const professionalsPayload = payload.professionals || {};
  const servicesPayload = payload.services || {};
  const goal = summary.goal || null;
  const metrics = summary.metrics || {};
  const professionals = Array.isArray(professionalsPayload.professionals) ? professionalsPayload.professionals : [];
  const services = Array.isArray(servicesPayload.services) ? servicesPayload.services : [];
  const insights = Array.isArray(summary.insights) ? summary.insights : [];

  if (elements.feedback) {
    if (!goal) {
      renderPanelMessage(elements.feedback, "Voce ainda nao definiu uma meta para este mes. Defina a meta para acompanhar desempenho e ritmo.", "warning");
    } else {
      renderPanelMessage(elements.feedback, "Painel de metas carregado. Use os rankings e insights para ajustar a operacao ao longo do mes.", "success");
    }
  }

  if (!goal) {
    if (elements.cards) {
      elements.cards.innerHTML = `
        <div class="metas-no-goal">
          <p>Voce ainda nao definiu uma meta para este mes.</p>
          <p>Definir uma meta ajuda a acompanhar o desempenho da empresa e entender quanto falta para atingir o resultado esperado.</p>
          <button type="button" data-metas-action="open-goal-modal" class="ux-btn ux-btn-primary">Definir meta agora</button>
        </div>
      `;
    }
    if (elements.progress) elements.progress.innerHTML = emptyBlock("Defina uma meta para habilitar o progresso visual e o status de ritmo.");
    if (elements.professionals) elements.professionals.innerHTML = emptyBlock("Ainda nao ha atendimentos concluidos suficientes para calcular a performance.");
    if (elements.services) elements.services.innerHTML = emptyBlock("Ainda nao ha atendimentos concluidos suficientes para calcular a performance.");
    if (elements.insights) elements.insights.innerHTML = emptyBlock("Defina uma meta para receber recomendacoes acionaveis.");
    return;
  }

  const pace = paceMeta(metrics.paceStatus);
  const progressPercent = Math.min(Math.max(toNumber(metrics.goalProgressPercent), 0), 999);

  if (elements.cards) {
    elements.cards.innerHTML = `
      <div class="ds-kpi-row">
        ${kpi("Meta mensal", money(goal.revenueTarget), `${goal.month}/${goal.year}`)}
        ${kpi("Faturamento atual", money(metrics.revenueCurrent), "Receita de atendimentos + vendas", "ds-kpi-tone-success")}
        ${kpi("Percentual atingido", pct(metrics.goalProgressPercent), "Progresso da meta")}
        ${kpi("Valor faltante", money(metrics.remainingAmount), "Quanto falta para bater a meta", "ds-kpi-tone-warning")}
        ${kpi("Ritmo necessario/dia", money(metrics.requiredRevenuePerDay), `${toNumber(metrics.daysRemaining)} dias restantes`, "ds-kpi-tone-danger")}
        ${kpi("Ticket medio atual", money(metrics.ticketAverageCurrent), goal.averageTicketTarget ? `Meta: ${money(goal.averageTicketTarget)}` : "Sem meta de ticket")}
        ${kpi("Atendimentos concluidos", String(toNumber(metrics.appointmentsCompleted)), `Meta: ${toNumber(goal.appointmentsTarget)}`)}
        ${kpi("Dias restantes", String(toNumber(metrics.daysRemaining)), `Mes com ${toNumber(metrics.daysTotal)} dias`)}
      </div>
    `;
  }

  if (elements.progress) {
    elements.progress.innerHTML = `
      <article class="metas-progress-block">
        <div class="metas-progress-head">
          <div>
            <div class="ux-label">Progresso da meta</div>
            <div class="ux-value-sm">${escapeHtml(pct(metrics.goalProgressPercent))}</div>
            <div class="ux-hint">${escapeHtml(money(metrics.revenueCurrent))} de ${escapeHtml(money(goal.revenueTarget))}</div>
          </div>
          ${renderStatusChip(pace.chipStatus, { label: pace.label })}
        </div>
        <div class="metas-progress-track">
          <div class="metas-progress-bar ${pace.barTone}" style="width: ${Math.min(progressPercent, 100)}%"></div>
        </div>
        <p class="metas-progress-message">${escapeHtml(pace.message)}</p>
      </article>
    `;
  }

  if (elements.professionals) {
    if (!professionals.length) {
      elements.professionals.innerHTML = emptyBlock("Ainda nao ha atendimentos concluidos suficientes para calcular a performance.");
    } else {
      elements.professionals.innerHTML = `
        <section class="reports-detail-list metas-rank-list">
          ${professionals
            .slice(0, 6)
            .map(
              (row) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>#${toNumber(row.rank)} ${escapeHtml(row.name)}</strong>
                    <span>${toNumber(row.completedAppointments)} atend. · Ticket ${escapeHtml(money(row.ticketAverage))} · Ocup. ${escapeHtml(pct(row.occupancyRate))}</span>
                    <span>Comissao est. ${escapeHtml(money(row.commissionEstimated))}</span>
                  </div>
                  <div class="reports-row-value">
                    <strong>${escapeHtml(money(row.revenue))}</strong>
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `;
    }
  }

  if (elements.services) {
    if (!services.length) {
      elements.services.innerHTML = emptyBlock("Ainda nao ha atendimentos concluidos suficientes para calcular a performance.");
    } else {
      elements.services.innerHTML = `
        <section class="reports-detail-list metas-rank-list">
          ${services
            .slice(0, 6)
            .map(
              (row) => `
                <article class="reports-detail-row">
                  <div>
                    <strong>${escapeHtml(row.name)}</strong>
                    <span>${toNumber(row.quantity)} realizados · Ticket ${escapeHtml(money(row.ticketAverage))}</span>
                  </div>
                  <div class="reports-row-value">
                    <strong>${escapeHtml(money(row.revenue))}</strong>
                    <span>${escapeHtml(pct(row.sharePct))} da receita</span>
                  </div>
                </article>
              `,
            )
            .join("")}
        </section>
      `;
    }
  }

  if (elements.insights) {
    elements.insights.innerHTML = insights.length
      ? `<ul class="metas-insights-list">${insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : emptyBlock("Ainda nao ha insights suficientes para este periodo.");
  }
}
