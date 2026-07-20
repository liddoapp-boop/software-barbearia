import { describe, expect, it, vi, type Mock } from "vitest";
import {
  MemoryReactivationCampaignRepository,
  REACTIVATION_PUBLIC_BOOKING_URL_ERROR,
  ReactivationCampaignConflictError,
  ReactivationCampaignService,
  formatReactivationCampaignPreview,
  isUnambiguousWhatsappOptOut,
  parseStrictReactivationDecision,
} from "../src/application/reactivation-campaign";
import { MemoryReactivationAnalysisSource, ReactivationAnalysisService } from "../src/application/reactivation-analysis";
import { InMemoryStore } from "../src/infrastructure/in-memory-store";
import { WhatsappDeliveryError } from "../src/notifications";

const NOW = new Date("2026-07-16T15:00:00.000Z");
const DAY = 86_400_000;
const publicBookingUrl = (unitId: string) => `https://agenda.example.com/agendamento?unitId=${unitId}`;

function eligibleStore(count = 3) {
  const store = new InMemoryStore();
  store.clients = [];
  store.appointments = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(4, "0");
    const clientId = `client-${suffix}`;
    store.clients.push({
      id: clientId,
      businessId: "unit-01",
      fullName: `Cliente ${suffix}`,
      phone: `55119888${suffix}`,
      tags: ["INACTIVE"],
    });
    const startsAt = new Date(NOW.getTime() - (100 + index) * DAY);
    store.appointments.push({
      id: `appointment-${suffix}`,
      unitId: "unit-01",
      clientId,
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      status: "COMPLETED",
      isFitting: false,
      history: [],
    });
  }
  return store;
}

function setup(
  store: InMemoryStore,
  send: Mock<(_phone: string, _text: string) => Promise<void>> = vi.fn(async () => {}),
  options: {
    now?: () => Date;
    claimTimeoutMs?: number;
    maxRecipients?: number;
    publicBookingUrl?: string | ((unitId: string) => string | undefined);
  } = {},
) {
  const analysis = new ReactivationAnalysisService(new MemoryReactivationAnalysisSource(store));
  const repository = new MemoryReactivationCampaignRepository(store);
  const service = new ReactivationCampaignService({
    analysis,
    repository,
    send,
    now: options.now ?? (() => NOW),
    claimTimeoutMs: options.claimTimeoutMs,
    maxRecipients: options.maxRecipients,
    publicBookingUrl: options.publicBookingUrl ?? publicBookingUrl,
  });
  return { service, send, repository };
}

