import {
  DashboardPlaybookHistory,
  DashboardPlaybookHistoryItem,
  DashboardSuggestionTelemetryEvent,
  DashboardSuggestionTelemetrySummary,
  DashboardThresholdTuning,
} from "../domain/types";

export type DashboardThresholdConfig = {
  noShowAlertPct: number;
  cancellationAlertPct: number;
  forecastDropHighSeverityPct: number;
  reactivationMinDays: number;
  idleHorizonHours: number;
  minSmartAlertImpact: number;
  fallbackConversionRate: number;
  baseConfidence: number;
  maxConfidence: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function summarizeDashboardSuggestionTelemetry(
  events: DashboardSuggestionTelemetryEvent[],
): DashboardSuggestionTelemetrySummary {
  const total = events.length;
  const executed = events.filter((item) => item.outcome === "EXECUTED").length;
  const ignored = events.filter((item) => item.outcome === "IGNORED").length;
  const converted = events.filter((item) => item.outcome === "CONVERTED").length;
  const estimatedImpactTracked = round2(
    events.reduce((acc, item) => acc + item.estimatedImpact, 0),
  );
  const realizedRevenue = round2(
    events.reduce((acc, item) => acc + Number(item.realizedRevenue ?? 0), 0),
  );
  const conversionRate = executed ? round2((converted / executed) * 100) : 0;
  const ignoredRate = total ? round2((ignored / total) * 100) : 0;

  return {
    total,
    executed,
    ignored,
    converted,
    conversionRate,
    ignoredRate,
    estimatedImpactTracked,
    realizedRevenue,
    netLiftEstimate: round2(realizedRevenue - estimatedImpactTracked * 0.15),
    recentEvents: events
      .slice()
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 8),
  };
}

export function buildDashboardPlaybookHistory(input: {
  events: DashboardSuggestionTelemetryEvent[];
  windowDays?: number;
}): DashboardPlaybookHistory {
  const windowDays = Math.max(1, Math.min(180, Number(input.windowDays ?? 45)));
  const events = input.events;
  const grouped = new Map<string, DashboardPlaybookHistoryItem>();

  for (const event of events) {
    const groupKey = `${event.suggestionId}:${event.actionType}`;
    const current = grouped.get(groupKey);
    const isNewer =
      !current ||
      new Date(event.occurredAt).getTime() >= new Date(current.lastOccurredAt).getTime();
    if (!current) {
      grouped.set(groupKey, {
        id: groupKey,
        suggestionId: event.suggestionId,
        actionType: event.actionType,
        sourceModule: event.sourceModule,
        playbookType: event.playbookType,
        totalEvents: 0,
        executed: 0,
        ignored: 0,
        converted: 0,
        conversionRate: 0,
        estimatedImpactTotal: 0,
        realizedRevenueTotal: 0,
        netImpact: 0,
        status: "ATTENTION",
        lastOutcome: event.outcome,
        lastOccurredAt: event.occurredAt,
      });
    }

    const row = grouped.get(groupKey) as DashboardPlaybookHistoryItem;
    row.totalEvents += 1;
    row.executed += event.outcome === "EXECUTED" ? 1 : 0;
    row.ignored += event.outcome === "IGNORED" ? 1 : 0;
    row.converted += event.outcome === "CONVERTED" ? 1 : 0;
    row.estimatedImpactTotal = round2(row.estimatedImpactTotal + event.estimatedImpact);
    row.realizedRevenueTotal = round2(
      row.realizedRevenueTotal + Number(event.realizedRevenue ?? 0),
    );
    row.conversionRate = row.executed
      ? round2((row.converted / row.executed) * 100)
      : 0;
    row.netImpact = round2(row.realizedRevenueTotal - row.estimatedImpactTotal * 0.15);
    row.status =
      row.converted > 0 && row.netImpact >= 0
        ? "HEALTHY"
        : row.ignored >= Math.max(2, Math.ceil(row.totalEvents * 0.5))
          ? "CRITICAL"
          : "ATTENTION";

    if (isNewer) {
      row.lastOutcome = event.outcome;
      row.lastOccurredAt = event.occurredAt;
      row.sourceModule = event.sourceModule ?? row.sourceModule;
      row.playbookType = event.playbookType ?? row.playbookType;
    }
  }

  const items = Array.from(grouped.values())
    .sort(
      (a, b) =>
        new Date(b.lastOccurredAt).getTime() - new Date(a.lastOccurredAt).getTime(),
    )
    .slice(0, 20);

  const totalEvents = items.reduce((acc, item) => acc + item.totalEvents, 0);
  const executed = items.reduce((acc, item) => acc + item.executed, 0);
  const ignored = items.reduce((acc, item) => acc + item.ignored, 0);
  const converted = items.reduce((acc, item) => acc + item.converted, 0);
  const estimatedImpactTotal = round2(
    items.reduce((acc, item) => acc + item.estimatedImpactTotal, 0),
  );
  const realizedRevenueTotal = round2(
    items.reduce((acc, item) => acc + item.realizedRevenueTotal, 0),
  );
  const conversionRate = executed ? round2((converted / executed) * 100) : 0;

  return {
    summary: {
      windowDays,
      totalPlaybooks: items.length,
      totalEvents,
      executed,
      ignored,
      converted,
      estimatedImpactTotal,
      realizedRevenueTotal,
      netImpact: round2(realizedRevenueTotal - estimatedImpactTotal * 0.15),
      conversionRate,
    },
    items,
  };
}

