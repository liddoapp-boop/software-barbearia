import { describe, expect, it } from "vitest";
import {
  buildServiceSetKey,
  calculateAppointmentServicesTotal,
  normalizeServiceIds,
  resolveEffectiveAppointmentDuration,
  resolveLegacyPrimaryServiceId,
} from "../src/domain/appointment-services";
import { AppointmentServiceItem, ServiceCombinationRule } from "../src/domain/types";

function item(input: Partial<AppointmentServiceItem> & { serviceId: string; position: number }): AppointmentServiceItem {
  return {
    id: `asi-${input.serviceId}`,
    appointmentId: "apt-01",
    serviceId: input.serviceId,
    position: input.position,
    serviceNameSnapshot: input.serviceNameSnapshot ?? input.serviceId,
    servicePriceSnapshot: input.servicePriceSnapshot ?? 10,
    serviceDurationMinSnapshot: input.serviceDurationMinSnapshot ?? 30,
  };
}

describe("appointment service domain helpers", () => {
  it("normaliza de 1 ate 6 servicos preservando ordem", () => {
    expect(normalizeServiceIds([" corte ", "barba"])).toEqual(["corte", "barba"]);
    expect(normalizeServiceIds(["a", "b", "c", "d", "e", "f"])).toHaveLength(6);
  });

  it("rejeita entrada vazia, mais de 6, IDs vazios e duplicados", () => {
    expect(() => normalizeServiceIds([])).toThrow(/ao menos um/);
    expect(() => normalizeServiceIds(["a", "b", "c", "d", "e", "f", "g"])).toThrow(/maximo 6/);
    expect(() => normalizeServiceIds(["a", " "])).toThrow(/vazio/);
    expect(() => normalizeServiceIds(["a", "a"])).toThrow(/repetir/);
  });

  it("gera serviceSetKey deterministica independente da ordem", () => {
    expect(buildServiceSetKey(["barba-id", "corte-id"])).toBe(
      buildServiceSetKey(["corte-id", "barba-id"]),
    );
  });

  it("soma preco snapshot com arredondamento monetario", () => {
    expect(
      calculateAppointmentServicesTotal([
        item({ serviceId: "corte", position: 0, servicePriceSnapshot: 30.105 }),
        item({ serviceId: "barba", position: 1, servicePriceSnapshot: 19.895 }),
      ]),
    ).toBe(50);
    expect(() =>
      calculateAppointmentServicesTotal([item({ serviceId: "bad", position: 0, servicePriceSnapshot: -1 })]),
    ).toThrow(/Preco/);
  });

  it("resolve duracao por soma quando nao ha regra", () => {
    const result = resolveEffectiveAppointmentDuration({
      items: [
        item({ serviceId: "corte", position: 0, serviceDurationMinSnapshot: 30 }),
        item({ serviceId: "hidratacao", position: 1, serviceDurationMinSnapshot: 30 }),
      ],
      activeRules: [],
    });
    expect(result).toEqual({ effectiveDurationMin: 60, calculationMode: "SUM" });
  });

  it("aplica Corte + Barba em 45 minutos independente da ordem e sem alterar preco", () => {
    const rule: ServiceCombinationRule = {
      id: "rule-corte-barba",
      unitId: "unit-01",
      serviceSetKey: buildServiceSetKey(["corte", "barba"]),
      label: "Corte + Barba - 45 min",
      effectiveDurationMin: 45,
      active: true,
      items: [],
    };
    expect(
      resolveEffectiveAppointmentDuration({
        items: [
          item({ serviceId: "corte", position: 0, serviceDurationMinSnapshot: 30 }),
          item({ serviceId: "barba", position: 1, serviceDurationMinSnapshot: 30 }),
        ],
        activeRules: [rule],
      }),
    ).toMatchObject({
      effectiveDurationMin: 45,
      calculationMode: "COMBINATION_RULE",
      matchedRuleId: "rule-corte-barba",
    });
    expect(
      resolveEffectiveAppointmentDuration({
        items: [
          item({ serviceId: "barba", position: 0, serviceDurationMinSnapshot: 30 }),
          item({ serviceId: "corte", position: 1, serviceDurationMinSnapshot: 30 }),
        ],
        activeRules: [rule],
      }).effectiveDurationMin,
    ).toBe(45);
  });

  it("nao aplica regra Corte + Barba a conjunto maior", () => {
    const rule: ServiceCombinationRule = {
      id: "rule-corte-barba",
      unitId: "unit-01",
      serviceSetKey: buildServiceSetKey(["corte", "barba"]),
      label: "Corte + Barba - 45 min",
      effectiveDurationMin: 45,
      active: true,
      items: [],
    };
    expect(
      resolveEffectiveAppointmentDuration({
        items: [
          item({ serviceId: "corte", position: 0 }),
          item({ serviceId: "barba", position: 1 }),
          item({ serviceId: "hidratacao", position: 2 }),
        ],
        activeRules: [rule],
      }).calculationMode,
    ).toBe("SUM");
  });

  it("resolve servico legado pela posicao", () => {
    expect(
      resolveLegacyPrimaryServiceId([
        item({ serviceId: "barba", position: 1 }),
        item({ serviceId: "corte", position: 0 }),
      ]),
    ).toBe("corte");
  });
});
