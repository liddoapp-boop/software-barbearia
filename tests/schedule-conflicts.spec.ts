import { describe, expect, it } from "vitest";
import {
  hasAppointmentBlockConflict,
  hasAppointmentConflict,
  intervalsOverlap,
} from "../src/domain/rules";
import { Appointment, AppointmentBlock, AppointmentStatus } from "../src/domain/types";

function appointment(status: AppointmentStatus, startsAt: string, endsAt: string, overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: `appt-${status}-${startsAt}`,
    unitId: "unit-01",
    clientId: "cli-01",
    professionalId: "pro-01",
    serviceId: "svc-corte",
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status,
    serviceNameSnapshot: "Corte",
    servicePriceSnapshot: 75,
    serviceDurationMinSnapshot: 45,
    totalPriceSnapshot: 75,
    effectiveDurationMinSnapshot: 45,
    durationCalculationMode: "SUM",
    isFitting: false,
    history: [],
    ...overrides,
  };
}

function block(overrides: Partial<AppointmentBlock> = {}): AppointmentBlock {
  return {
    id: "block-01",
    unitId: "unit-01",
    professionalId: "pro-01",
    startsAt: new Date("2026-07-07T19:00:00.000Z"),
    endsAt: new Date("2026-07-07T20:00:00.000Z"),
    isFullDay: false,
    reason: "Agenda interna",
    status: "ACTIVE",
    createdBy: "test",
    ...overrides,
  };
}

describe("schedule conflict rules", () => {
  const requested = {
    businessId: "unit-01",
    professionalId: "pro-01",
    startsAt: new Date("2026-07-07T19:00:00.000Z"),
    endsAt: new Date("2026-07-07T20:00:00.000Z"),
  };

  it("usa overlap estrito e permite intervalos encostados", () => {
    expect(intervalsOverlap(
      { startsAt: new Date("2026-07-07T18:00:00.000Z"), endsAt: new Date("2026-07-07T19:00:00.000Z") },
      requested,
    )).toBe(false);
    expect(intervalsOverlap(
      { startsAt: new Date("2026-07-07T19:30:00.000Z"), endsAt: new Date("2026-07-07T20:30:00.000Z") },
      requested,
    )).toBe(true);
    expect(intervalsOverlap(
      { startsAt: new Date("2026-07-07T18:00:00.000Z"), endsAt: new Date("2026-07-07T21:00:00.000Z") },
      requested,
    )).toBe(true);
  });

  it("considera apenas estados operacionais de appointment", () => {
    for (const status of ["SCHEDULED", "CONFIRMED", "IN_SERVICE"] as AppointmentStatus[]) {
      expect(hasAppointmentConflict({
        ...requested,
        existingAppointments: [appointment(status, "2026-07-07T19:30:00.000Z", "2026-07-07T20:15:00.000Z")],
      })).toBe(true);
    }

    for (const status of ["CANCELLED", "NO_SHOW", "COMPLETED"] as AppointmentStatus[]) {
      expect(hasAppointmentConflict({
        ...requested,
        existingAppointments: [appointment(status, "2026-07-07T19:30:00.000Z", "2026-07-07T20:15:00.000Z")],
      })).toBe(false);
    }
  });

  it("isola unidade e profissional em conflitos profissionais", () => {
    expect(hasAppointmentConflict({
      ...requested,
      existingAppointments: [appointment("SCHEDULED", "2026-07-07T19:30:00.000Z", "2026-07-07T20:15:00.000Z", { unitId: "unit-02" })],
    })).toBe(false);
    expect(hasAppointmentConflict({
      ...requested,
      existingAppointments: [appointment("SCHEDULED", "2026-07-07T19:30:00.000Z", "2026-07-07T20:15:00.000Z", { professionalId: "pro-02", clientId: "cli-02" })],
    })).toBe(false);
  });

  it("considera somente blocks ativos e aplicaveis ao profissional", () => {
    expect(hasAppointmentBlockConflict({ unitId: "unit-01", professionalId: "pro-01", startsAt: requested.startsAt, endsAt: requested.endsAt, existingBlocks: [block()] })).toBe(true);
    expect(hasAppointmentBlockConflict({ unitId: "unit-01", professionalId: "pro-01", startsAt: requested.startsAt, endsAt: requested.endsAt, existingBlocks: [block({ status: "CANCELLED", cancelledAt: new Date("2026-07-07T18:00:00.000Z") })] })).toBe(false);
    expect(hasAppointmentBlockConflict({ unitId: "unit-01", professionalId: "pro-01", startsAt: requested.startsAt, endsAt: requested.endsAt, existingBlocks: [block({ unitId: "unit-02" })] })).toBe(false);
    expect(hasAppointmentBlockConflict({ unitId: "unit-01", professionalId: "pro-01", startsAt: requested.startsAt, endsAt: requested.endsAt, existingBlocks: [block({ professionalId: "pro-02" })] })).toBe(false);
    expect(hasAppointmentBlockConflict({ unitId: "unit-01", professionalId: "pro-01", startsAt: requested.startsAt, endsAt: requested.endsAt, existingBlocks: [block({ professionalId: undefined })] })).toBe(true);
  });

  it("bloqueio de dia inteiro ativo bloqueia apenas a data local convertida para UTC", () => {
    const fullDay = block({
      professionalId: undefined,
      isFullDay: true,
      startsAt: new Date("2026-07-07T03:00:00.000Z"),
      endsAt: new Date("2026-07-08T03:00:00.000Z"),
    });

    expect(hasAppointmentBlockConflict({
      unitId: "unit-01",
      professionalId: "pro-01",
      startsAt: new Date("2026-07-07T19:00:00.000Z"),
      endsAt: new Date("2026-07-07T20:00:00.000Z"),
      existingBlocks: [fullDay],
    })).toBe(true);
    expect(hasAppointmentBlockConflict({
      unitId: "unit-01",
      professionalId: "pro-01",
      startsAt: new Date("2026-07-08T19:00:00.000Z"),
      endsAt: new Date("2026-07-08T20:00:00.000Z"),
      existingBlocks: [fullDay],
    })).toBe(false);
  });
});