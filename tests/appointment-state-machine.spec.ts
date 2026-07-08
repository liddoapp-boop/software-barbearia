import { describe, expect, it } from "vitest";
import {
  assertAppointmentCanBeRescheduled,
  assertAppointmentTransitionAllowed,
  assertCancellationReasonProvided,
  assertNoShowToleranceElapsed,
  canTransitionAppointmentStatus,
  isNoShowEligible,
  isTerminalAppointmentStatus,
} from "../src/domain/appointment-state-machine";

describe("appointment state machine", () => {
  it("permite somente as transicoes operacionais aprovadas", () => {
    expect(canTransitionAppointmentStatus("SCHEDULED", "CONFIRMED")).toBe(true);
    expect(canTransitionAppointmentStatus("SCHEDULED", "CANCELLED")).toBe(true);
    expect(canTransitionAppointmentStatus("SCHEDULED", "NO_SHOW")).toBe(true);
    expect(canTransitionAppointmentStatus("CONFIRMED", "IN_SERVICE")).toBe(true);
    expect(canTransitionAppointmentStatus("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransitionAppointmentStatus("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(canTransitionAppointmentStatus("IN_SERVICE", "COMPLETED")).toBe(true);
  });

  it("bloqueia transicoes proibidas e estados terminais", () => {
    expect(() => assertAppointmentTransitionAllowed("IN_SERVICE", "CANCELLED")).toThrow(/andamento/i);
    expect(() => assertAppointmentTransitionAllowed("IN_SERVICE", "NO_SHOW")).toThrow(/andamento/i);
    expect(() => assertAppointmentTransitionAllowed("COMPLETED", "IN_SERVICE")).toThrow(/terminal/i);
    expect(() => assertAppointmentTransitionAllowed("CANCELLED", "CONFIRMED")).toThrow(/terminal/i);
    expect(() => assertAppointmentTransitionAllowed("NO_SHOW", "CONFIRMED")).toThrow(/terminal/i);
    expect(isTerminalAppointmentStatus("COMPLETED")).toBe(true);
    expect(isTerminalAppointmentStatus("CANCELLED")).toBe(true);
    expect(isTerminalAppointmentStatus("NO_SHOW")).toBe(true);
  });

  it("bloqueia remarcacao de terminal e aplica tolerancia exata de no-show", () => {
    expect(() => assertAppointmentCanBeRescheduled("COMPLETED")).toThrow(/terminal/i);

    const startsAt = new Date("2026-04-22T10:00:00.000Z");
    expect(isNoShowEligible(startsAt, new Date("2026-04-22T10:14:00.000Z"))).toBe(false);
    expect(isNoShowEligible(startsAt, new Date("2026-04-22T10:15:00.000Z"))).toBe(true);
    expect(isNoShowEligible(startsAt, new Date("2026-04-22T10:16:00.000Z"))).toBe(true);
    expect(() => assertNoShowToleranceElapsed(startsAt, new Date("2026-04-22T10:14:00.000Z"))).toThrow(
      /tolerancia de 15 minutos/i,
    );
  });

  it("exige motivo para cancelamento operacional", () => {
    expect(() => assertCancellationReasonProvided("CANCELLED")).toThrow(/motivo do cancelamento/i);
    expect(() => assertCancellationReasonProvided("CANCELLED", "   ")).toThrow(/motivo do cancelamento/i);
    expect(() => assertCancellationReasonProvided("CANCELLED", "Cliente avisou")).not.toThrow();
    expect(() => assertCancellationReasonProvided("NO_SHOW")).not.toThrow();
  });
});
