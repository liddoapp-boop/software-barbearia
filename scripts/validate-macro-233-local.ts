import "dotenv/config";
import { createApp } from "../src/http/app";

async function main() {
  const app = createApp();
  const unitId = "unit-01";
  const catalog = await app.inject({ method: "GET", url: "/catalog?unitId=unit-01" });
  const catalogBody = catalog.json();
  const professionals = Array.isArray(catalogBody.professionals) ? catalogBody.professionals : [];
  const professionalIds = professionals.map((item: { id: string }) => item.id);

  const preview = await app.inject({
    method: "POST",
    url: "/appointments/services/preview",
    payload: { unitId, serviceIds: ["canon-svc-barba", "canon-svc-hidratacao"] },
  });
  const previewBody = preview.json();
  const eligibleProfessionalIds =
    previewBody.summary?.eligibleProfessionalIds ?? previewBody.eligibleProfessionalIds ?? [];
  const professionalId = eligibleProfessionalIds[0] ?? professionalIds[0];

  const walkin = await app.inject({
    method: "POST",
    url: "/appointments/walk-in",
    headers: { "idempotency-key": `macro233-walkin-${Date.now()}` },
    payload: {
      unitId,
      clientName: "Cliente Macro 233",
      clientPhone: `119${Date.now().toString().slice(-8)}`,
      professionalId,
      serviceIds: ["canon-svc-barba", "canon-svc-hidratacao"],
      startedAt: "2026-07-07T13:00:00.000Z",
      changedBy: "macro-233",
    },
  });
  const walkinBody = walkin.json();

  console.log(JSON.stringify({
    catalogStatus: catalog.statusCode,
    catalogProfessionals: professionalIds.length,
    catalogUniqueProfessionals: new Set(professionalIds).size,
    catalogNames: professionals.map((item: { name: string }) => item.name),
    previewStatus: preview.statusCode,
    eligibleProfessionalIds,
    totalPrice: previewBody.summary?.totalPriceSnapshot ?? previewBody.summary?.totalPrice ?? previewBody.totalPriceSnapshot,
    duration: previewBody.summary?.effectiveDurationMin ?? previewBody.effectiveDurationMin,
    walkinStatus: walkin.statusCode,
    walkinAppointmentStatus: walkinBody.appointment?.status,
    walkinTotal: walkinBody.appointment?.totalPriceSnapshot,
    walkinDuration: walkinBody.appointment?.effectiveDurationMinSnapshot,
    walkinServiceItems: walkinBody.appointment?.serviceItems?.map((item: { serviceId: string }) => item.serviceId),
    financialBeforeCheckout: walkinBody.serviceRevenue ?? null,
    commission: walkinBody.commission ?? null,
  }, null, 2));
  await app.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
