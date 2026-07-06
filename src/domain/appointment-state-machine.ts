import { AppointmentStatus } from "./types";

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "BLOCKED",
];

export const TERMINAL_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["IN_SERVICE", "CANCELLED", "NO_SHOW"],
  IN_SERVICE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  BLOCKED: ["CANCELLED"],
};

export function isTerminalAppointmentStatus(status: AppointmentStatus) {
  return TERMINAL_APPOINTMENT_STATUSES.includes(status);
}

export function canTransitionAppointmentStatus(from: AppointmentStatus, to: AppointmentStatus) {
  return APPOINTMENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function describeAppointmentTransitionError(from: AppointmentStatus, to: AppointmentStatus) {
  if (from === to) {
    if (to === "CONFIRMED") return "Agendamento ja confirmado.";
    if (to === "IN_SERVICE") return "Atendimento ja iniciado.";
    if (to === "CANCELLED") return "Agendamento ja cancelado.";
    if (to === "NO_SHOW") return "Cliente ja marcado como falta.";
    if (to === "COMPLETED") return "Atendimento ja concluido.";
  }
  if (isTerminalAppointmentStatus(from)) {
    return `Agendamento em estado terminal (${from}) nao pode ser alterado.`;
  }
  if (from === "IN_SERVICE" && to === "CANCELLED") {
    return "Atendimento em andamento nao pode ser cancelado diretamente.";
  }
  if (from === "IN_SERVICE" && to === "NO_SHOW") {
    return "Atendimento em andamento nao pode ser marcado como falta.";
  }
  if (to === "COMPLETED") {
    return "Use checkout para finalizar atendimento com financeiro.";
  }
  return `Transicao invalida: ${from} -> ${to}`;
}

export function assertAppointmentTransitionAllowed(from: AppointmentStatus, to: AppointmentStatus) {
  if (!canTransitionAppointmentStatus(from, to)) {
    throw new Error(describeAppointmentTransitionError(from, to));
  }
}

export function assertAppointmentCanBeRescheduled(status: AppointmentStatus) {
  if (isTerminalAppointmentStatus(status)) {
    throw new Error(`Agendamento em estado terminal (${status}) nao pode ser remarcado.`);
  }
}

export function assertAppointmentCanBeUpdated(
  status: AppointmentStatus,
  input: { hasTimeChange?: boolean; hasServiceChange?: boolean } = {},
) {
  if (!isTerminalAppointmentStatus(status)) return;
  if (input.hasTimeChange) {
    throw new Error(`Agendamento em estado terminal (${status}) nao pode ter horario alterado.`);
  }
  if (input.hasServiceChange) {
    throw new Error(`Agendamento em estado terminal (${status}) nao pode ter servicos alterados.`);
  }
  throw new Error(`Agendamento em estado terminal (${status}) nao pode ser alterado.`);
}

export function isNoShowEligible(startsAt: Date, now = new Date()) {
  return now.getTime() >= startsAt.getTime() + 15 * 60_000;
}

export function assertNoShowToleranceElapsed(startsAt: Date, now = new Date()) {
  if (!isNoShowEligible(startsAt, now)) {
    throw new Error("O cliente ainda esta dentro do periodo de tolerancia de 15 minutos.");
  }
}
