import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Nome do banco de teste contem caracteres nao permitidos");
  }
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const rawUrl = process.env.TEST_DATABASE_URL_COMPUTED?.trim();
  if (!rawUrl) throw new Error("TEST_DATABASE_URL_COMPUTED ausente");
  const testUrl = new URL(rawUrl);
  const database = decodeURIComponent(testUrl.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.has(testUrl.hostname) || !/test/i.test(database)) {
    throw new Error("Banco recusado: host precisa ser local e nome deve conter test");
  }

  const maintenanceUrl = new URL(testUrl.toString());
  maintenanceUrl.pathname = "/postgres";
  const prisma = new PrismaClient({
    datasources: { db: { url: maintenanceUrl.toString() } },
  });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      database,
    );
    if (!rows[0]?.exists) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${quoteIdentifier(database)}`);
      console.log(`[test-db] banco criado: host=${testUrl.hostname}; database=${database}`);
    } else {
      console.log(`[test-db] banco existente: host=${testUrl.hostname}; database=${database}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[test-db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
