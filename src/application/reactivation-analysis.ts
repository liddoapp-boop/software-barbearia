import type { PrismaClient } from "@prisma/client";
import type { InMemoryStore } from "../infrastructure/in-memory-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_FUTURE_STATUSES = new Set(["SCHEDULED", "CONFIRMED", "IN_SERVICE"]);
const UNSAFE_MESSAGE_PATTERN = /\b(desconto|promo(?:cao|ção)|oferta|vaga(?:s)? dispon[ií]ve(?:l|is)|[uú]ltima chance|urgente)\b|\b\d+\s+dias?\b/i;

export type ReactivationSegment = "NEAR_DUE" | "OVERDUE" | "STRONGLY_OVERDUE" | "NOT_ELIGIBLE";
export type ReactivationExclusionReason =
  | "NO_COMPLETED_APPOINTMENT"
  | "FUTURE_APPOINTMENT"
  | "INVALID_WHATSAPP"
  | "WHATSAPP_OPT_OUT"
  | "RECENT_CONTACT"
  | "TOO_EARLY";

export type ReactivationClientFact = {
  id: string;
  unitId: string;
  fullName: string;
  phone: string | null;
  whatsappOptOut: boolean;
  preferredProfessionalId: string | null;
};

export type ReactivationAppointmentFact = {
  id: string;
  unitId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type ReactivationAnalysisDataset = {
  unitId: string;
  unitName: string;
  clients: ReactivationClientFact[];
  appointments: ReactivationAppointmentFact[];
  serviceNames: Map<string, string>;
  professionalNames: Map<string, string>;
  recentContactByClient: Map<string, Date>;
};

export interface ReactivationAnalysisSource {
  load(input: { unitId: string; recentContactSince: Date }): Promise<ReactivationAnalysisDataset>;
}

export type ReactivationMessageVariants = Record<Exclude<ReactivationSegment, "NOT_ELIGIBLE">, string[]>;

export interface ReactivationMessageVariantProvider {
  generateVariants(input: {
    unitName: string;
    segments: Array<Exclude<ReactivationSegment, "NOT_ELIGIBLE">>;
  }): Promise<Partial<ReactivationMessageVariants>>;
}

export type ReactivationAnalysisConfig = {
  defaultReturnDays: number;
  cooldownDays: number;
  nearDueDays: number;
  minIntervalDays: number;
  maxIntervalDays: number;
  maxIntervals: number;
  messageLimit: number;
  previewLimit: number;
};

export type ReactivationCandidate = {
  clientId: string;
  firstName: string;
  phoneMasked: string;
  segment: Exclude<ReactivationSegment, "NOT_ELIGIBLE">;
  completedVisits: number;
  typicalIntervalDays: number;
  frequencySource: "HISTORY_MEDIAN" | "DEFAULT";
  lastVisitAt: string;
  expectedReturnAt: string;
  delayDays: number;
  lastService: string | null;
  preferredProfessional: string | null;
  message: string;
};

export type ReactivationAnalysisResult = {
  generatedAt: string;
  unitId: string;
  analyzedClients: number;
  eligibleClients: number;
  excluded: Record<ReactivationExclusionReason, number>;
  segments: Record<Exclude<ReactivationSegment, "NOT_ELIGIBLE">, number>;
  candidates: ReactivationCandidate[];
  previews: ReactivationCandidate[];
  messagesSent: 0;
};

const DEFAULT_CONFIG: ReactivationAnalysisConfig = {
  defaultReturnDays: 45,
  cooldownDays: 30,
  nearDueDays: 7,
  minIntervalDays: 7,
  maxIntervalDays: 120,
  maxIntervals: 5,
  messageLimit: 320,
  previewLimit: 5,
};

const FALLBACK_VARIANTS: ReactivationMessageVariants = {
  NEAR_DUE: [
    "Oi, {nome}! Já está chegando a hora de dar aquele trato no {servico}. Quer que eu encontre um horário para você na {barbearia}?",
    "Oi, {nome}! Que tal deixar o {servico} em dia? Posso ajudar a encontrar um horário na {barbearia}.",
  ],
  OVERDUE: [
    "Oi, {nome}! Faz um tempinho que você não aparece na {barbearia} 😊 Quer que eu encontre um horário para cuidar do {servico}?",
    "Oi, {nome}! Sentimos falta de ver você por aqui. Quer ajuda para agendar seu próximo {servico} na {barbearia}?",
  ],
  STRONGLY_OVERDUE: [
    "Oi, {nome}! Como você está? Quando quiser renovar o {servico}, posso ajudar a encontrar um horário na {barbearia}.",
    "Oi, {nome}! Passando para lembrar que a {barbearia} está por aqui quando você quiser cuidar do {servico}. Quer agendar?",
  ],
};

export function looksLikeReactivationAnalysisCommand(value: string) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return /\b(clientes? (?:inativos?|sumidos?|atrasados?)|quem (?:esta|ta) sumido|demorando para voltar|campanha (?:de |para )?(?:reativacao|clientes? inativos?)|reativ(?:acao|ar).*(?:clientes?|campanha))\b/.test(normalized)
    && !/\b(envi|dispar|execute|confirm)\w*\b/.test(normalized);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

export function calculateTypicalReturnInterval(input: {
  completedVisits: Date[];
  config?: Partial<ReactivationAnalysisConfig>;
}) {
  const config = { ...DEFAULT_CONFIG, ...input.config };
  const visits = [...input.completedVisits].sort((a, b) => a.getTime() - b.getTime());
  if (visits.length < 3) {
    return { days: config.defaultReturnDays, source: "DEFAULT" as const };
  }
  const intervals = visits
    .slice(1)
    .map((visit, index) => Math.round((visit.getTime() - visits[index]!.getTime()) / DAY_MS))
    .slice(-config.maxIntervals)
    .map((days) => clamp(days, config.minIntervalDays, config.maxIntervalDays));
  return { days: Math.max(1, Math.round(median(intervals))), source: "HISTORY_MEDIAN" as const };
}

function normalizeWhatsapp(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13 || /^(\d)\1+$/.test(digits)) return null;
  return digits;
}

