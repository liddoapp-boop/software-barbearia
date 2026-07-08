import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import readline from "node:readline";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ quiet: true });

const EXPECTED_DB = "barbearia_pilot";
const EXPECTED_EMAIL = "bgeovane265@gmail.com";
const EXPECTED_UNIT_NAME = "Barbearia Geovane Borges";
const OWNER_ID = "usr-geovane-owner";

function fail(message) {
  throw new Error(message);
}

function assertInteractiveInput() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("Entrada interativa mascarada indisponivel. Execute em um terminal local.");
  }
}

function promptWindowsPasswordDialog() {
  if (process.platform !== "win32") {
    fail("Entrada interativa mascarada indisponivel. Execute em um terminal local.");
  }

  const script = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Owner do piloto'
$form.Width = 420
$form.Height = 220
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label1 = New-Object System.Windows.Forms.Label
$label1.Text = 'Senha do owner'
$label1.Left = 16
$label1.Top = 20
$label1.Width = 360
$form.Controls.Add($label1)

$password = New-Object System.Windows.Forms.TextBox
$password.Left = 16
$password.Top = 44
$password.Width = 360
$password.UseSystemPasswordChar = $true
$form.Controls.Add($password)

$label2 = New-Object System.Windows.Forms.Label
$label2.Text = 'Confirmar senha do owner'
$label2.Left = 16
$label2.Top = 78
$label2.Width = 360
$form.Controls.Add($label2)

$confirmation = New-Object System.Windows.Forms.TextBox
$confirmation.Left = 16
$confirmation.Top = 102
$confirmation.Width = 360
$confirmation.UseSystemPasswordChar = $true
$form.Controls.Add($confirmation)

$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'Confirmar'
$ok.Left = 210
$ok.Top = 142
$ok.Width = 80
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $ok
$form.Controls.Add($ok)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancelar'
$cancel.Left = 296
$cancel.Top = 142
$cancel.Width = 80
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancel
$form.Controls.Add($cancel)

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
if ([string]::IsNullOrWhiteSpace($password.Text)) { exit 3 }
if ($password.Text -ne $confirmation.Text) { exit 4 }

[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($password.Text)))
`;

  try {
    const encodedPassword = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return Buffer.from(encodedPassword, "base64").toString("utf8");
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : 1;
    if (status === 2) fail("Operacao cancelada");
    if (status === 3) fail("Senha recusada: valor vazio");
    if (status === 4) fail("Confirmacao de senha nao confere");
    fail("Nao foi possivel coletar a senha com entrada mascarada local");
  }
}

function parseTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL ausente");

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("DATABASE_URL invalida");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const host = url.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(host)) {
    fail("Provisionamento recusado: host precisa ser local");
  }
  if (database !== EXPECTED_DB) {
    fail(`Provisionamento recusado: banco deve ser exatamente ${EXPECTED_DB}`);
  }
  if (database === "barbearia") {
    fail("Provisionamento recusado: banco barbearia e proibido");
  }

  return { host, database };
}

async function promptMasked(label) {
  assertInteractiveInput();
  return await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const stdin = process.stdin;
    const onData = (char) => {
      const value = char.toString("utf8");
      if (value === "\r" || value === "\n" || value === "\u0004") {
        return;
      }
      if (value === "\u0003") {
        process.stdout.write("\n");
        reject(new Error("Operacao cancelada"));
        return;
      }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${label}${"*".repeat(rl.line.length)}`);
    };

    stdin.on("data", onData);
    rl.question(label, (answer) => {
      stdin.off("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function collectPassword() {
  const password = process.stdin.isTTY && process.stdout.isTTY
    ? await promptMasked("Senha do owner: ")
    : promptWindowsPasswordDialog();
  const confirmation = process.stdin.isTTY && process.stdout.isTTY
    ? await promptMasked("Confirmar senha do owner: ")
    : password;
  if (!password) {
    fail("Senha recusada: valor vazio");
  }
  const forbiddenPasswords = new Set([
    "admin123",
    "owner123",
    "recepcao123",
    "profissional123",
    "password",
    "senha123",
    "123456",
    "12345678",
  ]);
  if (forbiddenPasswords.has(password.trim().toLowerCase())) {
    fail("Senha recusada: senha padrao/dev nao permitida");
  }
  if (password !== confirmation) {
    fail("Confirmacao de senha nao confere");
  }
  return password;
}

async function assertDatabaseTarget(prisma, expected) {
  const rows = await prisma.$queryRaw`
    SELECT
      current_database() AS database,
      inet_server_addr()::text AS server_addr,
      inet_server_port()::int AS server_port
  `;
  const actual = rows[0] ?? {};
  if (actual.database !== expected.database) {
    fail(`Banco conectado inesperado: ${actual.database || "desconhecido"}`);
  }

  const serverAddr = String(actual.server_addr ?? "").split("/")[0];
  const localAddresses = new Set(["", "127.0.0.1", "::1"]);
  if (!localAddresses.has(serverAddr)) {
    fail("Conexao recusada: servidor PostgreSQL nao parece local");
  }

  const migrations = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
  `;
  const failed = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  `;
  const appliedCount = Number(migrations[0]?.count ?? 0);
  const failedCount = Number(failed[0]?.count ?? 0);
  if (appliedCount !== 21 || failedCount !== 0) {
    fail(`Schema nao esta pronto: migrations=${appliedCount}, falhas=${failedCount}`);
  }

  return {
    database: actual.database,
    host: expected.host,
    serverPort: Number(actual.server_port ?? 0),
    migrations: appliedCount,
  };
}

async function assertInitialState(prisma) {
  const [unit, userCount] = await Promise.all([
    prisma.unit.findFirst({
      where: { name: EXPECTED_UNIT_NAME },
      select: { id: true, name: true },
    }),
    prisma.user.count(),
  ]);

  if (!unit) {
    fail(`Unidade obrigatoria nao encontrada: ${EXPECTED_UNIT_NAME}`);
  }
  if (userCount !== 0) {
    fail(`Provisionamento recusado: esperado zero usuarios, encontrado ${userCount}`);
  }

  return unit;
}

async function assertUnitExists(prisma) {
  const unit = await prisma.unit.findFirst({
    where: { name: EXPECTED_UNIT_NAME },
    select: { id: true, name: true },
  });
  if (!unit) {
    fail(`Unidade obrigatoria nao encontrada: ${EXPECTED_UNIT_NAME}`);
  }
  return unit;
}

async function assertExistingOwnerState(prisma, unit) {
  const [users, accesses, fictitious] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        unitAccesses: {
          select: {
            unitId: true,
            role: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.userUnitAccess.findMany({
      select: {
        userId: true,
        unitId: true,
        role: true,
        isActive: true,
      },
    }),
    prisma.user.count({
      where: {
        OR: [
          { email: { endsWith: "@barbearia.local" } },
          { email: { contains: "example.com" } },
          { email: { contains: "teste" } },
          { email: { contains: "test" } },
        ],
      },
    }),
  ]);

  if (users.length !== 1) {
    fail(`Estado invalido: esperado 1 usuario, encontrado ${users.length}`);
  }
  if (accesses.length !== 1) {
    fail(`Estado invalido: esperado 1 vinculo, encontrado ${accesses.length}`);
  }

  const user = users[0];
  const access = accesses[0];
  if (
    user.email !== EXPECTED_EMAIL ||
    user.email !== user.email.toLowerCase() ||
    user.role !== "owner" ||
    !user.isActive ||
    access.userId !== user.id ||
    access.unitId !== unit.id ||
    access.role !== "owner" ||
    !access.isActive ||
    fictitious !== 0
  ) {
    fail("Estado invalido: owner, vinculo ou usuario ficticio fora do esperado");
  }

  return { email: user.email, userId: user.id, unitId: unit.id };
}

async function provisionOwner(prisma, unit, password) {
  const { hashPassword } = await import("../src/http/security.ts");
  const email = EXPECTED_EMAIL.trim().toLowerCase();
  if (email !== EXPECTED_EMAIL) {
    fail("E-mail confirmado invalido");
  }

  const passwordHash = hashPassword(password);
  const accessId = `access-${OWNER_ID}-${unit.id}`.slice(0, 180);

  await prisma.$transaction(async (tx) => {
    const [usersBefore, existingEmail] = await Promise.all([
      tx.user.count(),
      tx.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (usersBefore !== 0 || existingEmail) {
      fail("Provisionamento recusado: usuario ja existente");
    }

    await tx.user.create({
      data: {
        id: OWNER_ID,
        email,
        passwordHash,
        name: "Geovane Borges",
        role: "owner",
        isActive: true,
      },
    });

    await tx.userUnitAccess.create({
      data: {
        id: accessId,
        userId: OWNER_ID,
        unitId: unit.id,
        role: "owner",
        isActive: true,
      },
    });

    const [usersAfter, accessesAfter] = await Promise.all([
      tx.user.count(),
      tx.userUnitAccess.count({
        where: { userId: OWNER_ID, unitId: unit.id, role: "owner", isActive: true },
      }),
    ]);
    if (usersAfter !== 1 || accessesAfter !== 1) {
      fail("Provisionamento recusado: cardinalidade final invalida");
    }
  });

  return { email, userId: OWNER_ID, unitId: unit.id };
}

async function resetExistingOwnerPassword(prisma, owner, password) {
  const { hashPassword } = await import("../src/http/security.ts");
  const passwordHash = hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: EXPECTED_EMAIL },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || user.id !== owner.userId || user.role !== "owner" || !user.isActive) {
      fail("Reset recusado: owner existente fora do estado esperado");
    }

    const accessCount = await tx.userUnitAccess.count({
      where: {
        userId: owner.userId,
        unitId: owner.unitId,
        role: "owner",
        isActive: true,
      },
    });
    if (accessCount !== 1) {
      fail("Reset recusado: vinculo owner fora do estado esperado");
    }

    await tx.user.update({
      where: { id: owner.userId },
      data: { passwordHash },
    });
  });
}

