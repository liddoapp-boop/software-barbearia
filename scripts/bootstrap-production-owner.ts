import "dotenv/config";
import {
  PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE,
  bootstrapInitialProductionOwner,
  createPrismaProductionBootstrapStore,
} from "../src/application/production-bootstrap";
import { prisma } from "../src/infrastructure/database/prisma";
import { assertSafeServerEnvironment } from "../src/server-environment";

async function main() {
  assertSafeServerEnvironment(process.env);
  const result = await bootstrapInitialProductionOwner(
    createPrismaProductionBootstrapStore(prisma),
    {
      confirmation: process.env.BOOTSTRAP_PRODUCTION_CONFIRM ?? "",
      unitId: process.env.BOOTSTRAP_UNIT_ID ?? "",
      unitName: process.env.BOOTSTRAP_UNIT_NAME ?? "",
      unitTimezone: process.env.BOOTSTRAP_UNIT_TIMEZONE,
      ownerEmail: process.env.BOOTSTRAP_OWNER_EMAIL ?? "",
      ownerName: process.env.BOOTSTRAP_OWNER_NAME ?? "",
      ownerPassword: process.env.BOOTSTRAP_OWNER_PASSWORD ?? "",
    },
  );
  console.info(JSON.stringify({
    event: "production_bootstrap",
    status: result.status,
    ownerId: result.ownerId,
    ...("unitId" in result ? { unitId: result.unitId } : {}),
  }));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Bootstrap de producao recusado.";
    console.error(
      message === PRODUCTION_BOOTSTRAP_REFUSED_MESSAGE
        ? message
        : "Bootstrap de producao falhou sem criar ou alterar parcialmente os dados.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