function maskWhatsapp(value: string) {
  return `(**) *****-${value.slice(-4)}`;
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0]?.slice(0, 40) || "cliente";
}

function chooseVariant(variants: string[], clientId: string) {
  const score = [...clientId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return variants[score % variants.length]!;
}

function safeVariants(input: Partial<ReactivationMessageVariants> | undefined, limit: number): ReactivationMessageVariants {
  return Object.fromEntries(Object.entries(FALLBACK_VARIANTS).map(([segment, fallback]) => {
    const proposed = input?.[segment as keyof ReactivationMessageVariants] ?? [];
    const accepted = proposed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0 && item.length <= limit && !UNSAFE_MESSAGE_PATTERN.test(item));
    const combined = Array.from(new Set([...accepted, ...fallback]));
    return [segment, combined.slice(0, 3)];
  })) as ReactivationMessageVariants;
}

function renderMessage(template: string, input: {
  firstName: string;
  unitName: string;
  serviceName: string | null;
  professionalName: string | null;
}, limit: number) {
  const service = input.serviceName?.trim() || "visual";
  const rendered = template
    .replaceAll("{nome}", input.firstName)
    .replaceAll("{barbearia}", input.unitName)
    .replaceAll("{servico}", service)
    .replaceAll("{barbeiro}", input.professionalName?.trim() || "nossa equipe")
    .replace(/\s+/g, " ")
    .trim();
  return rendered.slice(0, limit).trim();
}

function exclusionCounts(): Record<ReactivationExclusionReason, number> {
  return {
    NO_COMPLETED_APPOINTMENT: 0,
    FUTURE_APPOINTMENT: 0,
    INVALID_WHATSAPP: 0,
    WHATSAPP_OPT_OUT: 0,
    RECENT_CONTACT: 0,
    TOO_EARLY: 0,
  };
}

export class ReactivationAnalysisService {
  private readonly config: ReactivationAnalysisConfig;

