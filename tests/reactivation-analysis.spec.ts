import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  MemoryReactivationAnalysisSource,
  PrismaReactivationAnalysisSource,
  ReactivationAnalysisService,
  calculateTypicalReturnInterval,
  formatReactivationAnalysisReport,
  looksLikeReactivationAnalysisCommand,
} from "../src/application/reactivation-analysis";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";

const NOW = new Date("2026-07-16T15:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function addAppointment(store: InMemoryStore, input: {
  id: string;
  clientId: string;
  daysAgo: number;
  status?: "SCHEDULED" | "CONFIRMED" | "IN_SERVICE" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  unitId?: string;
}) {
  const startsAt = daysAgo(input.daysAgo);
  store.appointments.push({
    id: input.id,
    unitId: input.unitId ?? "unit-01",
    clientId: input.clientId,
    professionalId: "pro-01",
    serviceId: "svc-corte",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 45 * 60_000),
    status: input.status ?? "COMPLETED",
    isFitting: false,
    history: [],
  });
}

function scenarioStore() {
  const store = new InMemoryStore();
  store.clients = [
    { id: "regular", businessId: "unit-01", fullName: "Ana Regular", phone: "5511999990001", preferredProfessionalId: "pro-01", tags: ["RECURRING"] },
    { id: "few", businessId: "unit-01", fullName: "Bia Poucas", phone: "5511999990002", tags: ["NEW"] },
    { id: "strong", businessId: "unit-01", fullName: "Caio Sumido", phone: "5511999990003", tags: ["INACTIVE"] },
    { id: "future", businessId: "unit-01", fullName: "Davi Agendado", phone: "5511999990004", tags: ["RECURRING"] },
    { id: "recent", businessId: "unit-01", fullName: "Eva Contatada", phone: "5511999990005", tags: ["RECURRING"] },
    { id: "no-phone", businessId: "unit-01", fullName: "Fabio Sem Numero", phone: "123", tags: ["RECURRING"] },
    { id: "optout", businessId: "unit-01", fullName: "Gabi Recusou", phone: "5511999990007", whatsappOptOut: true, tags: ["RECURRING"] },
    { id: "cancel-only", businessId: "unit-01", fullName: "Hugo Cancelou", phone: "5511999990008", tags: ["NEW"] },
    { id: "near", businessId: "unit-01", fullName: "Iara Proxima", phone: "5511999990009", tags: ["NEW"] },
    { id: "other-tenant", businessId: "unit-02", fullName: "Outro Tenant", phone: "5511999990010", tags: ["RECURRING"] },
  ];

  for (const [index, age] of [100, 70, 40].entries()) addAppointment(store, { id: `regular-${index}`, clientId: "regular", daysAgo: age });
  addAppointment(store, { id: "few-1", clientId: "few", daysAgo: 50 });
  for (const [index, age] of [160, 130, 100].entries()) addAppointment(store, { id: `strong-${index}`, clientId: "strong", daysAgo: age });
  addAppointment(store, { id: "future-history", clientId: "future", daysAgo: 60 });
  addAppointment(store, { id: "future-next", clientId: "future", daysAgo: -5, status: "SCHEDULED" });
  addAppointment(store, { id: "recent-history", clientId: "recent", daysAgo: 60 });
  addAppointment(store, { id: "no-phone-history", clientId: "no-phone", daysAgo: 60 });
  addAppointment(store, { id: "optout-history", clientId: "optout", daysAgo: 60 });
  addAppointment(store, { id: "cancel-only-1", clientId: "cancel-only", daysAgo: 60, status: "CANCELLED" });
  addAppointment(store, { id: "near-1", clientId: "near", daysAgo: 40 });
  addAppointment(store, { id: "other-history", clientId: "other-tenant", daysAgo: 100, unitId: "unit-02" });
  store.retentionCases.push({
    id: "case-recent",
    unitId: "unit-01",
    clientId: "recent",
    status: "IN_PROGRESS",
    riskLevel: "HIGH",
    reason: "inactive",
    recommendedAction: "contact",
    daysWithoutReturn: 60,
    updatedAt: NOW,
  });
  store.retentionEvents.push({
    id: "event-recent",
    caseId: "case-recent",
    channel: "WHATSAPP",
    note: "contato de reativacao",
    occurredAt: daysAgo(10),
    createdBy: "owner",
  });
  return store;
}