describe("campanha manual de reativacao 3B", () => {
  it("cria rascunho persistido, sem envio, limitado aos 20 mais atrasados", async () => {
    const store = eligibleStore(25);
    const { service, send } = setup(store);
    const preview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });

    expect(preview.selected).toBe(20);
    expect(preview.examples).toHaveLength(5);
    expect(preview.messagesSent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(store.reactivationCampaigns).toHaveLength(1);
    expect(store.reactivationRecipients).toHaveLength(20);
    expect(store.reactivationRecipients.map((item) => item.clientId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `client-${String(24 - index).padStart(4, "0")}`),
    );
    expect(new Set(store.reactivationRecipients.map((item) => item.idempotencyKey)).size).toBe(20);
    expect(new Set(store.reactivationRecipients.map((item) => item.attemptId)).size).toBe(20);
    expect(store.reactivationRecipients.every((item) => item.attempts === 0 && item.providerCallStartedAt === null)).toBe(true);
    const text = formatReactivationCampaignPreview(preview);
    expect(text).toContain("Nada foi enviado.");
    expect(text).toContain("CONFIRMAR ou CANCELAR");
    expect(text).not.toContain("55119888");
  });

  it("usa primeiro nome sanitizado, nome publico, HTTPS oficial, SAIR e envia exatamente a previa", async () => {
    const store = eligibleStore(1);
    store.clients[0]!.fullName = "  Ana\u0000 Maria da Silva  ";
    store.businessSettings[0]!.displayName = "  Barbearia Pública\nCentro  ";
    store.services[0]!.name = "Serviço anterior secreto";
    const send = vi.fn(async () => undefined);
    const { service } = setup(store, send);

    const preview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const expected = [
      "Olá, Ana! Como você está?",
      "",
      "Que tal dar uma renovada no corte? Será um prazer receber você novamente na Barbearia Pública Centro.",
      "",
      "Escolha o melhor dia e horário pelo nosso agendamento:",
      "https://agenda.example.com/agendamento?unitId=unit-01",
      "",
      "Se preferir não receber mais mensagens como esta, responda SAIR.",
    ].join("\n");

    expect(preview.examples[0]).toMatchObject({ firstName: "Ana", message: expected });
    expect(preview.examples[0]?.message).not.toContain("Serviço anterior secreto");
    expect(formatReactivationCampaignPreview(preview)).toContain(expected);
    expect(store.reactivationRecipients[0]?.message).toBe(expected);

    await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(store.reactivationRecipients[0]?.phoneSnapshot, expected);
  });

  it.each([
    ["ausente", undefined],
    ["HTTP", "http://agenda.example.com/agendamento?unitId=unit-01"],
    ["localhost", "https://localhost/agendamento?unitId=unit-01"],
    ["localhost com ponto final", "https://localhost./agendamento?unitId=unit-01"],
    ["IPv6 local", "https://[::1]/agendamento?unitId=unit-01"],
    ["rede privada", "https://192.168.1.10/agendamento?unitId=unit-01"],
    ["credenciais", "https://user:pass@agenda.example.com/agendamento?unitId=unit-01"],
    ["rota administrativa", "https://agenda.example.com/admin?unitId=unit-01"],
    ["tenant divergente", "https://agenda.example.com/agendamento?unitId=unit-02"],
    ["token na query", "https://agenda.example.com/agendamento?unitId=unit-01&token=segredo"],
  ])("impede campanha com link publico %s", async (_label, configuredUrl) => {
    const store = eligibleStore(1);
    const service = new ReactivationCampaignService({
      analysis: new ReactivationAnalysisService(new MemoryReactivationAnalysisSource(store)),
      repository: new MemoryReactivationCampaignRepository(store),
      send: vi.fn(async () => undefined),
      now: () => NOW,
      publicBookingUrl: configuredUrl,
    });

    await expect(service.createDraft({ unitId: "unit-01", ownerId: "owner-01" }))
      .rejects.toMatchObject({
        name: "ReactivationCampaignConfigurationError",
        reason: "PUBLIC_BOOKING_URL_INVALID",
        message: REACTIVATION_PUBLIC_BOOKING_URL_ERROR,
      });
    expect(store.reactivationCampaigns).toHaveLength(0);
    expect(store.reactivationRecipients).toHaveLength(0);
  });

  it("contabiliza sucesso, falha confirmada, entrega incerta e ignorado sem reenvio no replay", async () => {
    const store = eligibleStore(4);
    const send = vi.fn(async (phone: string, _text: string) => {
      if (phone.endsWith("0001")) throw new WhatsappDeliveryError("isolated_outbound_disabled");
      if (phone.endsWith("0002")) throw new WhatsappDeliveryError("timeout");
    });
    const { service } = setup(store, send);
    await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const futureStart = new Date(NOW.getTime() + DAY);
    store.appointments.push({
      id: "future", unitId: "unit-01", clientId: "client-0000", professionalId: "pro-01", serviceId: "svc-corte",
      startsAt: futureStart, endsAt: new Date(futureStart.getTime() + 45 * 60_000), status: "SCHEDULED", isFitting: false, history: [],
    });

    const first = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });
    const callsAfterFirst = send.mock.calls.length;
    const replay = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });

    expect(first).toMatchObject({
      selected: 4, sent: 1, failed: 1, uncertain: 1, skipped: 1,
      pending: 0, processing: 0, status: "PARTIAL", replay: false, duplicateMessages: 0,
    });
    expect(replay).toMatchObject({ sent: 1, failed: 1, uncertain: 1, skipped: 1, replay: true, duplicateMessages: 0 });
    expect(send).toHaveBeenCalledTimes(callsAfterFirst);
    expect(send).toHaveBeenCalledTimes(3);
    expect(store.reactivationRecipients.find((item) => item.clientId === "client-0001")).toMatchObject({ status: "FAILED", attempts: 1, sentAt: null });
    expect(store.reactivationRecipients.find((item) => item.clientId === "client-0002")).toMatchObject({ status: "UNCERTAIN", attempts: 1, sentAt: null });
    expect(store.reactivationRecipients.find((item) => item.clientId === "client-0003")).toMatchObject({ status: "SENT", attempts: 1 });
    expect(store.reactivationRecipients.find((item) => item.clientId === "client-0000")).toMatchObject({ status: "SKIPPED", attempts: 0 });
    const auditCount = store.reactivationRecipientAudits.length;
    const auditEvents = new Set(store.reactivationRecipientAudits.map((item) => item.event));
    expect(auditEvents).toEqual(new Set([
      "CLAIM_OBTAINED",
      "PROVIDER_CALL_STARTED",
      "RECIPIENT_SKIPPED",
      "FAILURE_CONFIRMED",
      "OUTBOUND_BLOCKED",
      "DELIVERY_UNCERTAIN",
      "SEND_CONFIRMED",
    ]));
    expect(JSON.stringify(store.reactivationRecipientAudits)).not.toContain("55119888");
    expect(JSON.stringify(store.reactivationRecipientAudits)).not.toContain("Oi,");
    expect(store.reactivationRecipientAudits.every((item) =>
      item.unitId === "unit-01"
      && (item.recipientId === null || Boolean(item.campaignId && item.attemptId)))).toBe(true);

    const nextPreview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-02" });
    const nextRecipients = store.reactivationRecipients
      .filter((item) => item.campaignId === nextPreview.campaignId)
      .map((item) => item.clientId);

    expect(nextRecipients).toEqual(["client-0001"]);
    expect(store.reactivationRecipientAudits).toHaveLength(auditCount);
  });

  it("trata rejeicao HTTP como falha confirmada e erro ambiguo como entrega incerta", async () => {
    const store = eligibleStore(2);
    const send = vi.fn(async (phone: string) => {
      if (phone.endsWith("0001")) throw new WhatsappDeliveryError("http", 422);
      throw new Error("connection closed after write");
    });
    const { service } = setup(store, send);
    await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });

    const summary = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });

    expect(summary).toMatchObject({ sent: 0, failed: 1, uncertain: 1, skipped: 0, status: "PARTIAL" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.reactivationRecipients.find((item) => item.clientId === "client-0001")?.status).toBe("FAILED");
    expect(store.reactivationRecipients.find((item) => item.clientId === "client-0000")?.status).toBe("UNCERTAIN");
    expect(JSON.stringify(store.reactivationRecipients)).not.toContain("connection closed after write");
  });

  it("permite somente um claim concorrente e preserva o attemptId persistido", async () => {
    const store = eligibleStore(1);
    const { service, repository } = setup(store);
    await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const recipient = store.reactivationRecipients[0]!;
    const attemptId = recipient.attemptId;

    const claims = await Promise.all([
      repository.claimRecipient(recipient.id, NOW),
      repository.claimRecipient(recipient.id, NOW),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find((item) => item !== null)?.attemptId).toBe(attemptId);
    expect(recipient).toMatchObject({ status: "SENDING", attemptId, attempts: 0 });
  });

  it("recupera claim expirado antes da chamada e envia uma unica vez com o mesmo attemptId", async () => {
    const store = eligibleStore(1);
    let now = NOW;
    const send = vi.fn(async () => undefined);
    const { service, repository } = setup(store, send, { now: () => now, claimTimeoutMs: 1_000 });
    const preview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    await repository.claimCampaign(preview.campaignId, now);
    const recipient = store.reactivationRecipients[0]!;
    const attemptId = recipient.attemptId;
    await repository.claimRecipient(recipient.id, now);

    now = new Date(NOW.getTime() + 2_000);
    const recovered = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });

    expect(recovered).toMatchObject({ sent: 1, failed: 0, uncertain: 0, status: "COMPLETED", replay: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(recipient).toMatchObject({ status: "SENT", attemptId, attempts: 1 });
  });

  it("converte claim expirado depois do inicio da chamada em incerto sem nova chamada", async () => {
    const store = eligibleStore(1);
    let now = NOW;
    const send = vi.fn(async () => undefined);
    const { service, repository } = setup(store, send, { now: () => now, claimTimeoutMs: 1_000 });
    const preview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    await repository.claimCampaign(preview.campaignId, now);
    const recipient = store.reactivationRecipients[0]!;
    await repository.claimRecipient(recipient.id, now);
    await repository.markProviderCallStarted(recipient.id, recipient.attemptId, now);

    now = new Date(NOW.getTime() + 2_000);
    const recovered = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });
    const replay = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });

    expect(recovered).toMatchObject({ sent: 0, failed: 0, uncertain: 1, status: "PARTIAL", replay: true });
    expect(replay).toMatchObject({ uncertain: 1, status: "PARTIAL", replay: true });
    expect(send).not.toHaveBeenCalled();
    expect(recipient).toMatchObject({ status: "UNCERTAIN", attempts: 1, sentAt: null });
  });

  it("falha ao persistir estado/auditoria depois da chamada degrada para UNCERTAIN sem reenvio", async () => {
    const store = eligibleStore(1);
    let now = NOW;
    const send = vi.fn(async () => undefined);
    class FailingTerminalRepository extends MemoryReactivationCampaignRepository {
      override async markRecipientSent() {
        throw new Error("audit persistence unavailable");
      }
    }
    const repository = new FailingTerminalRepository(store);
    const service = new ReactivationCampaignService({
      analysis: new ReactivationAnalysisService(new MemoryReactivationAnalysisSource(store)),
      repository,
      send,
      now: () => now,
      claimTimeoutMs: 1_000,
      publicBookingUrl,
    });
    await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });

    const first = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });
    expect(store.reactivationRecipients[0]).toMatchObject({
      status: "UNCERTAIN",
      attempts: 1,
      providerCallStartedAt: NOW,
    });
    const replay = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });

    expect(first).toMatchObject({ status: "PARTIAL", uncertain: 1, replay: false });
    expect(replay).toMatchObject({ status: "PARTIAL", uncertain: 1, replay: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("CANCELAR nao envia e mantem somente um rascunho por owner/unidade", async () => {
    const store = eligibleStore(2);
    const { service, send } = setup(store);
    const first = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const second = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    expect(first.campaignId).not.toBe(second.campaignId);
    expect(store.reactivationCampaigns.filter((item) => item.status === "DRAFT")).toHaveLength(1);
    expect(store.reactivationCampaigns.find((item) => item.id === first.campaignId)?.status).toBe("CANCELLED");
    expect(await service.cancel({ unitId: "unit-01", ownerId: "owner-01" })).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("serializa duas criacoes concorrentes e substitui somente o DRAFT anterior", async () => {
    const store = eligibleStore(2);
    const { service } = setup(store);

    const previews = await Promise.all([
      service.createDraft({ unitId: "unit-01", ownerId: "owner-01" }),
      service.createDraft({ unitId: "unit-01", ownerId: "owner-01" }),
    ]);

    expect(previews[0].campaignId).not.toBe(previews[1].campaignId);
    expect(store.reactivationCampaigns.filter((item) => ["DRAFT", "SENDING"].includes(item.status))).toHaveLength(1);
    expect(store.reactivationCampaigns.filter((item) => item.status === "CANCELLED")).toHaveLength(1);
    expect(store.reactivationRecipients.filter((item) => item.status === "SKIPPED")).toHaveLength(2);
  });

  it("recusa nova criacao enquanto houver SENDING e impede o mesmo cliente em outra campanha aberta", async () => {
    const store = eligibleStore(1);
    const { service, repository } = setup(store);
    const first = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });

    await expect(service.createDraft({ unitId: "unit-01", ownerId: "owner-02" }))
      .rejects.toMatchObject({ reason: "CLIENT_IN_OPEN_CAMPAIGN" });
    await repository.claimCampaign(first.campaignId, NOW);
    await expect(service.createDraft({ unitId: "unit-01", ownerId: "owner-01" }))
      .rejects.toEqual(new ReactivationCampaignConflictError("CAMPAIGN_SENDING"));

    expect(store.reactivationCampaigns.filter((item) => ["DRAFT", "SENDING"].includes(item.status))).toHaveLength(1);
  });

  it("permite somente uma confirmacao concorrente iniciar o processamento", async () => {
    const store = eligibleStore(1);
    let releaseSend!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const blockedSend = new Promise<void>((resolve) => { releaseSend = resolve; });
    const send = vi.fn(async () => {
      signalStarted();
      await blockedSend;
    });
    const { service } = setup(store, send);
    await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });

    const firstPromise = service.confirm({ unitId: "unit-01", ownerId: "owner-01" });
    await started;
    const concurrent = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });
    releaseSend();
    const first = await firstPromise;

    expect(concurrent).toMatchObject({ status: "SENDING", processing: 1, replay: true });
    expect(first).toMatchObject({ status: "COMPLETED", sent: 1, replay: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("mantem campanhas independentes em unidades diferentes", async () => {
    const store = eligibleStore(1);
    store.clients.push({
      id: "client-unit-02",
      businessId: "unit-02",
      fullName: "Cliente Unidade 02",
      phone: "11977770002",
      tags: ["INACTIVE"],
    });
    const startsAt = new Date(NOW.getTime() - 100 * DAY);
    store.appointments.push({
      id: "appointment-unit-02",
      unitId: "unit-02",
      clientId: "client-unit-02",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      status: "COMPLETED",
      isFitting: false,
      history: [],
    });
    const { service } = setup(store);

    const [unitOne, unitTwo] = await Promise.all([
      service.createDraft({ unitId: "unit-01", ownerId: "owner-01" }),
      service.createDraft({ unitId: "unit-02", ownerId: "owner-01" }),
    ]);

    expect(unitOne.selected).toBe(1);
    expect(unitTwo.selected).toBe(1);
    expect(store.reactivationCampaigns.filter((item) => item.status === "DRAFT")).toHaveLength(2);
  });

  it("mantem owners independentes quando seus destinatarios abertos nao se sobrepoem", async () => {
    const store = eligibleStore(2);
    const { service } = setup(store, vi.fn(async () => undefined), { maxRecipients: 1 });
    const first = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const firstRecipient = store.reactivationRecipients.find((item) => item.campaignId === first.campaignId)!;
    const futureStart = new Date(NOW.getTime() + DAY);
    store.appointments.push({
      id: "future-owner-isolation",
      unitId: "unit-01",
      clientId: firstRecipient.clientId,
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt: futureStart,
      endsAt: new Date(futureStart.getTime() + 45 * 60_000),
      status: "SCHEDULED",
      isFitting: false,
      history: [],
    });

    const second = await service.createDraft({ unitId: "unit-01", ownerId: "owner-02" });
    const secondRecipient = store.reactivationRecipients.find((item) => item.campaignId === second.campaignId)!;

    expect(secondRecipient.clientId).not.toBe(firstRecipient.clientId);
    expect(store.reactivationCampaigns.filter((item) => item.status === "DRAFT")).toHaveLength(2);
  });

  it("revalida agendamento futuro, opt-out, cooldown, telefone e tenant antes de cada envio", async () => {
    const store = eligibleStore(5);
    const { service, send } = setup(store);
    const preview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const futureStart = new Date(NOW.getTime() + DAY);
    store.appointments.push({
      id: "future", unitId: "unit-01", clientId: "client-0000", professionalId: "pro-01", serviceId: "svc-corte",
      startsAt: futureStart, endsAt: new Date(futureStart.getTime() + 45 * 60_000), status: "SCHEDULED", isFitting: false, history: [],
    });
    store.clients.find((item) => item.id === "client-0001")!.whatsappOptOut = true;
    store.clients.find((item) => item.id === "client-0003")!.phone = undefined;
    store.clients.find((item) => item.id === "client-0004")!.businessId = "unit-02";
    store.reactivationCampaigns.push({
      ...store.reactivationCampaigns[0]!, id: "older-campaign", status: "COMPLETED", ownerId: "other-owner",
      confirmedAt: new Date(NOW.getTime() - DAY), completedAt: new Date(NOW.getTime() - DAY), createdAt: new Date(NOW.getTime() - DAY), updatedAt: new Date(NOW.getTime() - DAY),
    });
    store.reactivationRecipients.push({
      ...store.reactivationRecipients[0]!, id: "older-recipient", campaignId: "older-campaign", clientId: "client-0002",
      idempotencyKey: "older-campaign:client-0002", attemptId: "older-attempt-client-0002",
      status: "SENT", sentAt: new Date(NOW.getTime() - DAY), attempts: 1,
    });

    const summary = await service.confirm({ unitId: "unit-01", ownerId: "owner-01" });
    expect(summary).toMatchObject({ campaignId: preview.campaignId, sent: 0, skipped: 5, failed: 0, status: "COMPLETED" });
    expect(send).not.toHaveBeenCalled();
  });

  it("propaga opt-out por telefone no tenant, isola outros tenants e permanece idempotente", async () => {
    const store = eligibleStore(2);
    store.clients.find((item) => item.id === "client-0001")!.phone = "(11) 9888-0000";
    store.clients.push({ id: "other", businessId: "unit-02", fullName: "Outro", phone: "551198880000", tags: ["INACTIVE"] });
    const { service } = setup(store);
    await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    const result = await service.optOut({ unitId: "unit-01", phone: "+55 (11) 9888-0000" });
    const replay = await service.optOut({ unitId: "unit-01", phone: "551198880000" });

    expect(result).toMatchObject({
      clientId: "client-0000",
      matchedClients: 2,
      changedClients: 2,
      cancelledPending: 2,
      phoneMasked: "(**) *****-0000",
    });
    expect(replay).toMatchObject({ matchedClients: 2, changedClients: 0, cancelledPending: 0 });
    expect(store.clients.filter((item) => item.businessId === "unit-01").every((item) => item.whatsappOptOut)).toBe(true);
    expect(store.clients.find((item) => item.id === "other")?.whatsappOptOut).not.toBe(true);
    expect(store.reactivationRecipients.every((item) => item.status === "SKIPPED")).toBe(true);
    expect(store.reactivationRecipientAudits.filter((item) => item.event === "OPT_OUT_RECEIVED")).toHaveLength(1);
    expect(JSON.stringify(store.reactivationRecipientAudits)).not.toContain("551198880000");
    store.clients.push({
      id: "client-created-after-optout",
      businessId: "unit-01",
      fullName: "Cliente criado depois",
      phone: "11 9888-0000",
      whatsappOptOut: false,
      tags: ["INACTIVE"],
    });
    const startsAt = new Date(NOW.getTime() - 120 * DAY);
    store.appointments.push({
      id: "appointment-created-after-optout",
      unitId: "unit-01",
      clientId: "client-created-after-optout",
      professionalId: "pro-01",
      serviceId: "svc-corte",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      status: "COMPLETED",
      isFitting: false,
      history: [],
    });
    const blockedPreview = await service.createDraft({ unitId: "unit-01", ownerId: "owner-01" });
    expect(blockedPreview.selected).toBe(0);
    expect(blockedPreview.exclusions.WHATSAPP_OPT_OUT).toBe(3);
    expect(isUnambiguousWhatsappOptOut("NÃO QUERO RECEBER")).toBe(true);
    expect(isUnambiguousWhatsappOptOut("SAIR")).toBe(true);
    expect(isUnambiguousWhatsappOptOut("PARAR")).toBe(true);
    expect(isUnambiguousWhatsappOptOut("REMOVER MEU NÚMERO")).toBe(true);
    expect(isUnambiguousWhatsappOptOut("talvez parar depois")).toBe(false);
    expect(parseStrictReactivationDecision("CONFIRMAR")).toBe("CONFIRMAR");
    expect(parseStrictReactivationDecision("sim")).toBeNull();
    expect(parseStrictReactivationDecision("ok")).toBeNull();
  });
});