  constructor(
    private readonly source: ReactivationAnalysisSource,
    private readonly messageProvider?: ReactivationMessageVariantProvider,
    config: Partial<ReactivationAnalysisConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async analyze(input: { unitId: string; now?: Date }): Promise<ReactivationAnalysisResult> {
    const now = input.now ?? new Date();
    const recentContactSince = new Date(now.getTime() - this.config.cooldownDays * DAY_MS);
    const dataset = await this.source.load({ unitId: input.unitId, recentContactSince });
    const completedByClient = new Map<string, ReactivationAppointmentFact[]>();
    for (const appointment of dataset.appointments) {
      if (appointment.unitId !== input.unitId || appointment.status !== "COMPLETED") continue;
      const rows = completedByClient.get(appointment.clientId) ?? [];
      rows.push(appointment);
      completedByClient.set(appointment.clientId, rows);
    }

    const exclusions = exclusionCounts();
    const preliminaries: Array<Omit<ReactivationCandidate, "message">> = [];
    const tenantClients = dataset.clients
      .filter((client) => client.unitId === input.unitId)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const client of tenantClients) {
      const completed = [...(completedByClient.get(client.id) ?? [])]
        .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
      if (!completed.length) {
        exclusions.NO_COMPLETED_APPOINTMENT += 1;
        continue;
      }
      const futureAppointment = dataset.appointments.some((appointment) =>
        appointment.unitId === input.unitId
        && appointment.clientId === client.id
        && appointment.startsAt > now
        && ACTIVE_FUTURE_STATUSES.has(appointment.status));
      if (futureAppointment) {
        exclusions.FUTURE_APPOINTMENT += 1;
        continue;
      }
      const whatsapp = normalizeWhatsapp(client.phone);
      if (!whatsapp) {
        exclusions.INVALID_WHATSAPP += 1;
        continue;
      }
      if (client.whatsappOptOut) {
        exclusions.WHATSAPP_OPT_OUT += 1;
        continue;
      }
      const recentContact = dataset.recentContactByClient.get(client.id);
      if (recentContact && recentContact >= recentContactSince) {
        exclusions.RECENT_CONTACT += 1;
        continue;
      }

      const frequency = calculateTypicalReturnInterval({
        completedVisits: completed.map((appointment) => appointment.endsAt),
        config: this.config,
      });
      const last = completed.at(-1)!;
      const expectedReturnAt = new Date(last.endsAt.getTime() + frequency.days * DAY_MS);
      const delayDays = Math.floor((now.getTime() - expectedReturnAt.getTime()) / DAY_MS);
      let segment: Exclude<ReactivationSegment, "NOT_ELIGIBLE">;
      if (delayDays < -this.config.nearDueDays) {
        exclusions.TOO_EARLY += 1;
        continue;
      } else if (delayDays <= 0) {
        segment = "NEAR_DUE";
      } else if (delayDays >= Math.max(14, Math.round(frequency.days * 0.5))) {
        segment = "STRONGLY_OVERDUE";
      } else {
        segment = "OVERDUE";
      }
      const lastService = dataset.serviceNames.get(last.serviceId) ?? null;
      const preferredProfessional = client.preferredProfessionalId
        ? dataset.professionalNames.get(client.preferredProfessionalId) ?? null
        : null;
      preliminaries.push({
        clientId: client.id,
        firstName: firstName(client.fullName),
        phoneMasked: maskWhatsapp(whatsapp),
        segment,
        completedVisits: completed.length,
        typicalIntervalDays: frequency.days,
        frequencySource: frequency.source,
        lastVisitAt: last.endsAt.toISOString(),
        expectedReturnAt: expectedReturnAt.toISOString(),
        delayDays,
        lastService,
        preferredProfessional,
      });
    }

    const usedSegments = Array.from(new Set(preliminaries.map((item) => item.segment)));
    let generated: Partial<ReactivationMessageVariants> | undefined;
    if (this.messageProvider && usedSegments.length) {
      try {
        generated = await this.messageProvider.generateVariants({ unitName: dataset.unitName, segments: usedSegments });
      } catch {
        generated = undefined;
      }
    }
    const variants = safeVariants(generated, this.config.messageLimit);
    const segmentOrder: Record<Exclude<ReactivationSegment, "NOT_ELIGIBLE">, number> = {
      STRONGLY_OVERDUE: 0,
      OVERDUE: 1,
      NEAR_DUE: 2,
    };
    const candidates = preliminaries
      .map((item): ReactivationCandidate => ({
        ...item,
        message: renderMessage(chooseVariant(variants[item.segment], item.clientId), {
          firstName: item.firstName,
          unitName: dataset.unitName,
          serviceName: item.lastService,
          professionalName: item.preferredProfessional,
        }, this.config.messageLimit),
      }))
      .sort((a, b) => segmentOrder[a.segment] - segmentOrder[b.segment]
        || b.delayDays - a.delayDays
        || a.clientId.localeCompare(b.clientId));

    return {
      generatedAt: now.toISOString(),
      unitId: input.unitId,
      analyzedClients: tenantClients.length,
      eligibleClients: candidates.length,
      excluded: exclusions,
      segments: {
        NEAR_DUE: candidates.filter((item) => item.segment === "NEAR_DUE").length,
        OVERDUE: candidates.filter((item) => item.segment === "OVERDUE").length,
        STRONGLY_OVERDUE: candidates.filter((item) => item.segment === "STRONGLY_OVERDUE").length,
      },
      candidates,
      previews: candidates.slice(0, this.config.previewLimit),
      messagesSent: 0,
    };
  }
}

