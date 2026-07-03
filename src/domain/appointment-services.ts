import { createHash } from "node:crypto";
import {
  AppointmentDurationCalculationMode,
  AppointmentServiceItem,
  ServiceCombinationRule,
  UUID,
} from "./types";

export const MIN_APPOINTMENT_SERVICES = 1;
export const MAX_APPOINTMENT_SERVICES = 6;
export const MULTI_SERVICE_CHECKOUT_NOT_AVAILABLE = "MULTI_SERVICE_CHECKOUT_NOT_AVAILABLE";
export const MULTI_SERVICE_CHECKOUT_NOT_AVAILABLE_MESSAGE =
  "O checkout de atendimentos com varios servicos ainda nao esta disponivel.";

export type AppointmentDurationResolution = {
  effectiveDurationMin: number;
  calculationMode: AppointmentDurationCalculationMode;
  matchedRuleId?: string;
  matchedRuleLabel?: string;
};

export function normalizeServiceIds(input: unknown): UUID[] {
  if (!Array.isArray(input)) {
    throw new Error("Informe a lista de servicos do agendamento");
  }
  if (input.length < MIN_APPOINTMENT_SERVICES) {
    throw new Error("Agendamento precisa ter ao menos um servico");
  }
  if (input.length > MAX_APPOINTMENT_SERVICES) {
    throw new Error(`Agendamento pode ter no maximo ${MAX_APPOINTMENT_SERVICES} servicos`);
  }

  const normalized = input.map((item) => String(item ?? "").trim());
  if (normalized.some((item) => !item)) {
    throw new Error("Servico do agendamento nao pode ser vazio");
  }

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error("Agendamento nao pode repetir o mesmo servico");
  }

  return normalized;
}

export function buildServiceSetKey(serviceIds: unknown): string {
  const normalized = normalizeServiceIds(serviceIds).sort();
  const canonical = JSON.stringify(normalized);
  return createHash("sha256").update(canonical).digest("hex");
}

export function calculateAppointmentServicesTotal(
  items: Pick<AppointmentServiceItem, "servicePriceSnapshot">[],
) {
  const total = items.reduce((acc, item) => {
    const value = Number(item.servicePriceSnapshot);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Preco de servico do agendamento invalido");
    }
    return acc + value;
  }, 0);
  return Number(total.toFixed(2));
}

export function resolveEffectiveAppointmentDuration(input: {
  items: Pick<AppointmentServiceItem, "serviceId" | "serviceDurationMinSnapshot">[];
  activeRules?: ServiceCombinationRule[];
}): AppointmentDurationResolution {
  const serviceIds = input.items.map((item) => item.serviceId);
  const serviceSetKey = buildServiceSetKey(serviceIds);
  const matchedRule = (input.activeRules ?? []).find(
    (rule) => rule.active && rule.serviceSetKey === serviceSetKey,
  );
  if (matchedRule) {
    const effectiveDurationMin = Math.trunc(Number(matchedRule.effectiveDurationMin));
    if (!Number.isFinite(effectiveDurationMin) || effectiveDurationMin <= 0) {
      throw new Error("Duracao da regra de combinacao invalida");
    }
    return {
      effectiveDurationMin,
      calculationMode: "COMBINATION_RULE",
      matchedRuleId: matchedRule.id,
      matchedRuleLabel: matchedRule.label,
    };
  }

  const effectiveDurationMin = input.items.reduce((acc, item) => {
    const duration = Math.trunc(Number(item.serviceDurationMinSnapshot));
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Duracao de servico do agendamento invalida");
    }
    return acc + duration;
  }, 0);
  if (effectiveDurationMin <= 0) {
    throw new Error("Duracao efetiva do agendamento precisa ser positiva");
  }
  return {
    effectiveDurationMin,
    calculationMode: "SUM",
  };
}

export function resolveLegacyPrimaryServiceId(
  items: Pick<AppointmentServiceItem, "serviceId" | "position">[],
) {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const primary = ordered[0]?.serviceId;
  if (!primary) throw new Error("Agendamento precisa ter servico principal legado");
  return primary;
}

export function createBusinessRuleError(message: string, code: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
