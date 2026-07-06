import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadScheduleValidation() {
  let source = readFileSync("public/modules/schedule-validation.js", "utf8");
  source = source.replace(/export const /g, "const ");
  source = source.replace(/export function /g, "function ");
  source += `
module.exports = {
  SCHEDULE_CLIENT_REQUIRED_MESSAGE,
  friendlyApiValidationMessage,
  isRawValidationMessage,
  validateScheduleClientSelection,
};`;
  const context = { module: { exports: {} as Record<string, unknown> } };
  vm.runInNewContext(source, context, { filename: "public/modules/schedule-validation.js" });
  return context.module.exports as Record<string, any>;
}

describe("validacao frontend do agendamento", () => {
  it("bloqueia texto digitado sem clientId real antes de enviar", () => {
    const { SCHEDULE_CLIENT_REQUIRED_MESSAGE, validateScheduleClientSelection } = loadScheduleValidation();

    expect(
      validateScheduleClientSelection({
        clientId: "",
        clientSearchValue: "Cliente digitado",
        clientsById: { "cli-01": { id: "cli-01", fullName: "Cliente cadastrado" } },
      }),
    ).toMatchObject({
      ok: false,
      message: SCHEDULE_CLIENT_REQUIRED_MESSAGE,
      typedClient: "Cliente digitado",
    });
  });

  it("libera envio quando o clientId selecionado existe no catalogo", () => {
    const { validateScheduleClientSelection } = loadScheduleValidation();

    expect(
      validateScheduleClientSelection({
        clientId: "cli-01",
        clientSearchValue: "Cliente cadastrado",
        clientsById: { "cli-01": { id: "cli-01", fullName: "Cliente cadastrado" } },
      }),
    ).toMatchObject({
      ok: true,
      clientId: "cli-01",
    });
  });

  it("nao deixa JSON bruto de validacao aparecer na interface", () => {
    const { friendlyApiValidationMessage, isRawValidationMessage } = loadScheduleValidation();
    const fallback = "Nao foi possivel concluir o agendamento.";
    const zodMessage =
      '[{"code":"too_small","minimum":1,"type":"string","message":"expected string to have >= 1 characters"}]';

    expect(isRawValidationMessage(zodMessage)).toBe(true);
    expect(friendlyApiValidationMessage(zodMessage, fallback)).toBe(fallback);
    expect(friendlyApiValidationMessage("Este horario ja esta ocupado.", fallback)).toBe(
      "Este horario ja esta ocupado.",
    );
  });

  it("mantem o submit protegido antes de chamar a API", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const guardIndex = appSource.indexOf("validateScheduleClientSelection({");
    const requestIndex = appSource.indexOf('callJson(`${API}/appointments`, "POST"');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(requestIndex).toBeGreaterThan(guardIndex);
    expect(appSource).toContain("clientSearch?.focus();");
    expect(appSource.indexOf("validateSelectedServices(appointmentSelectedServices)", guardIndex)).toBeGreaterThan(guardIndex);
    expect(appSource).toContain("serviceIds,");
    expect(appSource).not.toContain("serviceId: serviceId.value");
    expect(appSource).toContain("friendlyApiValidationMessage(fromPayload, fallbackMessage)");
  });

  it("usa apenas servicos ativos no catalogo operacional do agendamento", () => {
    const appSource = readFileSync("public/app.js", "utf8");
    const catalogIndex = appSource.indexOf("async function loadCatalog()");
    const normalizedIndex = appSource.indexOf("const normalized = normalizeCatalogForScheduling({", catalogIndex);
    const allServicesIndex = appSource.indexOf("allServices = normalized.services;", normalizedIndex);

    expect(catalogIndex).toBeGreaterThanOrEqual(0);
    expect(appSource.indexOf("const operationalServices =", catalogIndex)).toBeGreaterThan(catalogIndex);
    expect(appSource.indexOf("(item) => serviceIsActive(item)", catalogIndex)).toBeGreaterThan(catalogIndex);
    expect(normalizedIndex).toBeGreaterThan(catalogIndex);
    expect(appSource.indexOf("services: operationalServices", normalizedIndex)).toBeGreaterThan(normalizedIndex);
    expect(allServicesIndex).toBeGreaterThan(normalizedIndex);
    expect(appSource.indexOf("fillSelect(filterService, operationalServices", allServicesIndex)).toBeGreaterThan(allServicesIndex);
    expect(appSource.indexOf("fillSelect(appointmentsFilterService, operationalServices", allServicesIndex)).toBeGreaterThan(allServicesIndex);
  });
});
