import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/http/app";

const originalEnv = { ...process.env };
const ownerPhone = "5511999999999";

type SemanticCase = {
  message: string;
  intent?: "schedule_appointment" | "unknown";
  client?: string;
  clientEvidence?: string;
  service?: string;
  serviceEvidence?: string;
  date?: string;
  dateEvidence?: string;
  time?: string;
  timeEvidence?: string;
  period?: "morning" | "afternoon" | "night" | "unspecified";
  ambiguousField?: "clientName" | "date" | "time";
  expected: "preview" | "clarification" | "unknown";
  expectedReply?: string;
};

const cases: SemanticCase[] = [
  { message: "Marque um corte para o cliente João Victor. É amanhã, às 5 da tarde.", client: "João Victor", clientEvidence: "cliente João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "5 da tarde", period: "afternoon", expected: "preview" },
  { message: "Faça um agendamento de corte para o cliente João Vittor amanhã às 17 horas da tarde.", client: "João Vittor", clientEvidence: "cliente João Vittor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "17 horas da tarde", period: "afternoon", expected: "preview" },
  { message: "Ô, consegue reservar um corte pro João Victor amanhã, cinco da tarde?", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "cinco da tarde", period: "afternoon", expected: "preview" },
  { message: "João Victor vai fazer o corte amanhã às dezessete.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às dezessete", period: "unspecified", expected: "preview" },
  { message: "Preciso deixar o João Victor marcado para corte amanhã no fim da tarde, às 17.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "afternoon", expected: "preview" },
  { message: "Dá pra pôr na agenda amanhã às 17 o corte do João Victor?", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "preview" },
  { message: "Amanhã, 17 horas, o João Victor queria cortar o cabelo.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "cortar o cabelo", date: "2026-07-14", dateEvidence: "Amanhã", time: "17:00", timeEvidence: "17 horas", period: "unspecified", expected: "preview" },
  { message: "Por favor, encaixa o João Victor para cortar amanhã às cinco da tarde.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "cortar", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às cinco da tarde", period: "afternoon", expected: "preview" },
  { message: "Então... reserva corte, João Victor, amanhã, às 17h.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17h", period: "unspecified", expected: "preview" },
  { message: "Queria um horário de corte amanhã às 17 para João Victor.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "preview" },
  { message: "Faz aí um agendamento: João Victor, corte, amanhã, 17 horas.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "17 horas", period: "unspecified", expected: "preview" },
  { message: "João Victor, corte amanhã às cinco da tarde, pode ser?", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às cinco da tarde", period: "afternoon", expected: "preview" },
  { message: "Tem como deixar marcado amanhã às 17 um corte pro João Victor?", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "preview" },
  { message: "Organiza um corte do João Victor para amanhã às 17, por favor.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "preview" },
  { message: "Bom, ahn, coloca o João Victor na agenda pra corte amanhã às 17.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "preview" },
  { message: "É... o João Victor precisa de corte amanhã, cinco da tarde.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "cinco da tarde", period: "afternoon", expected: "preview" },
  { message: "Corte para João Victor; data: amanhã; hora: 17h.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "17h", period: "unspecified", expected: "preview" },
  { message: "Marca o corte do João Victor para amanhã, às sete da noite.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "19:00", timeEvidence: "às sete da noite", period: "night", expected: "preview" },
  { message: "Reserva pro João Victor um corte amanhã às nove da manhã.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "09:00", timeEvidence: "às nove da manhã", period: "morning", expected: "preview" },
  { message: "Marque, hum, um corte... para o cliente João Victor... é, amanhã... às cinco da tarde.", client: "João Victor", clientEvidence: "cliente João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às cinco da tarde", period: "afternoon", expected: "preview" },
  { message: "Faz um agendamento, ahn, de corte, pro João Victor, amanhã às 17.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "preview" },
  { message: "Marca um corte para o João Victor.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", expected: "clarification", expectedReply: "Qual dia e horario voce deseja?" },
  { message: "Quero marcar corte amanhã às 17.", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "clarification", expectedReply: "Para qual cliente?" },
  { message: "Reserva amanhã às 17 para João Victor.", client: "João Victor", clientEvidence: "João Victor", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "clarification", expectedReply: "Qual servico voce deseja agendar?" },
  { message: "Quero um corte para João Victor amanhã.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", expected: "clarification", expectedReply: "Qual horario voce deseja?" },
  { message: "Quero corte para João Victor às 17.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "clarification", expectedReply: "Qual dia voce deseja?" },
  { message: "Preciso de um horário amanhã às 17 para corte.", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "clarification", expectedReply: "Para qual cliente?" },
  { message: "Quero marcar um corte.", service: "Corte", serviceEvidence: "corte", expected: "clarification", expectedReply: "Informe somente: cliente, dia, horario." },
  { message: "Quero marcar amanhã às 17.", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", expected: "clarification", expectedReply: "Informe somente: cliente, servico." },
  { message: "Marca corte para João Victor amanhã às cinco.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", timeEvidence: "às cinco", period: "unspecified", ambiguousField: "time", expected: "clarification", expectedReply: "Esse horario e de manha, de tarde ou de noite?" },
  { message: "Reserva corte pro João Victor amanhã no fim do dia.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", timeEvidence: "fim do dia", period: "unspecified", ambiguousField: "time", expected: "clarification", expectedReply: "Esse horario e de manha, de tarde ou de noite?" },
  { message: "Marca corte para João ou João Victor amanhã às 17.", service: "Corte", serviceEvidence: "corte", date: "2026-07-14", dateEvidence: "amanhã", time: "17:00", timeEvidence: "às 17", period: "unspecified", ambiguousField: "clientName", expected: "clarification", expectedReply: "Para qual cliente?" },
  { message: "Marca corte para João Victor terça ou quarta às 17.", client: "João Victor", clientEvidence: "João Victor", service: "Corte", serviceEvidence: "corte", time: "17:00", timeEvidence: "às 17", period: "unspecified", ambiguousField: "date", expected: "clarification", expectedReply: "Qual dia voce deseja?" },
  { message: "Será que dá para agendar o corte do João Victor amanhã às dezoito horas?", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "18:00", timeEvidence: "dezoito horas", expected: "preview" },
  { message: "Amanhã às 14h, reserva para João Victor fazer um corte.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "Amanhã", time: "14:00", timeEvidence: "14h", expected: "preview" },
  { message: "João Victor. Corte. Amanhã. Quinze horas.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "Amanhã", time: "15:00", timeEvidence: "Quinze horas", expected: "preview" },
  { message: "Então então, põe o João Victor amanhã, corte, às 16:30.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "16:30", timeEvidence: "16:30", expected: "preview" },
  { message: "Consegue marcar para as oito da noite de amanhã o corte do João Victor?", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "20:00", timeEvidence: "oito da noite", expected: "preview" },
  { message: "Às sete da manhã amanhã o João Victor quer cortar.", client: "João Victor", service: "Corte", serviceEvidence: "cortar", date: "2026-07-14", dateEvidence: "amanhã", time: "07:00", timeEvidence: "sete da manhã", expected: "preview" },
  { message: "Corte amanhã para João Victor, horário exato 13:15.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "13:15", timeEvidence: "13:15", expected: "preview" },
  { message: "Olha, hum... amanhã às seis da tarde. O cliente é João Victor e o serviço é corte.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "18:00", timeEvidence: "seis da tarde", expected: "preview" },
  { message: "Pode deixar o corte do João Victor para amanhã às 21 horas?", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "21:00", timeEvidence: "21 horas", expected: "preview" },
  { message: "O João Victor precisa cortar; encaixa amanhã, 10:45.", client: "João Victor", service: "Corte", serviceEvidence: "cortar", date: "2026-07-14", dateEvidence: "amanhã", time: "10:45", timeEvidence: "10:45", expected: "preview" },
  { message: "Para amanhã eu queria reservar às 12:30 um corte, nome João Victor.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "12:30", timeEvidence: "12:30", expected: "preview" },
  { message: "Agendamento amanhã: corte; João Victor; 19h30.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "19:30", timeEvidence: "19h30", expected: "preview" },
  { message: "Eu preciso que marque, ahn, o João Victor. Corte. Amanhã às quatro da tarde.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "Amanhã", time: "16:00", timeEvidence: "quatro da tarde", expected: "preview" },
  { message: "Há como reservar corte amanhã às 11 para João Victor?", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "11:00", timeEvidence: "às 11", expected: "preview" },
  { message: "Marca João Victor para corte amanhã às 22:00, por gentileza.", client: "João Victor", service: "Corte", date: "2026-07-14", dateEvidence: "amanhã", time: "22:00", timeEvidence: "22:00", expected: "preview" },
  { message: "João Victor cortou o cabelo ontem às 17.", intent: "unknown", expected: "unknown" },
  { message: "Minha agenda está cheia amanhã às 17.", intent: "unknown", expected: "unknown" },
];

function semanticOutput(item: SemanticCase) {
  if (item.intent === "unknown") {
    return {
      intent: "unknown",
      clientName: null, serviceNames: [], professionalName: null,
      dateExpression: null, timeExpression: null, canonicalDate: null, canonicalTime: null,
      timePrecision: "unspecified",
      ambiguousFields: [],
      missingFields: [],
      confidence: { intent: 0.95, clientName: 0, service: 0, professional: 0, date: 0, time: 0 },
    };
  }
  return {
    intent: "schedule_appointment",
    clientName: item.client ?? null,
    serviceNames: item.service ? [item.service] : [],
    professionalName: null,
    dateExpression: item.dateEvidence ?? (item.ambiguousField === "date" ? "terça ou quarta" : null),
    timeExpression: item.timeEvidence ?? null,
    canonicalDate: item.date ?? null,
    canonicalTime: item.time ?? null,
    timePrecision: item.ambiguousField === "time" ? "unspecified" : item.time ? "exact" : "unspecified",
    ambiguousFields: item.ambiguousField ? [item.ambiguousField] : [],
    missingFields: [
      item.client || item.ambiguousField === "clientName" ? "" : "clientName",
      item.service ? "" : "serviceNames",
      item.date || item.ambiguousField === "date" ? "" : "date",
      item.time || item.ambiguousField === "time" ? "" : "time",
    ].filter(Boolean),
    confidence: {
      intent: 0.95,
      clientName: item.client ? 0.96 : item.ambiguousField === "clientName" ? 0.55 : 0,
      service: item.service ? 0.95 : 0,
      professional: 0,
      date: item.date ? 0.96 : item.ambiguousField === "date" ? 0.55 : 0,
      time: item.time ? 0.96 : item.ambiguousField === "time" ? 0.6 : 0,
    },
  };
}

function mockGeminiAndWhatsapp() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/message/sendText/")) return { ok: true, status: 200, text: async () => "" };
    const body = JSON.parse(String(init?.body ?? "{}"));
    const prompt = String(body.contents?.[0]?.parts?.[0]?.text ?? "");
    const item = cases.find((candidate) => prompt.includes(`Mensagem do owner:\n${candidate.message}\n`));
    if (!item) throw new Error(`Mensagem sem resposta semantica simulada: ${prompt.slice(0, 120)}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(semanticOutput(item)) }] } }] }),
    };
  });
}

function payload(message: string, id: string) {
  return {
    instance: "test-instance",
    data: {
      key: { id, remoteJid: `${ownerPhone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: message },
    },
  };
}

async function postWebhook(app: FastifyInstance, message: string, id: string) {
  return await app.inject({
    method: "POST",
    url: "/webhooks/evolution/whatsapp",
    headers: { "x-evolution-webhook-secret": "test-webhook-secret" },
    payload: payload(message, id),
  });
}

async function loginOwner(app: FastifyInstance) {
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "owner@barbearia.local", password: "owner123", activeUnitId: "unit-01" } });
  expect(response.statusCode).toBe(200);
  return response.json().accessToken as string;
}

function sentTexts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/message/sendText/"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? "{}")).text as string);
}

describe("orquestracao semantica real do WhatsApp", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATA_BACKEND = "memory";
    process.env.AUTH_ENFORCED = "true";
    process.env.GEMINI_API_KEY = "fake-gemini-key-for-test";
    process.env.GEMINI_MODEL = "gemini-test";
    process.env.AI_WHATSAPP_ENABLED = "true";
    process.env.AI_WHATSAPP_OWNER_PHONE = ownerPhone;
    process.env.AI_WHATSAPP_UNIT_ID = "unit-01";
    process.env.EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-evolution-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("processa ao menos 50 construcoes variadas com confianca por campo, sem mutacao", async () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
    const fetchMock = mockGeminiAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    for (const [index, item] of cases.entries()) {
      const response = await postWebhook(app, item.message, `semantic-${index}`);
      const text = sentTexts(fetchMock).at(-1) ?? "";
      expect(response.json()).toMatchObject({ ok: true, executed: false });
      if (item.expected === "preview") {
        expect(response.json()).toMatchObject({ mode: "preview_only", intent: "schedule_appointment" });
        expect(text).toContain(`Cliente: ${item.client}`);
        expect(text).toContain("Servico: Corte");
        expect(text).toContain(`Data: ${item.date}`);
        expect(text).toContain(`Horario: ${item.time}`);
        expect(text).toContain("Profissional: Geovane Borges");
        expect(text).toContain("CONFIRMAR");
        expect(text).not.toMatch(/Cliente:\s*(?:cliente\b|.*(?:\bé\b|\beh\b|\bhum\b|\bahn\b)\s*$)/im);
      } else if (item.expected === "clarification") {
        expect(response.json()).toMatchObject({ intent: "schedule_appointment" });
        expect(text).toBe(item.expectedReply);
        expect(text).not.toContain("CONFIRMAR");
      } else {
        expect(response.json()).toMatchObject({ intent: "unknown" });
        expect(text).not.toContain("CONFIRMAR");
      }
      if (item.expected === "clarification") {
        await postWebhook(app, "CANCELAR", `semantic-clear-${index}`);
      }
    }

    const geminiCalls = fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/"));
    expect(geminiCalls).toHaveLength(cases.length);
    const structuredCalls = geminiCalls.filter(([, init]) => {
      const body = JSON.parse(String((init as RequestInit).body ?? "{}"));
      return body.generationConfig?.responseMimeType === "application/json"
        && body.generationConfig?.responseJsonSchema?.properties?.canonicalTime
        && body.generationConfig?.responseJsonSchema?.properties?.confidence;
    });
    expect(structuredCalls.length).toBeGreaterThanOrEqual(50);

    const audit = await app.inject({ method: "GET", url: "/audit/events?unitId=unit-01&limit=500", headers: { authorization: `Bearer ${token}` } });
    const observed = (audit.json().events as Array<{ action: string; afterJson?: Record<string, unknown> }>).find(
      (event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED" && event.afterJson?.strategy === "gemini",
    );
    expect(observed?.afterJson?.fieldDiagnostics).toMatchObject({
      clientName: { confidence: 0.96, source: "gemini_validated", status: "accepted" },
      serviceNames: { confidence: 0.95, source: "gemini_validated", status: "accepted" },
      professionalName: { confidence: 1, source: "context_default", status: "accepted" },
      date: { confidence: 0.96, source: "gemini_validated", status: "accepted" },
      time: { confidence: 0.96, source: "gemini_validated", status: "accepted" },
    });

    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });

  it("retry concorrente da primeira fala real gera uma unica previa", async () => {
    const fetchMock = mockGeminiAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    await app.inject({ method: "POST", url: "/clients", headers: { authorization: `Bearer ${token}` }, payload: { unitId: "unit-01", name: "João Victor", phone: "5511987000003" } });
    const item = cases[0];

    const responses = await Promise.all([
      postWebhook(app, item.message, "semantic-retry-real-001"),
      postWebhook(app, item.message, "semantic-retry-real-001"),
      postWebhook(app, item.message, "semantic-retry-real-001"),
    ]);

    expect(responses.filter((response) => response.json().mode === "preview_only")).toHaveLength(1);
    expect(responses.filter((response) => response.json().deduplicated === true)).toHaveLength(2);
    expect(sentTexts(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes("/message/sendText/"))).toHaveLength(1);
  });

  it("preserva servico aceito e pergunta somente cliente no turno seguinte", async () => {
    const fetchMock = mockGeminiAndWhatsapp();
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp();
    const token = await loginOwner(app);
    const before = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });

    const first = await postWebhook(app, "Quero marcar um corte.", "semantic-context-1");
    const second = await postWebhook(app, "Quero marcar amanhã às 17.", "semantic-context-2");

    expect(first.json()).toMatchObject({ intent: "schedule_appointment", executed: false });
    expect(second.json()).toMatchObject({ intent: "schedule_appointment", executed: false });
    expect(sentTexts(fetchMock).slice(-2)).toEqual([
      "Informe somente: cliente, dia, horario.",
      "Para qual cliente?",
    ]);
    expect(sentTexts(fetchMock).every((text) => !text.includes("CONFIRMAR"))).toBe(true);
    const audit = await app.inject({ method: "GET", url: "/audit/events?unitId=unit-01&limit=100", headers: { authorization: `Bearer ${token}` } });
    const observed = (audit.json().events as Array<{ action: string; afterJson?: Record<string, unknown> }>).find(
      (event) => event.action === "AI_WHATSAPP_PARSER_OBSERVED"
        && (event.afterJson?.fieldDiagnostics as Record<string, { source?: string }> | undefined)?.serviceNames?.source === "conversation_context",
    );
    expect(observed?.afterJson?.fieldDiagnostics).toMatchObject({
      serviceNames: { source: "conversation_context", status: "accepted", confidence: 0.95 },
    });
    const after = await app.inject({ method: "GET", url: "/appointments?unitId=unit-01", headers: { authorization: `Bearer ${token}` } });
    expect(after.json().appointments).toHaveLength(before.json().appointments.length);
  });
});