function isRecentReactivationExecution(item: { campaignType: string; payload?: unknown }) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : {};
  return /reativ/i.test(item.campaignType) || payload.playbookType === "REACTIVATION";
}

export class MemoryReactivationAnalysisSource implements ReactivationAnalysisSource {
  constructor(private readonly store: InMemoryStore) {}

  async load(input: { unitId: string; recentContactSince: Date }): Promise<ReactivationAnalysisDataset> {
    const unit = this.store.units.find((item) => item.id === input.unitId);
    if (!unit) throw new Error("Unidade nao encontrada");
    const clients = this.store.clients
      .filter((client) => (client.businessId ?? "unit-01") === input.unitId)
      .map((client) => ({
        id: client.id,
        unitId: client.businessId ?? "unit-01",
        fullName: client.fullName,
        phone: client.phone ?? null,
        whatsappOptOut: client.whatsappOptOut ?? false,
        preferredProfessionalId: client.preferredProfessionalId ?? null,
      }));
    const contactMap = new Map<string, Date>();
    const setLatest = (clientId: string | undefined, occurredAt: Date) => {
      if (!clientId || occurredAt < input.recentContactSince) return;
      const current = contactMap.get(clientId);
      if (!current || current < occurredAt) contactMap.set(clientId, occurredAt);
    };
    for (const event of this.store.retentionEvents) {
      if (event.channel !== "WHATSAPP") continue;
      const retentionCase = this.store.retentionCases.find((item) => item.id === event.caseId && item.unitId === input.unitId);
      setLatest(retentionCase?.clientId, event.occurredAt);
    }
    for (const execution of this.store.automationExecutions) {
      if (execution.unitId === input.unitId && execution.status === "SUCCESS" && isRecentReactivationExecution(execution)) {
        setLatest(execution.clientId, execution.finishedAt ?? execution.startedAt);
      }
    }
    return {
      unitId: input.unitId,
      unitName: unit.name,
      clients,
      appointments: this.store.appointments
        .filter((item) => item.unitId === input.unitId)
        .map((item) => ({ ...item, status: item.status })),
      serviceNames: new Map(this.store.services
        .filter((item) => (item.businessId ?? "unit-01") === input.unitId)
        .map((item) => [item.id, item.name])),
      professionalNames: new Map(this.store.professionals
        .filter((item) => (item.businessId ?? "unit-01") === input.unitId)
        .map((item) => [item.id, item.name])),
      recentContactByClient: contactMap,
    };
  }
}

export class PrismaReactivationAnalysisSource implements ReactivationAnalysisSource {
  constructor(private readonly prisma: PrismaClient) {}

