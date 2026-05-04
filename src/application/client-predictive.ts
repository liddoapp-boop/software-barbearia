import {
  ClientPredictiveRow,
  ClientPredictiveStatus,
  ClientReactivationQueueItem,
  ClientsOverviewPayload,
  ClientsOverviewPredictiveSummary,
  ClientValueSegment,
} from "../domain/types";

type ClientPredictiveBaseRow = {
  clientId: string;
  fullName: string;
  phone: string | null;
  tags: Array<"NEW" | "RECURRING" | "VIP" | "INACTIVE">;
  visits: number;
  revenue: number;
  ltv: number;
  averageTicket: number;
  visitFrequencyDays: number | null;
  lastVisitAt: string | null;
  daysWithoutReturn: number | null;
};

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveValueSegment(ltv: number, highThreshold: number, mediumThreshold: number): ClientValueSegment {
  if (ltv >= highThreshold) return "VALUE_HIGH";
  if (ltv >= mediumThreshold) return "VALUE_MEDIUM";
  return "VALUE_LOW";
}

function resolveStatus(input: {
  daysWithoutReturn: number | null;
  visitFrequencyDays: number | null;
  ltv: number;
  vipTag: boolean;
  vipLtvThreshold: number;
}): ClientPredictiveStatus {
  const { daysWithoutReturn, visitFrequencyDays, ltv, vipTag, vipLtvThreshold } = input;
  const isInactive = daysWithoutReturn == null || daysWithoutReturn >= 60;
  if (isInactive) return "INACTIVE";

  const riskDelay =
    visitFrequencyDays != null ? Math.max(30, Math.round(visitFrequencyDays * 1.5)) : 40;
  const isAtRisk = daysWithoutReturn >= riskDelay;

  const isVip = vipTag || (ltv >= vipLtvThreshold && daysWithoutReturn <= 45);
  if (isVip) return "VIP";
  if (isAtRisk) return "AT_RISK";
  return "ACTIVE";
}

function resolveRecommendedAction(status: ClientPredictiveStatus, segment: ClientValueSegment): string {
  if (status === "VIP") return "Oferecer pacote premium e agendamento prioritario nesta semana.";
  if (status === "AT_RISK")
    return "Contato proativo com incentivo leve e proposta de horario nas proximas 48h.";
  if (status === "INACTIVE")
    return "Disparar campanha de reativacao com oferta de retorno e follow-up manual.";
  if (segment === "VALUE_HIGH") return "Manter relacionamento ativo com sugestao de upsell.";
  return "Nutrir relacionamento com lembrete de manutencao.";
}

function resolveReactivationScore(input: {
  status: ClientPredictiveStatus;
  daysWithoutReturn: number | null;
  visitFrequencyDays: number | null;
  ltv: number;
  maxLtv: number;
  visits: number;
}): number {
  const recencyBase = input.daysWithoutReturn ?? 75;
  const expectedCycle = input.visitFrequencyDays ?? 35;
  const recencyComponent = clamp((recencyBase / Math.max(expectedCycle, 20)) * 35, 0, 35);
  const valueComponent = clamp((input.ltv / Math.max(input.maxLtv, 1)) * 35, 0, 35);
  const engagementComponent = clamp((input.visits / 12) * 15, 0, 15);
  const statusComponent =
    input.status === "AT_RISK"
      ? 12
      : input.status === "INACTIVE"
        ? 10
        : input.status === "VIP"
          ? 15
          : 4;
  return round2(clamp(recencyComponent + valueComponent + engagementComponent + statusComponent, 0, 100));
}

function resolveImpact(input: {
  averageTicket: number;
  status: ClientPredictiveStatus;
  score: number;
}): number {
  const baseProbability = clamp(input.score / 100, 0.05, 0.95);
  const statusMultiplier =
    input.status === "VIP" ? 0.62 : input.status === "AT_RISK" ? 0.48 : input.status === "INACTIVE" ? 0.38 : 0.22;
  const ticket = input.averageTicket > 0 ? input.averageTicket : 45;
  return round2(ticket * baseProbability * statusMultiplier * 3);
}

