function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber(value));
}

function percentDelta(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function trendTone(value) {
  if (value > 0) return "gain";
  if (value < 0) return "risk";
  return "neutral";
}

function trendClass(tone) {
  if (tone === "gain") return "ds-kpi-tone-success";
  if (tone === "risk") return "ds-kpi-tone-danger";
  return "ds-kpi-tone-warning";
}

function trendLabel(value) {
  if (value > 0) return "subindo";
  if (value < 0) return "caindo";
  return "estavel";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function emptyState(message) {
  return `<div class="op-empty-state"><p class="op-empty-description">${message}</p></div>`;
}

function encodePayload(payload) {
  return encodeURIComponent(JSON.stringify(payload || {}));
}

function severityTone(level) {
  if (level === "HIGH") return "danger";
  if (level === "LOW") return "accent";
  return "warning";
}

function parseBand(band) {
  if (band === "MORNING") return "08:00-12:00";
  if (band === "AFTERNOON") return "12:00-17:00";
  if (band === "EVENING") return "17:00-21:00";
  return "faixa nao definida";
}

function getSuggestionByType(suggestions, type) {
  return suggestions.find((item) => item.actionType === type) || null;
}

function buildActionCard(options) {
  const {
    title,
    description,
    impact,
    suggestion,
    actionType,
    ctaLabel,
    tone,
    payload,
  } = options;
  const toneClass =
    tone === "gain" ? "ds-action-card-success"
    : tone === "risk" ? "ds-action-card-danger"
    : "ds-action-card-warning";
  const suggestionId = suggestion?.id || `manual-${actionType}`;
  const ctaModule = suggestion?.ctaModule || "dashboard";
  const estimatedImpact = asNumber(suggestion?.estimatedImpact, impact);
  const actionPayload = suggestion?.actionPayload || payload || {};

  return `
    <article class="ds-action-card ${toneClass}">
      <div class="ds-action-title">${title}</div>
      <p class="ds-action-body">${description}</p>
      <div class="ds-action-impact">Impacto estimado: ${currency(estimatedImpact)}</div>
      <div class="ds-action-footer">
        <button
          type="button"
          class="ux-btn ux-btn-primary"
          data-dashboard-cta="1"
          data-suggestion-id="${suggestionId}"
          data-action-type="${actionType}"
          data-cta-module="${ctaModule}"
          data-estimated-impact="${estimatedImpact}"
          data-action-payload="${encodePayload(actionPayload)}"
        >
          ${ctaLabel}
        </button>
        <button
          type="button"
          class="ux-btn ux-btn-muted"
          data-dashboard-ignore="1"
          data-suggestion-id="${suggestionId}"
          data-action-type="${actionType}"
          data-estimated-impact="${estimatedImpact}"
        >
          Ignorar
        </button>
      </div>
    </article>
  `;
}

export function normalizeDashboardPayload(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const rawForecast = safeObject(raw.forecast);
  const rawForecastBasis = safeObject(rawForecast.basis);
  const rawTelemetry = safeObject(raw.suggestionTelemetry);
  const rawPlaybookHistory = safeObject(raw.playbookHistory);
  const rawPlaybookHistorySummary = safeObject(rawPlaybookHistory.summary);
  const rawThresholdTuning = safeObject(raw.thresholdTuning);
  const rawAutomationSignals = safeObject(raw.automationSignals);
  const rawClientsOverview = safeObject(raw.clientsOverview);
  const rawClientsSummary = safeObject(rawClientsOverview.summary);
  const rawFinancialOverview = safeObject(raw.financialOverview);
  const rawFinancialSummary = safeObject(rawFinancialOverview.summary);
  const rawFinancialCurrent = safeObject(rawFinancialSummary.current);
  const rawStockOverview = safeObject(raw.stockOverview);
  const rawStockTotals = safeObject(rawStockOverview.totals);
  const rawAutomationsOverview = safeObject(raw.automationsOverview);
  const rawScoringOverview = safeObject(raw.scoringOverview);

  return {
    appointmentsToday: asNumber(raw.appointmentsToday),
    completedToday: asNumber(raw.completedToday),
    cancelledToday: asNumber(raw.cancelledToday),
    noShowToday: asNumber(raw.noShowToday),
    revenueToday: asNumber(raw.revenueToday),
    revenueWeek: asNumber(raw.revenueWeek),
    revenueMonth: asNumber(raw.revenueMonth),
    revenuePrevWeek: asNumber(raw.revenuePrevWeek),
    revenuePrevMonth: asNumber(raw.revenuePrevMonth),
    profitEstimatedMonth: asNumber(raw.profitEstimatedMonth),
    ticketAverageOverall: asNumber(raw.ticketAverageOverall),
    occupancyRate: asNumber(raw.occupancyRate),
    cancellationRate: asNumber(raw.cancellationRate),
    noShowRate: asNumber(raw.noShowRate),
    goalMonth: asNumber(raw.goalMonth),
    goalProgress: asNumber(raw.goalProgress),
    topProfessionals: safeArray(raw.topProfessionals),
    topServices: safeArray(raw.topServices),
    topProducts: safeArray(raw.topProducts),
    clientsOverdue: safeArray(raw.clientsOverdue),
    criticalAlerts: safeArray(raw.criticalAlerts),
    lowStock: safeArray(raw.lowStock),
    financialSummary: safeObject(raw.financialSummary),
    commissionsByProfessional: safeArray(raw.commissionsByProfessional),
    professionalPerformance: safeArray(raw.professionalPerformance),
    topClients: safeArray(raw.topClients),
    lostRevenueEstimate: asNumber(raw.lostRevenueEstimate),
    forecast: {
      day: asNumber(rawForecast.day),
      week: asNumber(rawForecast.week),
      month: asNumber(rawForecast.month),
      prevDay: asNumber(rawForecast.prevDay),
      prevWeek: asNumber(rawForecast.prevWeek),
      prevMonth: asNumber(rawForecast.prevMonth),
      deltaDayPct: asNumber(rawForecast.deltaDayPct),
      deltaWeekPct: asNumber(rawForecast.deltaWeekPct),
      deltaMonthPct: asNumber(rawForecast.deltaMonthPct),
      confidence: asNumber(rawForecast.confidence),
      basis: {
        scheduledRevenueDay: asNumber(rawForecastBasis.scheduledRevenueDay),
        scheduledRevenueWeek: asNumber(rawForecastBasis.scheduledRevenueWeek),
        scheduledRevenueMonth: asNumber(rawForecastBasis.scheduledRevenueMonth),
        historicalConversionRate: asNumber(rawForecastBasis.historicalConversionRate),
        averageTicket: asNumber(rawForecastBasis.averageTicket),
      },
    },
    smartAlerts: safeArray(raw.smartAlerts),
    actionSuggestions: safeArray(raw.actionSuggestions),
    suggestionTelemetry: {
      total: asNumber(rawTelemetry.total),
      executed: asNumber(rawTelemetry.executed),
      ignored: asNumber(rawTelemetry.ignored),
      converted: asNumber(rawTelemetry.converted),
      conversionRate: asNumber(rawTelemetry.conversionRate),
      ignoredRate: asNumber(rawTelemetry.ignoredRate),
      estimatedImpactTracked: asNumber(rawTelemetry.estimatedImpactTracked),
      realizedRevenue: asNumber(rawTelemetry.realizedRevenue),
      netLiftEstimate: asNumber(rawTelemetry.netLiftEstimate),
      recentEvents: safeArray(rawTelemetry.recentEvents),
    },
    playbookHistory: {
      summary: {
        windowDays: asNumber(rawPlaybookHistorySummary.windowDays),
        totalPlaybooks: asNumber(rawPlaybookHistorySummary.totalPlaybooks),
        totalEvents: asNumber(rawPlaybookHistorySummary.totalEvents),
        executed: asNumber(rawPlaybookHistorySummary.executed),
        ignored: asNumber(rawPlaybookHistorySummary.ignored),
        converted: asNumber(rawPlaybookHistorySummary.converted),
        estimatedImpactTotal: asNumber(rawPlaybookHistorySummary.estimatedImpactTotal),
        realizedRevenueTotal: asNumber(rawPlaybookHistorySummary.realizedRevenueTotal),
        netImpact: asNumber(rawPlaybookHistorySummary.netImpact),
        conversionRate: asNumber(rawPlaybookHistorySummary.conversionRate),
      },
      items: safeArray(rawPlaybookHistory.items),
    },
    thresholdTuning: {
      calibrated: Boolean(rawThresholdTuning.calibrated),
      confidenceBoost: asNumber(rawThresholdTuning.confidenceBoost),
      adjustments: safeObject(rawThresholdTuning.adjustments),
      rationale: safeArray(rawThresholdTuning.rationale),
    },
    automationSignals: {
      queued: asNumber(rawAutomationSignals.queued),
      executed: asNumber(rawAutomationSignals.executed),
      failed: asNumber(rawAutomationSignals.failed),
      lastExecutedAt:
        typeof rawAutomationSignals.lastExecutedAt === "string"
          ? rawAutomationSignals.lastExecutedAt
          : null,
      topPlaybooks: safeArray(rawAutomationSignals.topPlaybooks),
    },
    clientsOverview: {
      summary: {
        totalClients: asNumber(rawClientsSummary.totalClients),
        atRisk: asNumber(rawClientsSummary.atRisk),
        inactive: asNumber(rawClientsSummary.inactive),
        potentialReactivationRevenue: asNumber(rawClientsSummary.potentialReactivationRevenue),
      },
      reactivationQueue: safeArray(rawClientsOverview.reactivationQueue),
    },
    financialOverview: {
      summary: {
        current: {
          grossRevenue: asNumber(rawFinancialCurrent.grossRevenue),
          operationalProfit: asNumber(rawFinancialCurrent.operationalProfit),
          operationalMarginPct: asNumber(rawFinancialCurrent.operationalMarginPct),
        },
      },
    },
    stockOverview: {
      totals: {
        lowStockCount: asNumber(rawStockTotals.lowStockCount),
      },
      replenishmentSuggestions: safeArray(rawStockOverview.replenishmentSuggestions),
    },
    automationsOverview: {
      rules: safeObject(rawAutomationsOverview.rules),
      executions: safeObject(rawAutomationsOverview.executions),
    },
    scoringOverview: rawScoringOverview,
  };
}

export function renderDashboardLoading(elements) {
  const { kpiGrid, goalBlock, topProfessionalsList, alertsList, actionSuggestionsList } = elements;
  if (!kpiGrid || !goalBlock || !topProfessionalsList || !alertsList || !actionSuggestionsList) return;

  kpiGrid.innerHTML = Array.from({ length: 4 }, () => {
    return `
      <article class="ds-kpi" style="animation: pulse 1.4s ease infinite;">
        <div style="height:10px;width:100px;border-radius:6px;background:var(--color-border);margin-bottom:10px;"></div>
        <div style="height:30px;width:140px;border-radius:6px;background:var(--color-border);"></div>
        <div style="height:8px;width:80px;border-radius:6px;background:var(--color-border-soft);margin-top:10px;"></div>
      </article>
    `;
  }).join("");

  goalBlock.innerHTML = emptyState("Calculando progresso da meta mensal...");
  topProfessionalsList.innerHTML = emptyState("Carregando top profissional e servico...");
  alertsList.innerHTML = emptyState("Detectando riscos do dia...");
  actionSuggestionsList.innerHTML = emptyState("Preparando insights compactos...");
}

export function renderDashboardError(elements, onRetry) {
  const { kpiGrid, goalBlock, topProfessionalsList, alertsList, actionSuggestionsList } = elements;
  if (!kpiGrid || !goalBlock || !topProfessionalsList || !alertsList || !actionSuggestionsList) return;

  kpiGrid.innerHTML = `
    <article class="ds-alert ds-alert-danger" style="grid-column: 1 / -1;">
      <div class="ds-alert-label">Falha ao carregar</div>
      <div class="ds-alert-title">Painel de decisao indisponivel</div>
      <p class="ds-alert-body">Sem dados nao ha acao: reconecte a API e atualize.</p>
    </article>
  `;
  goalBlock.innerHTML = emptyState("Indicador indisponivel.");
  topProfessionalsList.innerHTML = emptyState("Performance indisponivel.");
  actionSuggestionsList.innerHTML = emptyState("Insights indisponiveis.");

  alertsList.innerHTML = `
    <article class="ds-alert ds-alert-danger">
      <div class="ds-alert-label">Alertas indisponiveis</div>
      <p class="ds-alert-body">Nao foi possivel montar alertas e prioridades.</p>
      <div style="margin-top:10px;">
        <button type="button" data-dashboard-retry class="ux-btn ux-btn-danger">
          Tentar novamente
        </button>
      </div>
    </article>
  `;
  const retryBtn = alertsList.querySelector("[data-dashboard-retry]");
  if (retryBtn && typeof onRetry === "function") {
    retryBtn.addEventListener("click", onRetry);
  }
}

export function renderDashboardData(elements, payload) {
  const dashboard = normalizeDashboardPayload(payload);
  const { kpiGrid, goalBlock, topProfessionalsList, alertsList, actionSuggestionsList } = elements;
  if (!kpiGrid || !goalBlock || !topProfessionalsList || !alertsList || !actionSuggestionsList) return;

  kpiGrid.innerHTML = `
    <article class="ds-kpi ds-kpi-success">
      <div class="ds-kpi-label">Receita hoje</div>
      <div class="ds-kpi-value">${currency(dashboard.revenueToday)}</div>
      <div class="ds-kpi-hint">Estou ganhando hoje?</div>
    </article>
    <article class="ds-kpi ds-kpi-accent">
      <div class="ds-kpi-label">Receita mes</div>
      <div class="ds-kpi-value">${currency(dashboard.revenueMonth)}</div>
      <div class="ds-kpi-hint">${percentDelta(dashboard.revenueMonth, dashboard.revenuePrevMonth) >= 0 ? "+" : ""}${percentDelta(dashboard.revenueMonth, dashboard.revenuePrevMonth).toFixed(1)}% vs mes anterior</div>
    </article>
    <article class="ds-kpi ds-kpi-accent">
      <div class="ds-kpi-label">Ocupacao</div>
      <div class="ds-kpi-value">${dashboard.occupancyRate.toFixed(1)}%</div>
      <div class="ds-kpi-hint">Estamos cheios ou vazios?</div>
    </article>
    <article class="ds-kpi ds-kpi-warning">
      <div class="ds-kpi-label">Meta mensal</div>
      <div class="ds-kpi-value">${dashboard.goalProgress.toFixed(1)}%</div>
      <div class="ds-kpi-progress"><div class="ds-kpi-progress-bar" style="width:${Math.min(dashboard.goalProgress, 100)}%;"></div></div>
    </article>
  `;

  goalBlock.innerHTML = `
    <article class="ds-kpi ds-kpi-warning">
      <div class="ds-kpi-label">Meta mensal ${currency(dashboard.goalMonth)}</div>
      <div class="ds-kpi-value">${dashboard.goalProgress.toFixed(1)}%</div>
      <div class="ds-kpi-progress"><div class="ds-kpi-progress-bar" style="width:${Math.min(dashboard.goalProgress, 100)}%;"></div></div>
      <div class="ds-kpi-hint">Faltam ${currency(Math.max(0, dashboard.goalMonth - dashboard.revenueMonth))} para bater a meta.</div>
    </article>
  `;

  const topProfessional = safeArray(dashboard.topProfessionals)[0];
  const topService = safeArray(dashboard.topServices)[0];
  topProfessionalsList.innerHTML = `
    <article class="ds-kpi ds-kpi-success">
      <div class="ds-kpi-label">Top profissional</div>
      <div class="ds-kpi-value" style="font-size:18px;">${topProfessional?.name || "Sem dados"}</div>
      <div class="ds-kpi-hint">Receita ${currency(topProfessional?.revenue || 0)}</div>
    </article>
    <article class="ds-kpi ds-kpi-accent">
      <div class="ds-kpi-label">Servico mais vendido</div>
      <div class="ds-kpi-value" style="font-size:18px;">${topService?.name || "Sem dados"}</div>
      <div class="ds-kpi-hint">${asNumber(topService?.salesCount)} vendas &middot; ${currency(topService?.revenueGenerated || 0)}</div>
    </article>
  `;

  const forecastDrop = safeArray(dashboard.smartAlerts).find((item) => item.type === "FORECAST_DROP");
  const idleAlerts = safeArray(dashboard.smartAlerts).filter((item) => item.type === "IDLE_WINDOW");
  const idleWindowsText = idleAlerts
    .slice(0, 4)
    .map((item) => {
      const scope = safeObject(item.scope);
      return `${scope.professionalName || "Profissional"} (${parseBand(scope.band)})`;
    });
  const atRiskCount = asNumber(dashboard.clientsOverview.summary.atRisk || dashboard.clientsOverdue.length);

  alertsList.innerHTML = `
    <article class="ds-alert ${forecastDrop ? "ds-alert-danger" : "ds-alert-success"}">
      <div class="ds-alert-label">Queda de faturamento</div>
      <div class="ds-alert-title">
        ${forecastDrop ? `Risco de queda detectado — impacto ${currency(forecastDrop.estimatedImpact)}` : "Sem queda relevante prevista no momento"}
      </div>
    </article>
    <article class="ds-alert ds-alert-warning">
      <div class="ds-alert-label">Horarios vazios</div>
      <div class="ds-alert-title">${idleAlerts.length} janela(s) sem agenda nas proximas 72h</div>
      <div class="ds-alert-body">${idleWindowsText.length ? idleWindowsText.join(" &middot; ") : "Nenhuma faixa critica no horizonte atual."}</div>
    </article>
    <article class="ds-alert ds-alert-danger">
      <div class="ds-alert-label">Clientes em risco</div>
      <div class="ds-alert-title">${atRiskCount} cliente(s) pedem reativacao imediata</div>
      <div class="ds-alert-body">Cada dia sem acao aumenta perda de recorrencia.</div>
    </article>
  `;

  const suggestions = safeArray(dashboard.actionSuggestions).sort(
    (a, b) => asNumber(b.priorityScore) - asNumber(a.priorityScore),
  );
  const reactivationSuggestion = getSuggestionByType(suggestions, "REACTIVATION_CAMPAIGN");
  const idleSuggestion = getSuggestionByType(suggestions, "FILL_IDLE_SLOTS");
  const reactivationImpact = asNumber(reactivationSuggestion?.estimatedImpact, 0);
  const idleImpact = asNumber(idleSuggestion?.estimatedImpact, 0);
  actionSuggestionsList.innerHTML = `
    <details class="ux-card" style="cursor:default;">
      <summary class="ux-label" style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;">
        <span>&#9654;</span> Ver insights
      </summary>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
        ${buildActionCard({
          title: "Reativar clientes inativos",
          description: "Abrir fila de reativacao para recuperar receita.",
          impact: reactivationImpact,
          suggestion: reactivationSuggestion,
          actionType: "REACTIVATION_CAMPAIGN",
          ctaLabel: reactivationSuggestion?.ctaLabel || "Abrir Clientes",
          tone: "gain",
          payload: { moduleId: "clientes" },
        })}
        ${buildActionCard({
          title: "Preencher horarios vazios",
          description: "Acionar campanha para preencher janelas ociosas.",
          impact: idleImpact,
          suggestion: idleSuggestion,
          actionType: "FILL_IDLE_SLOTS",
          ctaLabel: idleSuggestion?.ctaLabel || "Abrir Agenda",
          tone: "risk",
          payload: { moduleId: "agenda" },
        })}
      </div>
    </details>
  `;
}
