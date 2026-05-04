import {
  buildProductRevenueEntry,
  buildServiceRevenueEntry,
  buildStockMovementsFromSale,
  calculateProductCommission,
  calculateProductSaleGrossAmount,
  calculateServiceCommission,
  canTransitionAppointmentStatus,
  hasAppointmentConflict,
} from "../domain/rules";
import {
  Appointment,
  AppointmentHistoryItem,
  CommissionEntry,
  FinancialEntry,
  Product,
  ProductSale,
  Professional,
  Service,
  StockMovement,
  UUID,
} from "../domain/types";

export interface ScheduleAppointmentInput {
  unitId: UUID;
  clientId: UUID;
  professionalId: UUID;
  service: Service;
  startsAt: Date;
  bufferAfterMin?: number;
  isFitting?: boolean;
  notes?: string;
  changedBy: string;
}

export interface CompleteAppointmentInput {
  appointment: Appointment;
  service: Service;
  professional: Professional;
  monthlyProducedValue: number;
  changedBy: string;
  completedAt: Date;
}

export interface RegisterProductSaleInput {
  sale: ProductSale;
  products: Product[];
  professional?: Professional;
}

export class BarbershopEngine {
  scheduleAppointment(
    input: ScheduleAppointmentInput,
    existingAppointments: Appointment[],
  ): Appointment {
    const bufferMin = input.bufferAfterMin ?? 0;
    const endsAt = new Date(
      input.startsAt.getTime() + (input.service.durationMin + bufferMin) * 60_000,
    );

    const conflict = hasAppointmentConflict({
      businessId: input.unitId,
      professionalId: input.professionalId,
      startsAt: input.startsAt,
      endsAt,
      existingAppointments,
    });
    if (conflict) {
      throw new Error("Conflito de horario detectado para o profissional");
    }

    const history: AppointmentHistoryItem[] = [
      {
        changedAt: new Date(),
        changedBy: input.changedBy,
        action: "CREATED",
      },
    ];

    return {
      id: crypto.randomUUID(),
      unitId: input.unitId,
      clientId: input.clientId,
      professionalId: input.professionalId,
      serviceId: input.service.id,
      startsAt: input.startsAt,
      endsAt,
      status: "SCHEDULED",
      isFitting: Boolean(input.isFitting),
      notes: input.notes,
      history,
    };
  }

  rescheduleAppointment(
    appointment: Appointment,
    startsAt: Date,
    serviceDurationMin: number,
    existingAppointments: Appointment[],
    changedBy: string,
  ): Appointment {
    const endsAt = new Date(startsAt.getTime() + serviceDurationMin * 60_000);
    const conflict = hasAppointmentConflict({
      businessId: appointment.unitId,
      professionalId: appointment.professionalId,
      startsAt,
      endsAt,
      ignoreAppointmentId: appointment.id,
      existingAppointments,
    });
    if (conflict) {
      throw new Error("Nao foi possivel remarcar: novo horario em conflito");
    }

    const updated: Appointment = {
      ...appointment,
      startsAt,
      endsAt,
      history: [
        ...appointment.history,
        {
          changedAt: new Date(),
          changedBy,
          action: "RESCHEDULED",
        },
      ],
    };
    return updated;
  }

  changeAppointmentStatus(
    appointment: Appointment,
    nextStatus: Appointment["status"],
    changedBy: string,
    reason?: string,
  ): Appointment {
    if (!canTransitionAppointmentStatus(appointment.status, nextStatus)) {
      throw new Error(
        `Transicao invalida: ${appointment.status} -> ${nextStatus}`,
      );
    }

    const actionMap: Record<Appointment["status"], AppointmentHistoryItem["action"]> =
      {
        SCHEDULED: "CREATED",
        CONFIRMED: "CONFIRMED",
        IN_SERVICE: "CHECKED_IN",
        COMPLETED: "COMPLETED",
        CANCELLED: "CANCELLED",
        NO_SHOW: "NO_SHOW",
        BLOCKED: "BLOCKED",
      };

    return {
      ...appointment,
      status: nextStatus,
      history: [
        ...appointment.history,
        {
          changedAt: new Date(),
          changedBy,
          action: actionMap[nextStatus],
          reason,
        },
      ],
    };
  }

  completeAppointment(input: CompleteAppointmentInput): {
    appointment: Appointment;
    revenue: FinancialEntry;
    commission?: CommissionEntry;
  } {
    if (input.appointment.status !== "IN_SERVICE") {
      throw new Error("Atendimento precisa estar em andamento para concluir");
    }

    const completedAppointment = this.changeAppointmentStatus(
      input.appointment,
      "COMPLETED",
      input.changedBy,
    );

    const revenue = buildServiceRevenueEntry({
      unitId: input.appointment.unitId,
      appointmentId: input.appointment.id,
      amount: input.service.price,
      occurredAt: input.completedAt,
      description: `Receita de servico: ${input.service.name}`,
    });

    const commission = calculateServiceCommission(
      input.professional,
      input.service,
      input.service.price,
      input.monthlyProducedValue,
      input.appointment.unitId,
      input.appointment.id,
      input.completedAt,
    );

    return {
      appointment: completedAppointment,
      revenue,
      commission: commission ?? undefined,
    };
  }

  registerProductSale(input: RegisterProductSaleInput): {
    sale: ProductSale;
    revenue: FinancialEntry;
    stockMovements: StockMovement[];
    commission?: CommissionEntry;
  } {
    const grossAmount = calculateProductSaleGrossAmount(input.sale);
    const sale: ProductSale = { ...input.sale, grossAmount };
    const now = sale.soldAt;
    const stockMovements = buildStockMovementsFromSale(
      sale.unitId,
      sale,
      input.products,
      now,
    );

    const revenue = buildProductRevenueEntry({
      unitId: sale.unitId,
      productSaleId: sale.id,
      amount: sale.grossAmount,
      occurredAt: now,
      description: "Receita de venda de produtos",
    });

    const commission = input.professional
      ? calculateProductCommission(
          input.professional,
          sale.grossAmount,
          sale.unitId,
          sale.id,
          now,
        )
      : null;

    return {
      sale,
      revenue,
      stockMovements,
      commission: commission ?? undefined,
    };
  }
}
