/**
 * Demo seed — popula a unidade unit-01 com dados realistas para apresentação.
 * Idempotente: usa upserts com IDs fixos prefixados com `demo-`. Pode ser
 * rodado várias vezes sem duplicar. Não apaga nada do que já existe.
 *
 *   npm run db:seed:demo
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const UNIT_ID = "unit-01";

// ── helpers ─────────────────────────────────────────────────────────────────
const D = (n: number | string) => new Prisma.Decimal(n);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function setTime(d: Date, h: number, m = 0): Date {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

const NOW = new Date();
const TODAY = startOfDay(NOW);

// ── dados estáticos ────────────────────────────────────────────────────────
const PROFESSIONALS = [
  { id: "pro-01", name: "Geovane Borges" }, // já existente — upsert mantém
  { id: "demo-pro-02", name: "Rafael Andrade" },
  { id: "demo-pro-03", name: "Lucas Ferreira" },
  { id: "demo-pro-04", name: "Matheus Souza" },
];

const SERVICES = [
  { id: "svc-corte", name: "Corte Premium", category: "CORTE", price: 75, cost: 12, duration: 45 },
  { id: "svc-barba", name: "Barba Terapia", category: "BARBA", price: 55, cost: 10, duration: 35 },
  { id: "demo-svc-degrade", name: "Degradê Navalhado", category: "CORTE", price: 85, cost: 14, duration: 50 },
  { id: "demo-svc-sobrancelha", name: "Design de Sobrancelha", category: "SOBRANCELHA", price: 35, cost: 5, duration: 20 },
  { id: "demo-svc-combo", name: "Combo Cabelo + Barba", category: "COMBO", price: 115, cost: 20, duration: 75 },
  { id: "demo-svc-hidratacao", name: "Hidratação Capilar", category: "TRATAMENTO", price: 65, cost: 18, duration: 40 },
];

const PRODUCTS = [
  { id: "prd-pomada", name: "Pomada Matte", category: "Finalização", sale: 59, cost: 24, stock: 22 },
  { id: "prd-oleo-barba", name: "Óleo para Barba", category: "Barba", sale: 39, cost: 14, stock: 18 },
  { id: "demo-prd-shampoo", name: "Shampoo Anticaspa Premium", category: "Cabelo", sale: 49, cost: 19, stock: 30 },
  { id: "demo-prd-cond", name: "Condicionador Reparador", category: "Cabelo", sale: 45, cost: 17, stock: 28 },
  { id: "demo-prd-talco", name: "Talco Pós-Barba", category: "Barba", sale: 29, cost: 9, stock: 40 },
  { id: "demo-prd-lamina", name: "Lâmina Profissional (pacote)", category: "Acessório", sale: 22, cost: 8, stock: 65 },
  { id: "demo-prd-perfume", name: "Perfume Tradicional 100ml", category: "Perfumaria", sale: 89, cost: 38, stock: 12 },
  { id: "demo-prd-kit", name: "Kit Cuidado Completo", category: "Kits", sale: 159, cost: 72, stock: 8 },
];

const CLIENTS = [
  { id: "cli-01", fullName: "João Santos", phone: "11999990001", tags: ["RECURRING"] },
  { id: "cli-02", fullName: "Carlos Silva", phone: "11999990002", tags: ["NEW"] },
  { id: "demo-cli-03", fullName: "Pedro Henrique Lima", phone: "11988770003", email: "pedro.lima@gmail.com", tags: ["RECURRING", "VIP"] },
  { id: "demo-cli-04", fullName: "Bruno Almeida", phone: "11988770004", email: "bruno.almeida@hotmail.com", tags: ["RECURRING"] },
  { id: "demo-cli-05", fullName: "Felipe Carvalho", phone: "11988770005", tags: ["NEW"] },
  { id: "demo-cli-06", fullName: "Diego Mendes", phone: "11988770006", email: "diego.m@gmail.com", tags: ["RECURRING"] },
  { id: "demo-cli-07", fullName: "Rodrigo Oliveira", phone: "11977660007", tags: ["VIP"] },
  { id: "demo-cli-08", fullName: "Gustavo Pereira", phone: "11977660008", email: "gustavo.p@outlook.com", tags: ["RECURRING"] },
  { id: "demo-cli-09", fullName: "Thiago Martins", phone: "11977660009", tags: ["NEW"] },
  { id: "demo-cli-10", fullName: "Vinícius Rocha", phone: "11966550010", email: "vinicius.rocha@gmail.com", tags: ["RECURRING"] },
  { id: "demo-cli-11", fullName: "André Nascimento", phone: "11966550011", tags: ["VIP", "RECURRING"] },
  { id: "demo-cli-12", fullName: "Leonardo Cardoso", phone: "11966550012", email: "leocardoso@gmail.com", tags: ["RECURRING"] },
  { id: "demo-cli-13", fullName: "Ricardo Barbosa", phone: "11955440013", tags: ["NEW"] },
  { id: "demo-cli-14", fullName: "Marcelo Ribeiro", phone: "11955440014", email: "marcelo.r@gmail.com", tags: ["RECURRING"] },
  { id: "demo-cli-15", fullName: "Caio Monteiro", phone: "11955440015", tags: ["RECURRING"] },
];

// ── seed ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("→ Garantindo unidade unit-01...");
  await prisma.unit.upsert({
    where: { id: UNIT_ID },
    update: {},
    create: { id: UNIT_ID, name: "Barbearia Premium - Unidade Centro", timezone: "America/Sao_Paulo" },
  });

  console.log("→ Profissionais...");
  for (const p of PROFESSIONALS) {
    await prisma.professional.upsert({
      where: { id: p.id },
      update: { name: p.name, businessId: UNIT_ID, active: true },
      create: { id: p.id, name: p.name, businessId: UNIT_ID, active: true },
    });
    await prisma.commissionRule.upsert({
      where: { id: `rule-${p.id}-service` },
      update: { percentage: D(0.4) },
      create: { id: `rule-${p.id}-service`, professionalId: p.id, appliesTo: "SERVICE", percentage: D(0.4) },
    });
    await prisma.commissionRule.upsert({
      where: { id: `rule-${p.id}-product` },
      update: { percentage: D(0.1) },
      create: { id: `rule-${p.id}-product`, professionalId: p.id, appliesTo: "PRODUCT", percentage: D(0.1) },
    });
  }

  console.log("→ Serviços...");
  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {
        businessId: UNIT_ID, name: s.name, category: s.category,
        price: D(s.price), costEstimate: D(s.cost), durationMin: s.duration, active: true,
      },
      create: {
        id: s.id, businessId: UNIT_ID, name: s.name, category: s.category,
        price: D(s.price), costEstimate: D(s.cost), durationMin: s.duration,
        defaultCommissionRate: D(0), active: true,
      },
    });
  }

  console.log("→ Vínculos serviço × profissional...");
  for (const s of SERVICES) {
    for (const p of PROFESSIONALS) {
      const id = `sp-${s.id}-${p.id}`;
      await prisma.serviceProfessional.upsert({
        where: { serviceId_professionalId: { serviceId: s.id, professionalId: p.id } },
        update: {},
        create: { id, serviceId: s.id, professionalId: p.id },
      });
    }
  }

  console.log("→ Produtos...");
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        businessId: UNIT_ID, name: p.name, category: p.category,
        salePrice: D(p.sale), costPrice: D(p.cost), stockQty: p.stock, minStockAlert: 4, active: true,
      },
      create: {
        id: p.id, businessId: UNIT_ID, name: p.name, category: p.category,
        salePrice: D(p.sale), costPrice: D(p.cost), stockQty: p.stock, minStockAlert: 4, active: true,
      },
    });
  }

  console.log("→ Clientes...");
  for (const c of CLIENTS) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: {
        businessId: UNIT_ID, fullName: c.fullName, phone: c.phone,
        email: (c as any).email ?? null, tags: c.tags,
      },
      create: {
        id: c.id, businessId: UNIT_ID, fullName: c.fullName, phone: c.phone,
        email: (c as any).email ?? null, tags: c.tags,
      },
    });
  }

  console.log("→ Métodos de pagamento...");
  const pms = [
    { id: "demo-pm-pix", name: "PIX", isDefault: true },
    { id: "demo-pm-cartao", name: "Cartão de Crédito", isDefault: false },
    { id: "demo-pm-debito", name: "Cartão de Débito", isDefault: false },
    { id: "demo-pm-dinheiro", name: "Dinheiro", isDefault: false },
  ];
  for (const pm of pms) {
    await prisma.paymentMethod.upsert({
      where: { id: pm.id },
      update: { unitId: UNIT_ID, name: pm.name, isActive: true, isDefault: pm.isDefault },
      create: { id: pm.id, unitId: UNIT_ID, name: pm.name, isActive: true, isDefault: pm.isDefault },
    });
  }

  console.log("→ Configurações da unidade...");
  await prisma.businessSettings.upsert({
    where: { unitId: UNIT_ID },
    update: {},
    create: {
      id: `bs-${UNIT_ID}`, unitId: UNIT_ID,
      businessName: "Liddo Barber - Unidade Centro", segment: "BARBEARIA",
      phone: "1133220011", email: "contato@liddobarber.com",
      address: "Rua Augusta, 1500", city: "São Paulo", state: "SP",
    },
  });

  console.log("→ Horários de funcionamento (seg-sáb)...");
  for (let dow = 0; dow < 7; dow++) {
    await prisma.businessHour.upsert({
      where: { unitId_dayOfWeek: { unitId: UNIT_ID, dayOfWeek: dow } },
      update: {},
      create: {
        id: `bh-${UNIT_ID}-${dow}`, unitId: UNIT_ID, dayOfWeek: dow,
        opensAt: dow === 0 ? null : "09:00",
        closesAt: dow === 0 ? null : (dow === 6 ? "18:00" : "20:00"),
        isClosed: dow === 0,
      },
    });
  }

  console.log("→ Meta mensal...");
  await prisma.monthlyGoal.upsert({
    where: { businessId_year_month: { businessId: UNIT_ID, year: NOW.getFullYear(), month: NOW.getMonth() + 1 } },
    update: { revenueTarget: D(18000), appointmentsTarget: 220 },
    create: {
      id: `goal-${UNIT_ID}-${NOW.getFullYear()}-${NOW.getMonth() + 1}`,
      businessId: UNIT_ID, year: NOW.getFullYear(), month: NOW.getMonth() + 1,
      revenueTarget: D(18000), appointmentsTarget: 220, averageTicketTarget: D(82),
    },
  });

  console.log("→ Agendamentos (últimos 30 + próximos 14 dias)...");
  // Schedule: passado 30 dias com mix de COMPLETED/CANCELLED/NO_SHOW; futuro com SCHEDULED/CONFIRMED.
  const proIds = PROFESSIONALS.map((p) => p.id);
  const cliIds = CLIENTS.map((c) => c.id);
  const svcIds = SERVICES.map((s) => s.id);
  const paymentNames = ["PIX", "CARTAO", "DINHEIRO"];

  let apptCounter = 0;
  const completedAppts: Array<{
    id: string; clientId: string; professionalId: string; serviceId: string;
    price: number; cost: number; commissionRate: number; endsAt: Date; paymentMethod: string;
  }> = [];

  for (let offset = -30; offset <= 14; offset++) {
    const day = addDays(TODAY, offset);
    const dow = day.getDay();
    if (dow === 0) continue; // domingo fechado
    // 2-4 agendamentos por dia, variando por dia da semana
    const perDay = dow === 6 ? 5 : dow === 5 ? 4 : 2 + (offset % 2 === 0 ? 1 : 0);
    for (let i = 0; i < perDay; i++) {
      apptCounter++;
      const hour = 9 + ((apptCounter * 2) % 10);
      const minute = (apptCounter % 2) * 30;
      const startsAt = setTime(day, hour, minute);
      const proIdx = apptCounter % proIds.length;
      const cliIdx = (apptCounter * 3) % cliIds.length;
      const svcIdx = (apptCounter * 5) % svcIds.length;
      const svc = SERVICES[svcIdx];
      const endsAt = new Date(startsAt.getTime() + svc.duration * 60 * 1000);
      const id = `demo-appt-${String(apptCounter).padStart(3, "0")}`;
      const paymentMethod = paymentNames[apptCounter % paymentNames.length];

      let status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
      if (offset < -1) {
        const r = apptCounter % 10;
        status = r < 8 ? "COMPLETED" : r === 8 ? "CANCELLED" : "NO_SHOW";
      } else if (offset === -1 || offset === 0) {
        status = apptCounter % 3 === 0 ? "CONFIRMED" : "COMPLETED";
      } else {
        status = apptCounter % 4 === 0 ? "CONFIRMED" : "SCHEDULED";
      }

      await prisma.appointment.upsert({
        where: { id },
        update: {
          unitId: UNIT_ID, clientId: cliIds[cliIdx], professionalId: proIds[proIdx],
          serviceId: svc.id, startsAt, endsAt, status,
        },
        create: {
          id, unitId: UNIT_ID, clientId: cliIds[cliIdx], professionalId: proIds[proIdx],
          serviceId: svc.id, startsAt, endsAt, status,
        },
      });

      if (status === "COMPLETED") {
        completedAppts.push({
          id, clientId: cliIds[cliIdx], professionalId: proIds[proIdx], serviceId: svc.id,
          price: svc.price, cost: svc.cost, commissionRate: 0.4, endsAt, paymentMethod,
        });
      }
    }
  }
  console.log(`   ${apptCounter} agendamentos gerados, ${completedAppts.length} concluídos.`);

  console.log("→ Financeiro — receitas de serviços concluídos...");
  for (const a of completedAppts) {
    await prisma.financialEntry.upsert({
      where: { unitId_referenceType_referenceId_source: {
        unitId: UNIT_ID, referenceType: "APPOINTMENT", referenceId: a.id, source: "SERVICE",
      } },
      update: { amount: D(a.price), occurredAt: a.endsAt, paymentMethod: a.paymentMethod },
      create: {
        id: `demo-fin-svc-${a.id}`,
        unitId: UNIT_ID, kind: "INCOME", source: "SERVICE", category: "SERVICO",
        paymentMethod: a.paymentMethod, amount: D(a.price), occurredAt: a.endsAt,
        referenceType: "APPOINTMENT", referenceId: a.id,
        professionalId: a.professionalId, customerId: a.clientId,
        description: `Serviço concluído — ${SERVICES.find(s => s.id === a.serviceId)?.name}`,
      },
    });
    await prisma.commissionEntry.upsert({
      where: { unitId_source_appointmentId: { unitId: UNIT_ID, source: "SERVICE", appointmentId: a.id } },
      update: { commissionAmount: D(a.price * a.commissionRate) },
      create: {
        id: `demo-comm-svc-${a.id}`,
        professionalId: a.professionalId, unitId: UNIT_ID, appointmentId: a.id,
        source: "SERVICE", baseAmount: D(a.price),
        commissionRate: D(a.commissionRate), commissionAmount: D(a.price * a.commissionRate),
        status: "PENDING", occurredAt: a.endsAt, ruleId: `rule-${a.professionalId}-service`,
      },
    });
  }

  console.log("→ Vendas de produtos espalhadas...");
  const SALE_PROFILES = [
    { items: [{ pid: "prd-pomada", qty: 1 }] },
    { items: [{ pid: "demo-prd-shampoo", qty: 1 }, { pid: "demo-prd-cond", qty: 1 }] },
    { items: [{ pid: "prd-oleo-barba", qty: 1 }, { pid: "demo-prd-talco", qty: 1 }] },
    { items: [{ pid: "demo-prd-kit", qty: 1 }] },
    { items: [{ pid: "demo-prd-perfume", qty: 1 }] },
    { items: [{ pid: "demo-prd-lamina", qty: 2 }] },
    { items: [{ pid: "prd-pomada", qty: 1 }, { pid: "demo-prd-talco", qty: 1 }] },
    { items: [{ pid: "demo-prd-shampoo", qty: 2 }] },
    { items: [{ pid: "prd-oleo-barba", qty: 1 }] },
    { items: [{ pid: "demo-prd-cond", qty: 1 }, { pid: "demo-prd-shampoo", qty: 1 }] },
    { items: [{ pid: "demo-prd-perfume", qty: 1 }, { pid: "prd-pomada", qty: 1 }] },
    { items: [{ pid: "demo-prd-kit", qty: 1 }] },
  ];

  for (let i = 0; i < SALE_PROFILES.length; i++) {
    const profile = SALE_PROFILES[i];
    const id = `demo-sale-${String(i + 1).padStart(3, "0")}`;
    const soldAt = setTime(addDays(TODAY, -(i * 2 + 1)), 14 + (i % 5), 0);
    const clientId = cliIds[(i * 4) % cliIds.length];
    const professionalId = proIds[i % proIds.length];
    const paymentMethod = paymentNames[i % paymentNames.length];

    let gross = 0;
    const itemsData = profile.items.map((it, idx) => {
      const prod = PRODUCTS.find((p) => p.id === it.pid)!;
      gross += prod.sale * it.qty;
      return {
        id: `${id}-item-${idx + 1}`,
        productSaleId: id,
        productId: it.pid,
        quantity: it.qty,
        unitPrice: D(prod.sale),
        unitCost: D(prod.cost),
      };
    });

    await prisma.productSale.upsert({
      where: { id },
      update: { unitId: UNIT_ID, clientId, professionalId, grossAmount: D(gross), soldAt },
      create: { id, unitId: UNIT_ID, clientId, professionalId, grossAmount: D(gross), soldAt },
    });

    for (const itemData of itemsData) {
      await prisma.productSaleItem.upsert({
        where: { id: itemData.id },
        update: { quantity: itemData.quantity, unitPrice: itemData.unitPrice, unitCost: itemData.unitCost },
        create: itemData,
      });
    }

    await prisma.financialEntry.upsert({
      where: { unitId_referenceType_referenceId_source: {
        unitId: UNIT_ID, referenceType: "PRODUCT_SALE", referenceId: id, source: "PRODUCT",
      } },
      update: { amount: D(gross), occurredAt: soldAt },
      create: {
        id: `demo-fin-${id}`,
        unitId: UNIT_ID, kind: "INCOME", source: "PRODUCT", category: "PRODUTO",
        paymentMethod, amount: D(gross), occurredAt: soldAt,
        referenceType: "PRODUCT_SALE", referenceId: id,
        professionalId, customerId: clientId, description: "Venda de produto no balcão",
      },
    });

    await prisma.commissionEntry.upsert({
      where: { unitId_source_productSaleId: { unitId: UNIT_ID, source: "PRODUCT", productSaleId: id } },
      update: { commissionAmount: D(gross * 0.1) },
      create: {
        id: `demo-comm-prd-${id}`,
        professionalId, unitId: UNIT_ID, productSaleId: id,
        source: "PRODUCT", baseAmount: D(gross),
        commissionRate: D(0.1), commissionAmount: D(gross * 0.1),
        status: "PENDING", occurredAt: soldAt, ruleId: `rule-${professionalId}-product`,
      },
    });
  }

  console.log("→ Despesas operacionais...");
  const expenses = [
    { id: "demo-exp-aluguel", cat: "ALUGUEL", amount: 3200, dayOffset: -28, pm: "PIX", desc: "Aluguel da unidade — mês corrente" },
    { id: "demo-exp-energia", cat: "OPERACIONAL", amount: 420, dayOffset: -25, pm: "PIX", desc: "Conta de energia elétrica" },
    { id: "demo-exp-agua", cat: "OPERACIONAL", amount: 180, dayOffset: -24, pm: "PIX", desc: "Conta de água" },
    { id: "demo-exp-internet", cat: "OPERACIONAL", amount: 220, dayOffset: -22, pm: "CARTAO", desc: "Internet fibra 600MB" },
    { id: "demo-exp-fornecedor-1", cat: "FORNECEDOR", amount: 850, dayOffset: -20, pm: "PIX", desc: "Reposição de pomadas e óleos" },
    { id: "demo-exp-fornecedor-2", cat: "FORNECEDOR", amount: 1240, dayOffset: -12, pm: "CARTAO", desc: "Pedido shampoos + condicionadores" },
    { id: "demo-exp-marketing", cat: "MARKETING", amount: 600, dayOffset: -18, pm: "CARTAO", desc: "Tráfego pago Instagram" },
    { id: "demo-exp-limpeza", cat: "OPERACIONAL", amount: 320, dayOffset: -15, pm: "DINHEIRO", desc: "Materiais de limpeza e higiene" },
    { id: "demo-exp-manutencao", cat: "OPERACIONAL", amount: 480, dayOffset: -8, pm: "PIX", desc: "Manutenção de cadeiras hidráulicas" },
    { id: "demo-exp-salario", cat: "SALARIO", amount: 4800, dayOffset: -5, pm: "PIX", desc: "Folha de pagamento equipe" },
    { id: "demo-exp-software", cat: "OPERACIONAL", amount: 199, dayOffset: -3, pm: "CARTAO", desc: "Mensalidade software de gestão" },
  ];
  for (const e of expenses) {
    await prisma.financialEntry.upsert({
      where: { id: e.id },
      update: { amount: D(e.amount), occurredAt: setTime(addDays(TODAY, e.dayOffset), 10, 0) },
      create: {
        id: e.id,
        unitId: UNIT_ID, kind: "EXPENSE", source: null, category: e.cat,
        paymentMethod: e.pm, amount: D(e.amount),
        occurredAt: setTime(addDays(TODAY, e.dayOffset), 10, 0),
        referenceType: "MANUAL", referenceId: null,
        description: e.desc, notes: "Lançamento demo",
      },
    });
  }

  console.log("→ Movimentações de estoque (entradas de reposição)...");
  const stockMovements = [
    { id: "demo-stk-1", pid: "prd-pomada", qty: 20, off: -20 },
    { id: "demo-stk-2", pid: "prd-oleo-barba", qty: 15, off: -20 },
    { id: "demo-stk-3", pid: "demo-prd-shampoo", qty: 30, off: -12 },
    { id: "demo-stk-4", pid: "demo-prd-cond", qty: 30, off: -12 },
    { id: "demo-stk-5", pid: "demo-prd-talco", qty: 40, off: -18 },
    { id: "demo-stk-6", pid: "demo-prd-lamina", qty: 80, off: -10 },
  ];
  for (const m of stockMovements) {
    await prisma.stockMovement.upsert({
      where: { unitId_productId_referenceType_referenceId_movementType: {
        unitId: UNIT_ID, productId: m.pid, referenceType: "PURCHASE", referenceId: m.id, movementType: "IN",
      } },
      update: { quantity: m.qty },
      create: {
        id: m.id, unitId: UNIT_ID, productId: m.pid,
        movementType: "IN", quantity: m.qty,
        occurredAt: setTime(addDays(TODAY, m.off), 10, 0),
        referenceType: "PURCHASE", referenceId: m.id,
      },
    });
  }

  console.log("\n✓ Demo seed concluído com sucesso.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