async function expectStatus(app, request, expected, label) {
  const response = await app.inject(request);
  if (!expected.includes(response.statusCode)) {
    fail(`${label}: HTTP ${response.statusCode}`);
  }
  return response;
}

async function validateApi(credentials, password) {
  process.env.DATA_BACKEND = "prisma";
  process.env.AUTH_ENFORCED = "true";
  process.env.HTTP_LOG_ENABLED = "false";

  const { createApp } = await import("../src/http/app.ts");
  const app = createApp();
  await app.ready();

  try {
    const login = await expectStatus(
      app,
      {
        method: "POST",
        url: "/auth/login",
        payload: {
          email: credentials.email,
          password,
          activeUnitId: credentials.unitId,
        },
      },
      [200],
      "login correto",
    );
    const loginBody = login.json();
    if (!loginBody?.accessToken || loginBody?.user?.role !== "owner") {
      fail("login correto: payload invalido");
    }
    if (loginBody.user.activeUnitId !== credentials.unitId) {
      fail("login correto: unidade ativa invalida");
    }

    const authHeaders = { authorization: `Bearer ${loginBody.accessToken}` };
    const me = await expectStatus(app, { method: "GET", url: "/auth/me", headers: authHeaders }, [200], "/auth/me");
    const meBody = me.json();
    if (
      meBody?.user?.email !== credentials.email ||
      meBody?.user?.role !== "owner" ||
      meBody?.user?.activeUnitId !== credentials.unitId ||
      !Array.isArray(meBody?.user?.unitIds) ||
      !meBody.user.unitIds.includes(credentials.unitId)
    ) {
      fail("/auth/me: sessao invalida");
    }

    const start = "2026-07-08T00:00:00.000Z";
    const end = "2026-07-08T23:59:59.999Z";
    const unitQuery = `unitId=${encodeURIComponent(credentials.unitId)}`;
    await expectStatus(
      app,
      { method: "GET", url: `/agenda/range?${unitQuery}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: authHeaders },
      [200],
      "acesso Agenda",
    );
    await expectStatus(
      app,
      { method: "GET", url: `/financial/entries?${unitQuery}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, headers: authHeaders },
      [200],
      "acesso Financeiro",
    );
    await expectStatus(
      app,
      { method: "GET", url: `/settings/business?${unitQuery}`, headers: authHeaders },
      [200],
      "acesso Configuracoes",
    );
    await expectStatus(
      app,
      { method: "GET", url: `/audit/events?${unitQuery}&limit=5`, headers: authHeaders },
      [200],
      "acesso Auditoria",
    );

    const badLogin = await expectStatus(
      app,
      {
        method: "POST",
        url: "/auth/login",
        payload: {
          email: credentials.email,
          password: `${password}${crypto.randomUUID()}`,
          activeUnitId: credentials.unitId,
        },
      },
      [401],
      "senha incorreta",
    );
    const badLoginBody = badLogin.json();
    if (badLoginBody?.accessToken || /token|hash|password|senha/i.test(JSON.stringify(badLoginBody ?? {}))) {
      fail("senha incorreta: resposta insegura");
    }

    await expectStatus(
      app,
      { method: "GET", url: `/agenda/range?${unitQuery}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` },
      [401, 403],
      "rota sem token",
    );
  } finally {
    await app.close();
  }
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
}

