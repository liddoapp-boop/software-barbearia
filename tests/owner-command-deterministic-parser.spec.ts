import { describe, expect, it } from "vitest";
import {
  OwnerCommandContext,
  parseCanonicalDeterministicOwnerCommand,
  parseDeterministicOwnerCommand,
} from "../src/application/owner-command-ai";

const context: OwnerCommandContext = {
  unitId: "unit-01",
  now: new Date("2026-07-14T12:00:00-03:00"),
  timezone: "America/Sao_Paulo",
  services: [{ id: "svc-corte", name: "Corte", price: 30, durationMin: 30, enabledProfessionalIds: ["pro-geovane"] }],
  products: [],
  professionals: [{ id: "pro-geovane", name: "Geovane Borges" }],
  paymentMethods: [{ name: "Pix" }],
};

describe("parser deterministico de cliente no agendamento", () => {
  it.each([
    {
      message: "Agendar corte para Cliente Teste RC3 dia 15/07/2026 \u00e0s 11:00 com Geovane Borges",
      clientName: "Cliente Teste RC3",
      serviceNames: ["Corte"],
      date: "2026-07-15",
      time: "11:00",
      professionalName: "Geovane Borges",
      missingFields: [],
    },
    {
      message: "Agendar corte para Jo\u00e3o Vittor dia 15/07/2026 \u00e0s 11:00 com Geovane Borges",
      clientName: "Jo\u00e3o Vittor",
      serviceNames: ["Corte"],
      date: "2026-07-15",
      time: "11:00",
      professionalName: "Geovane Borges",
      missingFields: [],
    },
    {
      message: "Marcar para o cliente Rafael amanh\u00e3 \u00e0s 16 horas",
      clientName: "Rafael",
      serviceNames: [],
      date: "2026-07-15",
      time: "16:00",
      professionalName: undefined,
      missingFields: ["serviceNames"],
    },
    {
      message: "Agendar Maria da Silva para corte amanh\u00e3 \u00e0s 10 horas",
      clientName: "Maria da Silva",
      serviceNames: ["Corte"],
      date: "2026-07-15",
      time: "10:00",
      professionalName: "Geovane Borges",
      missingFields: [],
    },
    {
      message: "Agendar corte amanh\u00e3 \u00e0s 10 horas",
      clientName: "",
      serviceNames: ["Corte"],
      date: "2026-07-15",
      time: "10:00",
      professionalName: "Geovane Borges",
      missingFields: ["clientName"],
    },
  ])("extrai fronteiras sem inventar cliente: $message", ({ message, clientName, serviceNames, date, time, professionalName, missingFields }) => {
    const parsed = parseDeterministicOwnerCommand({ message, context });

    expect(parsed).toMatchObject({
      ok: true,
      mode: "preview_only",
      intent: "schedule_appointment",
      draft: { clientName, serviceNames, date, time, professionalName },
      missingFields,
      executed: false,
    });
  });

  it.each([
    ["Marco um corte amanhã para o João Vitor, às quatro da tarde.", "João Vitor", "2026-07-15", "16:00"],
    ["Agendo um corte amanhã para João às quatro da tarde", "João", "2026-07-15", "16:00"],
    ["Coloco o João para cortar amanhã às quatro da tarde", "João", "2026-07-15", "16:00"],
    ["Boto o João para cortar amanhã às quatro da tarde", "João", "2026-07-15", "16:00"],
    ["Coloca o João Vitor para cortar amanhã, às quatro da tarde.", "João Vitor", "2026-07-15", "16:00"],
    ["Põe a Maria para fazer corte sexta às dez da manhã", "Maria", "2026-07-17", "10:00"],
    ["Marca o Pedro para cortar amanhã às 16 horas", "Pedro", "2026-07-15", "16:00"],
    ["Agenda o Lucas para corte amanhã às duas da tarde", "Lucas", "2026-07-15", "14:00"],
  ])("aceita construcao natural segura: %s", (message, clientName, date, time) => {
    expect(parseCanonicalDeterministicOwnerCommand({ message, context })).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName,
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        date,
        time,
      },
      missingFields: [],
      executed: false,
    });
  });

  it("preserva Marco como cliente quando aparece depois do marcador", () => {
    expect(parseCanonicalDeterministicOwnerCommand({
      context,
      message: "Agendar corte para Marco amanhã às 16:00",
    })).toMatchObject({
      intent: "schedule_appointment",
      draft: { clientName: "Marco", serviceNames: ["Corte"], time: "16:00" },
      missingFields: [],
    });
  });

  it.each([
    "Marco Antônio quer saber o preço do corte",
    "Marco um produto amanhã para João com pagamento Pix",
  ])("nao infere agendamento em contexto comercial: %s", (message) => {
    expect(parseDeterministicOwnerCommand({ context, message })).toBeNull();
  });

  it.each([
    ["Marca um corte amanh\u00e3 para o Jo\u00e3o Vitor, \u00e0s quatro da tarde.", "Jo\u00e3o Vitor", "16:00"],
    ["Marca um corte sexta para a Maria Silva, \u00e0s duas da tarde.", "Maria Silva", "14:00"],
    ["Agenda um corte hoje para o Pedro Souza, \u00e0s tr\u00eas da tarde.", "Pedro Souza", "15:00"],
  ])("separa horario falado do cliente quando servico e data aparecem antes do nome: %s", (message, clientName, time) => {
    expect(parseCanonicalDeterministicOwnerCommand({ message, context })).toMatchObject({
      intent: "schedule_appointment",
      draft: {
        clientName,
        serviceNames: ["Corte"],
        professionalName: "Geovane Borges",
        time,
      },
      missingFields: [],
      executed: false,
    });
  });

  it("seleciona o unico profissional habilitado entre dois ativos", () => {
    const eligibleContext: OwnerCommandContext = {
      ...context,
      professionals: [
        { id: "pro-geovane", name: "Geovane Borges" },
        { id: "pro-outro", name: "Outro Barbeiro" },
      ],
    };

    expect(parseCanonicalDeterministicOwnerCommand({
      context: eligibleContext,
      message: "Coloca o João Vitor para cortar amanhã às quatro da tarde",
    })).toMatchObject({
      draft: { professionalName: "Geovane Borges" },
      missingFields: [],
    });
  });

  it("exige escolha quando dois profissionais ativos estao habilitados", () => {
    const ambiguousContext: OwnerCommandContext = {
      ...context,
      services: [{ ...context.services[0], enabledProfessionalIds: [] }],
      professionals: [
        { id: "pro-geovane", name: "Geovane Borges" },
        { id: "pro-outro", name: "Outro Barbeiro" },
      ],
    };

    expect(parseCanonicalDeterministicOwnerCommand({
      context: ambiguousContext,
      message: "Coloca o João Vitor para cortar amanhã às quatro da tarde",
    })).toMatchObject({
      draft: { professionalName: undefined },
      missingFields: ["professionalName"],
      fieldDiagnostics: {
        professionalName: { status: "missing", reason: "multiple_eligible_professionals" },
      },
    });
  });

  it("bloqueia quando nenhum profissional ativo esta habilitado", () => {
    const unavailableContext: OwnerCommandContext = {
      ...context,
      services: [{ ...context.services[0], enabledProfessionalIds: ["pro-inexistente"] }],
    };

    expect(parseCanonicalDeterministicOwnerCommand({
      context: unavailableContext,
      message: "Coloca o João Vitor para cortar amanhã às quatro da tarde",
    })).toMatchObject({
      missingFields: ["professionalName"],
      fieldDiagnostics: {
        professionalName: { status: "missing", reason: "no_eligible_professional" },
      },
    });
  });

  it.each([
    ["Coloca para cortar amanhã às quatro da tarde", ["clientName"]],
    ["Coloca o João Vitor amanhã às quatro da tarde", ["serviceNames"]],
    ["Coloca o João Vitor para cortar às quatro da tarde", ["date"]],
    ["Coloca o João Vitor para cortar amanhã", ["time"]],
  ])("pergunta somente o campo ausente: %s", (message, missingFields) => {
    expect(parseCanonicalDeterministicOwnerCommand({ message, context })).toMatchObject({
      intent: "schedule_appointment",
      missingFields,
    });
  });

  it("mantem quatro sem periodo como horario ambiguo", () => {
    expect(parseCanonicalDeterministicOwnerCommand({
      context,
      message: "Coloca o João Vitor para cortar amanhã às quatro",
    })).toMatchObject({
      draft: { time: "" },
      missingFields: ["time"],
      fieldDiagnostics: { time: { status: "ambiguous", reason: "period_not_specified" } },
    });
  });
});