export function calibrateDashboardThresholds(input: {
  base: DashboardThresholdConfig;
  telemetry: DashboardSuggestionTelemetrySummary;
}): { thresholds: DashboardThresholdConfig; tuning: DashboardThresholdTuning } {
  const { base, telemetry } = input;
  const adjustments = {
    minSmartAlertImpact: base.minSmartAlertImpact,
    reactivationMinDays: base.reactivationMinDays,
    forecastDropHighSeverityPct: base.forecastDropHighSeverityPct,
  };
  const rationale: string[] = [];
  let calibrated = false;
  let confidenceBoost = 0;

  if (telemetry.total >= 4) {
    calibrated = true;
    if (telemetry.conversionRate >= 40) {
      adjustments.minSmartAlertImpact = round2(clamp(base.minSmartAlertImpact * 0.9, 20, 300));
      adjustments.reactivationMinDays = Math.round(clamp(base.reactivationMinDays - 2, 14, 90));
      confidenceBoost += 5;
      rationale.push("Conversao alta de sugestoes: ampliado alcance de alertas acionaveis.");
    }
    if (telemetry.ignoredRate >= 45) {
      adjustments.minSmartAlertImpact = round2(clamp(base.minSmartAlertImpact * 1.12, 20, 300));
      adjustments.forecastDropHighSeverityPct = round2(
        clamp(base.forecastDropHighSeverityPct * 1.05, 0.1, 0.4),
      );
      confidenceBoost -= 3;
      rationale.push("Taxa de ignorados elevada: reduzido ruido de alertas de baixo valor.");
    }
  }

  const thresholds: DashboardThresholdConfig = {
    ...base,
    minSmartAlertImpact: adjustments.minSmartAlertImpact,
    reactivationMinDays: adjustments.reactivationMinDays,
    forecastDropHighSeverityPct: adjustments.forecastDropHighSeverityPct,
    baseConfidence: clamp(base.baseConfidence + confidenceBoost, 35, base.maxConfidence),
  };

  return {
    thresholds,
    tuning: {
      calibrated,
      confidenceBoost,
      adjustments,
      rationale:
        rationale.length > 0
          ? rationale
          : ["Sem historico suficiente para calibracao automatica de thresholds."],
    },
  };
}
