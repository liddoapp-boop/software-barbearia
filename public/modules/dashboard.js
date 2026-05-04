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
  if (tone === "gain") return "text-emerald-700";
  if (tone === "risk") return "text-red-700";
  return "text-amber-700";
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
  return `<div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">${message}</div>`;
}

function encodePayload(payload) {
  return encodeURIComponent(JSON.stringify(payload || {}));
}

function severityStyle(level) {
  if (level === "HIGH") return "border-red-200 bg-red-50 text-red-900";
  if (level === "LOW") return "border-blue-200 bg-blue-50 text-blue-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
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
  const style =
    tone === "gain"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "risk"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-amber-200 bg-amber-50 text-amber-900";
  const suggestionId = suggestion?.id || `manual-${actionType}`;
  const ctaModule = suggestion?.ctaModule || "dashboard";
  const estimatedImpact = asNumber(suggestion?.estimatedImpact, impact);
  const actionPayload = suggestion?.actionPayload || payload || {};

  return `
    <article class="rounded-xl border p-3 ${style}">
      <div class="text-sm font-extrabold">${title}</div>
      <p class="text-xs mt-1">${description}</p>
      <div class="mt-2 text-xs font-semibold">Impacto estimado: ${currency(estimatedImpact)}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold"
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
          class="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 text-xs font-semibold"
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
      <article class="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
        <div class="h-3 w-28 bg-slate-200 rounded"></div>
        <div class="h-8 w-40 bg-slate-200 rounded mt-3"></div>
        <div class="h-2 w-24 bg-slate-100 rounded mt-3"></div>
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
    <article class="col-span-full rounded-2xl border border-red-200 bg-red-50 p-4">
      <div class="text-sm font-bold text-red-800">Falha ao carregar o painel de decisao.</div>
      <p class="text-sm text-red-700 mt-1">Sem dados nao ha acao: reconecte a API e atualize.</p>
    </article>
  `;
  goalBlock.innerHTML = emptyState("Indicador indisponivel.");
  topProfessionalsList.innerHTML = emptyState("Performance indisponivel.");
  actionSuggestionsList.innerHTML = emptyState("Insights indisponiveis.");

  alertsList.innerHTML = `
    <div class="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
      <p class="text-sm text-red-800">Nao foi possivel montar alertas e prioridades.</p>
      <button type="button" data-dashboard-retry class="mt-2 rounded-lg bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 text-xs font-semibold">
        Tentar novamente
      </button>
    </div>
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
    <article class="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
      <div class="text-xs font-bold uppercase tracking-wide text-emerald-700">Receita hoje</div>
      <div class="text-3xl font-black text-emerald-900 mt-1">${currency(dashboard.revenueToday)}</div>
      <div class="text-xs text-emerald-800 mt-1">Resposta: estou ganhando hoje?</div>
    </article>
    <article class="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
      <div class="text-xs font-bold uppercase tracking-wide text-sky-700">Receita mes</div>
      <div class="text-3xl font-black text-sky-900 mt-1">${currency(dashboard.revenueMonth)}</div>
      <div class="text-xs text-sky-800 mt-1">${percentDelta(dashboard.revenueMonth, dashboard.revenuePrevMonth) >= 0 ? "+" : ""}${percentDelta(dashboard.revenueMonth, dashboard.revenuePrevMonth).toFixed(1)}% vs mes anterior</div>
    </article>
    <article class="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
      <div class="text-xs font-bold uppercase tracking-wide text-indigo-700">Ocupacao</div>
      <div class="text-3xl font-black text-indigo-900 mt-1">${dashboard.occupancyRate.toFixed(1)}%</div>
      <div class="text-xs text-indigo-800 mt-1">Resposta: estamos cheios ou vazios?</div>
    </article>
    <article class="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
      <div class="text-xs font-bold uppercase tracking-wide text-amber-700">Meta mensal</div>
      <div class="text-3xl font-black text-amber-900 mt-1">${dashboard.goalProgress.toFixed(1)}%</div>
      <div class="mt-2 h-2 rounded-full bg-amber-100 overflow-hidden">
        <div class="h-full bg-amber-500" style="width: ${Math.min(dashboard.goalProgress, 100)}%"></div>
      </div>
    </article>
  `;

  goalBlock.innerHTML = `
    <div class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="text-xs text-slate-500">Meta mensal ${currency(dashboard.goalMonth)}</div>
      <div class="text-2xl font-black text-slate-900 mt-1">${dashboard.goalProgress.toFixed(1)}%</div>
      <div class="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full bg-emerald-600" style="width: ${Math.min(dashboard.goalProgress, 100)}%"></div>
      </div>
      <div class="text-xs text-slate-600 mt-2">Faltam ${currency(Math.max(0, dashboard.goalMonth - dashboard.revenueMonth))} para bater a meta.</div>
    </div>
  `;

  const topProfessional = safeArray(dashboard.topProfessionals)[0];
  const topService = safeArray(dashboard.topServices)[0];
  topProfessionalsList.innerHTML = `
    <article class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="text-xs text-slate-500">Top profissional</div>
      <div class="text-sm font-bold text-slate-900 mt-1">${topProfessional?.name || "Sem dados"}</div>
      <div class="text-xs text-slate-600 mt-1">Receita ${currency(topProfessional?.revenue || 0)}</div>
    </article>
    <article class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="text-xs text-slate-500">Servico mais vendido</div>
      <div class="text-sm font-bold text-slate-900 mt-1">${topService?.name || "Sem dados"}</div>
      <div class="text-xs text-slate-600 mt-1">${asNumber(topService?.salesCount)} vendas | ${currency(topService?.revenueGenerated || 0)}</div>
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
    <article class="rounded-xl border ${forecastDrop ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"} p-3">
      <div class="text-xs font-bold uppercase tracking-wide ${forecastDrop ? "text-red-700" : "text-emerald-700"}">Queda de faturamento</div>
      <div class="text-sm font-bold ${forecastDrop ? "text-red-900" : "text-emerald-900"} mt-1">
        ${forecastDrop ? `Risco de queda detectado -> impacto ${currency(forecastDrop.estimatedImpact)}` : "Sem queda relevante prevista no momento"}
      </div>
    </article>
    <article class="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div class="text-xs font-bold uppercase tracking-wide text-amber-700">Horarios vazios</div>
      <div class="text-sm font-bold text-amber-900 mt-1">${idleAlerts.length} janelas sem agenda nas proximas 72h</div>
      <div class="text-xs text-amber-900 mt-1">${idleWindowsText.length ? idleWindowsText.join(" | ") : "Nenhuma faixa critica no horizonte atual."}</div>
    </article>
    <article class="rounded-xl border border-red-200 bg-red-50 p-3">
      <div class="text-xs font-bold uppercase tracking-wide text-red-700">Clientes em risco</div>
      <div class="text-sm font-bold text-red-900 mt-1">${atRiskCount} clientes pedem reativacao imediata</div>
      <div class="text-xs text-red-900 mt-1">Cada dia sem acao aumenta perda de recorrencia.</div>
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
    <details class="rounded-xl border border-slate-200 bg-white p-3">
      <summary class="cursor-pointer text-sm font-bold text-slate-900">Ver insights</summary>
      <div class="mt-3 space-y-2">
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