async function main() {
  const target = parseTarget();
  const prisma = new PrismaClient();
  const validateExisting = process.argv.includes("--validate-existing");
  const resetExistingPassword = process.argv.includes("--reset-existing-password");

  try {
    const db = await assertDatabaseTarget(prisma, target);
    const unit = validateExisting || resetExistingPassword ? await assertUnitExists(prisma) : await assertInitialState(prisma);
    console.log(`Banco confirmado: ${db.host}/${db.database}`);
    console.log(`Migrations aplicadas: ${db.migrations}`);
    console.log(`Unidade confirmada: ${unit.name}`);
    if (validateExisting || resetExistingPassword) {
      const owner = await assertExistingOwnerState(prisma, unit);
      console.log("Owner existente confirmado: sim");
      console.log(`E-mail: ${maskEmail(owner.email)}`);
      const password = await collectPassword();
      if (resetExistingPassword) {
        await resetExistingOwnerPassword(prisma, owner, password);
        console.log("Senha do owner redefinida: sim");
      }
      await validateApi(owner, password);
      console.log("Validacao API: concluida");
      return;
    }

    console.log("Usuarios existentes: 0");

    const password = await collectPassword();
    const owner = await provisionOwner(prisma, unit, password);
    await validateApi(owner, password);

    console.log("Owner criado: sim");
    console.log(`E-mail: ${maskEmail(owner.email)}`);
    console.log(`Vinculo ativo: ${unit.name}`);
    console.log("Validacao API: concluida");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
