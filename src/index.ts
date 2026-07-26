import { BarbershopEngine } from "./application/barbershop-engine";
import { Appointment, Product, ProductSale, Professional, Service } from "./domain/types";
import {
  CANONICAL_DEMO_PRODUCTS,
  CANONICAL_DEMO_PRODUCT_IDS,
} from "./infrastructure/canonical-demo-catalog";

function bootstrapDemo(): void {
  const engine = new BarbershopEngine();

  const service: Service = {
    id: "svc-corte",
    businessId: "unit-01",
    name: "Corte Premium",
    category: "CORTE",
    price: 75,
    durationMin: 45,
    defaultCommissionRate: 0.4,
    costEstimate: 12,
    active: true,
    createdAt: new Date("2026-04-22T00:00:00.000Z"),
    updatedAt: new Date("2026-04-22T00:00:00.000Z"),
  };

  const professional: Professional = {
    id: "pro-01",
    name: "Geovane Borges",
    active: true,
    commissionRules: [
      {
        id: "rule-service-default",
        appliesTo: "SERVICE",
        percentage: 0.4,
      },
      {
        id: "rule-product-default",
        appliesTo: "PRODUCT",
        percentage: 0.1,
      },
    ],
  };

  const existingAppointments: Appointment[] = [];
  const scheduled = engine.scheduleAppointment(
    {
      unitId: "unit-01",
      clientId: "cli-01",
      professionalId: professional.id,
      service,
      startsAt: new Date("2026-04-22T13:00:00"),
      bufferAfterMin: 10,
      changedBy: "owner@barbearia",
      notes: "Cliente prefere navalha",
    },
    existingAppointments,
  );

  const inService = engine.changeAppointmentStatus(
    scheduled,
    "CONFIRMED",
    "owner@barbearia",
  );
  const active = engine.changeAppointmentStatus(
    inService,
    "IN_SERVICE",
    "geovane@barbearia",
  );
  const completed = engine.completeAppointment({
    appointment: active,
    service,
    professional,
    monthlyProducedValue: 8_000,
    changedBy: "geovane@barbearia",
    completedAt: new Date("2026-04-22T14:00:00"),
  });

  const products: Product[] = CANONICAL_DEMO_PRODUCTS.map((product) => ({ ...product }));
  const pomada = products.find((product) => product.id === CANONICAL_DEMO_PRODUCT_IDS.pomada);
  if (!pomada) throw new Error("Produto canonico Pomada indisponivel");

  const sale: ProductSale = {
    id: "sale-01",
    unitId: "unit-01",
    clientId: "cli-01",
    professionalId: professional.id,
    items: [
      {
        productId: pomada.id,
        quantity: 1,
        unitPrice: pomada.salePrice,
        unitCost: pomada.costPrice,
      },
    ],
    grossAmount: 0,
    soldAt: new Date("2026-04-22T14:10:00"),
  };

  const saleResult = engine.registerProductSale({
    sale,
    products,
    professional,
  });

  const summary = {
    appointmentStatus: completed.appointment.status,
    serviceRevenue: completed.revenue.amount,
    serviceCommission: completed.commission?.commissionAmount ?? 0,
    productRevenue: saleResult.revenue.amount,
    productCommission: saleResult.commission?.commissionAmount ?? 0,
    stockMovementsCount: saleResult.stockMovements.length,
  };

  console.log("DEMO FOUNDATION SUMMARY");
  console.log(summary);
}

bootstrapDemo();