export function buildClientsOverviewPredictive(input: {
  rows: ClientPredictiveBaseRow[];
  status?: ClientPredictiveStatus;
  segment?: ClientValueSegment;
  limit: number;
}): ClientsOverviewPayload {
  const ltvValues = input.rows.map((item) => item.ltv);
  const vipLtvThreshold = percentile(ltvValues, 0.85);
  const highSegmentThreshold = percentile(ltvValues, 0.7);
  const mediumSegmentThreshold = percentile(ltvValues, 0.35);
  const maxLtv = ltvValues.length ? Math.max(...ltvValues) : 0;

  const enriched: ClientPredictiveRow[] = input.rows.map((item) => {
    const segment = resolveValueSegment(item.ltv, highSegmentThreshold, mediumSegmentThreshold);
    const status = resolveStatus({
      daysWithoutReturn: item.daysWithoutReturn,
      visitFrequencyDays: item.visitFrequencyDays,
      ltv: item.ltv,
      vipTag: item.tags.includes("VIP"),
      vipLtvThreshold,
    });
    const reactivationScore = resolveReactivationScore({
      status,
      daysWithoutReturn: item.daysWithoutReturn,
      visitFrequencyDays: item.visitFrequencyDays,
      ltv: item.ltv,
      maxLtv,
      visits: item.visits,
    });
    const estimatedReactivationImpact = resolveImpact({
      averageTicket: item.averageTicket,
      status,
      score: reactivationScore,
    });
    return {
      ...item,
      status,
      segment,
      reactivationScore,
      estimatedReactivationImpact,
      recommendedAction: resolveRecommendedAction(status, segment),
    };
  });

  const filtered = enriched
    .filter((item) => (input.status ? item.status === input.status : true))
    .filter((item) => (input.segment ? item.segment === input.segment : true))
    .sort((a, b) => {
      if (b.estimatedReactivationImpact !== a.estimatedReactivationImpact) {
        return b.estimatedReactivationImpact - a.estimatedReactivationImpact;
      }
      if (b.reactivationScore !== a.reactivationScore) return b.reactivationScore - a.reactivationScore;
      return a.fullName.localeCompare(b.fullName);
    });

  const reactivationQueue: ClientReactivationQueueItem[] = filtered
    .filter((item) => item.status === "AT_RISK" || item.status === "INACTIVE" || item.status === "VIP")
    .map((item) => ({
      clientId: item.clientId,
      fullName: item.fullName,
      status: item.status,
      daysWithoutReturn: item.daysWithoutReturn,
      reactivationScore: item.reactivationScore,
      estimatedImpact: item.estimatedReactivationImpact,
      recommendedAction: item.recommendedAction,
      channelHint: item.phone ? ("WHATSAPP" as const) : ("PHONE" as const),
    }))
    .sort((a, b) => {
      if (b.estimatedImpact !== a.estimatedImpact) return b.estimatedImpact - a.estimatedImpact;
      return b.reactivationScore - a.reactivationScore;
    });

  const totalRevenue = filtered.reduce((acc, item) => acc + item.revenue, 0);
  const totalVisits = filtered.reduce((acc, item) => acc + item.visits, 0);
  const potentialReactivationRevenue = reactivationQueue
    .slice(0, 10)
    .reduce((acc, item) => acc + item.estimatedImpact, 0);

  const summary: ClientsOverviewPredictiveSummary = {
    active: filtered.filter((item) => item.status === "ACTIVE").length,
    atRisk: filtered.filter((item) => item.status === "AT_RISK").length,
    warning: filtered.filter((item) => item.status === "AT_RISK").length,
    inactive: filtered.filter((item) => item.status === "INACTIVE").length,
    vip: filtered.filter((item) => item.status === "VIP").length,
    totalRevenue: round2(totalRevenue),
    averageTicket: totalVisits ? round2(totalRevenue / totalVisits) : 0,
    totalClients: filtered.length,
    potentialReactivationRevenue: round2(potentialReactivationRevenue),
  };

  return {
    clients: filtered.slice(0, input.limit),
    summary,
    reactivationQueue: reactivationQueue.slice(0, Math.max(10, input.limit)),
  };
}