describe("analise de reativacao 3A", () => {
  it("usa mediana recente e limita intervalos muito curtos ou longos", () => {
    const result = calculateTypicalReturnInterval({
      completedVisits: [daysAgo(250), daysAgo(130), daysAgo(100), daysAgo(99), daysAgo(69), daysAgo(39)],
    });
    expect(result).toEqual({ days: 30, source: "HISTORY_MEDIAN" });
    expect(calculateTypicalReturnInterval({ completedVisits: [daysAgo(80), daysAgo(40)] }))
      .toEqual({ days: 45, source: "DEFAULT" });
  });

  it("classifica, exclui e gera somente previas seguras e deterministicas", async () => {
    const store = scenarioStore();
    const provider = {
      generateVariants: vi.fn(async (_input: { unitName: string; segments: string[] }) => ({
        NEAR_DUE: ["Promoção urgente para {nome}: desconto e vaga disponível!"],
        OVERDUE: ["Oi, {nome}! Quer agendar o {servico} na {barbearia}?"],
        STRONGLY_OVERDUE: ["Oi, {nome}! Quando quiser, podemos cuidar do {servico} na {barbearia}."],
      })),
    };
    const service = new ReactivationAnalysisService(new MemoryReactivationAnalysisSource(store), provider);
    const first = await service.analyze({ unitId: "unit-01", now: NOW });
    const second = await service.analyze({ unitId: "unit-01", now: NOW });

    expect(first.analyzedClients).toBe(9);
    expect(first.eligibleClients).toBe(4);
    expect(first.segments).toEqual({ NEAR_DUE: 1, OVERDUE: 2, STRONGLY_OVERDUE: 1 });
    expect(first.excluded).toMatchObject({
      NO_COMPLETED_APPOINTMENT: 1,
      FUTURE_APPOINTMENT: 1,
      INVALID_WHATSAPP: 1,
      WHATSAPP_OPT_OUT: 1,
      RECENT_CONTACT: 1,
    });
    expect(first.candidates.find((item) => item.clientId === "regular")).toMatchObject({
      segment: "OVERDUE",
      typicalIntervalDays: 30,
      frequencySource: "HISTORY_MEDIAN",
      preferredProfessional: "Geovane Borges",
      phoneMasked: "(**) *****-0001",
    });
    expect(first.candidates.find((item) => item.clientId === "few")).toMatchObject({
      typicalIntervalDays: 45,
      frequencySource: "DEFAULT",
    });
    expect(first.candidates.every((item) => item.message.length <= 320)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/desconto|promo[cç][aã]o|vaga dispon/i);
    expect(first.messagesSent).toBe(0);
    expect(second).toEqual(first);
    expect(provider.generateVariants).toHaveBeenCalledTimes(2);
    expect(provider.generateVariants.mock.calls[0]?.[0].segments).toHaveLength(3);
    expect(store.automationExecutions).toHaveLength(0);
  });

  it("produz o mesmo resultado com os adaptadores de memoria e Prisma", async () => {
    const store = scenarioStore();
    const memory = await new ReactivationAnalysisService(new MemoryReactivationAnalysisSource(store))
      .analyze({ unitId: "unit-01", now: NOW });
    const prismaMock = {
      unit: { findUnique: vi.fn(async () => ({
        id: "unit-01",
        name: store.units[0]!.name,
        businessSettings: {
          displayName: store.businessSettings[0]!.displayName ?? null,
          businessName: store.businessSettings[0]!.businessName,
        },
      })) },
      client: { findMany: vi.fn(async () => store.clients.filter((item) => item.businessId === "unit-01").map((item) => ({
        id: item.id,
        businessId: item.businessId!,
        fullName: item.fullName,
        phone: item.phone ?? null,
        whatsappOptOut: item.whatsappOptOut ?? false,
        preferredProfessionalId: item.preferredProfessionalId ?? null,
      }))) },
      appointment: { findMany: vi.fn(async () => store.appointments.filter((item) => item.unitId === "unit-01")) },
      service: { findMany: vi.fn(async () => store.services.filter((item) => item.businessId === "unit-01").map(({ id, name }) => ({ id, name }))) },
      professional: { findMany: vi.fn(async () => store.professionals.filter((item) => item.businessId === "unit-01").map(({ id, name }) => ({ id, name }))) },
      retentionEvent: { findMany: vi.fn(async () => [{ occurredAt: daysAgo(10), retentionCase: { clientId: "recent" } }]) },
      automationExecution: { findMany: vi.fn(async () => []) },
    } as unknown as PrismaClient;
    const persisted = await new ReactivationAnalysisService(new PrismaReactivationAnalysisSource(prismaMock))
      .analyze({ unitId: "unit-01", now: NOW });
    expect(persisted).toEqual(memory);
  });

  it("reconhece comandos de analise e bloqueia pedidos de disparo", () => {
    expect(looksLikeReactivationAnalysisCommand("Analise os clientes que estão demorando para voltar.")).toBe(true);
    expect(looksLikeReactivationAnalysisCommand("Quem está sumido da barbearia?")).toBe(true);
    expect(looksLikeReactivationAnalysisCommand("Prepare uma campanha para clientes inativos.")).toBe(true);
    expect(looksLikeReactivationAnalysisCommand("Envie a campanha para clientes inativos.")).toBe(false);
  });

  it("formata relatorio sem telefone completo e confirma nenhum envio", async () => {
    const result = await new ReactivationAnalysisService(new MemoryReactivationAnalysisSource(scenarioStore()))
      .analyze({ unitId: "unit-01", now: NOW });
    const report = formatReactivationAnalysisReport(result);
    expect(report).toContain("Análise de reativação");
    expect(report).toContain("Nenhuma mensagem foi enviada.");
    expect(report).not.toContain("5511999990001");
  });
});