  async load(input: { unitId: string; recentContactSince: Date }): Promise<ReactivationAnalysisDataset> {
    const [unit, clients, appointments, services, professionals, events, executions] = await Promise.all([
      this.prisma.unit.findUnique({ where: { id: input.unitId }, select: { id: true, name: true } }),
      this.prisma.client.findMany({
        where: { businessId: input.unitId },
        select: { id: true, businessId: true, fullName: true, phone: true, whatsappOptOut: true, preferredProfessionalId: true },
        orderBy: { id: "asc" },
      }),
      this.prisma.appointment.findMany({
        where: { unitId: input.unitId },
        select: { id: true, unitId: true, clientId: true, professionalId: true, serviceId: true, startsAt: true, endsAt: true, status: true },
      }),
      this.prisma.service.findMany({ where: { businessId: input.unitId }, select: { id: true, name: true } }),
      this.prisma.professional.findMany({ where: { businessId: input.unitId }, select: { id: true, name: true } }),
      this.prisma.retentionEvent.findMany({
        where: { channel: "WHATSAPP", occurredAt: { gte: input.recentContactSince }, retentionCase: { unitId: input.unitId } },
        select: { occurredAt: true, retentionCase: { select: { clientId: true } } },
      }),
      this.prisma.automationExecution.findMany({
        where: { unitId: input.unitId, status: "SUCCESS", startedAt: { gte: input.recentContactSince }, clientId: { not: null } },
        select: { clientId: true, campaignType: true, payload: true, startedAt: true, finishedAt: true },
      }),
    ]);
    if (!unit) throw new Error("Unidade nao encontrada");
    const contactMap = new Map<string, Date>();
    const setLatest = (clientId: string | null, occurredAt: Date) => {
      if (!clientId) return;
      const current = contactMap.get(clientId);
      if (!current || current < occurredAt) contactMap.set(clientId, occurredAt);
    };
    for (const event of events) setLatest(event.retentionCase.clientId, event.occurredAt);
    for (const execution of executions) {
      if (isRecentReactivationExecution(execution)) setLatest(execution.clientId, execution.finishedAt ?? execution.startedAt);
    }
    return {
      unitId: input.unitId,
      unitName: unit.name,
      clients: clients.map((client) => ({
        id: client.id,
        unitId: client.businessId,
        fullName: client.fullName,
        phone: client.phone,
        whatsappOptOut: client.whatsappOptOut,
        preferredProfessionalId: client.preferredProfessionalId,
      })),
      appointments: appointments.map((appointment) => ({ ...appointment, status: String(appointment.status) })),
      serviceNames: new Map(services.map((item) => [item.id, item.name])),
      professionalNames: new Map(professionals.map((item) => [item.id, item.name])),
      recentContactByClient: contactMap,
    };
  }
}

export class LocalLlamaReactivationMessageProvider implements ReactivationMessageVariantProvider {
  constructor(
    private readonly endpoint = (process.env.LOCAL_LLAMA_URL?.trim() || "http://127.0.0.1:11435").replace(/\/$/, ""),
    private readonly model = process.env.LOCAL_LLAMA_MODEL?.trim() || "google_gemma-3-4b-it-Q4_K_M.gguf",
    private readonly timeoutMs = 8_000,
  ) {}

  async generateVariants(input: { unitName: string; segments: Array<Exclude<ReactivationSegment, "NOT_ELIGIBLE">> }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.5,
          max_tokens: 500,
          stream: false,
          reasoning_format: "none",
          chat_template_kwargs: { enable_thinking: false },
          messages: [{
            role: "user",
            content: [
              "Crie exatamente 2 mensagens curtas de WhatsApp por segmento para reativacao de clientes de barbearia.",
              "Use os placeholders {nome}, {servico}, {barbearia} e opcionalmente {barbeiro}.",
              "Tom humano, descontraido e sem culpa. Maximo 250 caracteres por mensagem.",
              "Nao invente desconto, promocao, oferta, vaga, urgencia ou intimidade.",
              "Nao mencione numero de dias. Retorne somente JSON no formato {\"NEAR_DUE\":[\"...\"],\"OVERDUE\":[\"...\"],\"STRONGLY_OVERDUE\":[\"...\"]}.",
              `Barbearia: ${input.unitName}. Segmentos usados: ${input.segments.join(", ")}.`,
            ].join("\n"),
          }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("local_llama_http_error");
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content?.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      if (!content) throw new Error("local_llama_empty_response");
      return JSON.parse(content) as Partial<ReactivationMessageVariants>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function formatReactivationAnalysisReport(result: ReactivationAnalysisResult) {
  const lines = [
    "Análise de reativação",
    "",
    `Clientes analisados: ${result.analyzedClients}`,
    `Elegíveis: ${result.eligibleClients}`,
    `Excluídos por agendamento futuro: ${result.excluded.FUTURE_APPOINTMENT}`,
    `Excluídos por contato recente: ${result.excluded.RECENT_CONTACT}`,
    `Excluídos por WhatsApp inválido: ${result.excluded.INVALID_WHATSAPP}`,
    `Excluídos por recusa de mensagens: ${result.excluded.WHATSAPP_OPT_OUT}`,
    "",
    `- Próximos do retorno: ${result.segments.NEAR_DUE}`,
    `- Atrasados: ${result.segments.OVERDUE}`,
    `- Muito atrasados: ${result.segments.STRONGLY_OVERDUE}`,
  ];
  if (result.previews.length) {
    lines.push("", "Prévias sanitizadas:");
    for (const preview of result.previews) {
      lines.push(`- ${preview.firstName} ${preview.phoneMasked}: ${preview.message}`);
    }
  }
  lines.push("", "Nenhuma mensagem foi enviada.");
  return lines.join("\n");
}
