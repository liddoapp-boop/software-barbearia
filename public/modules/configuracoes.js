import { renderPanelMessage } from "./feedback.js";

const DAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function checked(value) {
  return value ? "checked" : "";
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function sectionCard(title, subtitle, content) {
  return `
    <section class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div class="mb-3">
        <h3 class="text-base font-bold text-slate-900">${escapeHtml(title)}</h3>
        <p class="text-xs text-slate-600 mt-1">${escapeHtml(subtitle)}</p>
      </div>
      ${content}
    </section>
  `;
}

function renderBusinessSection(business = {}) {
  const segment = String(business.segment || "barbearia");
  return sectionCard(
    "Dados da empresa",
    "Informacoes institucionais exibidas no sistema e usadas na operacao.",
    `
      <form id="settingsBusinessForm" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="text-sm font-semibold text-slate-700 md:col-span-2">Nome da empresa
          <input name="businessName" value="${escapeHtml(business.businessName || "")}" required class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Segmento
          <select name="segment" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            ${option("barbearia", "Barbearia", segment === "barbearia")}
            ${option("estetica", "Estetica", segment === "estetica")}
            ${option("salao", "Salao", segment === "salao")}
            ${option("pet_shop", "Pet Shop", segment === "pet_shop")}
            ${option("clinica", "Clinica", segment === "clinica")}
            ${option("outro", "Outro", segment === "outro")}
          </select>
        </label>
        <label class="text-sm font-semibold text-slate-700">Telefone
          <input name="phone" value="${escapeHtml(business.phone || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">E-mail
          <input name="email" type="email" value="${escapeHtml(business.email || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">CNPJ (opcional)
          <input name="document" value="${escapeHtml(business.document || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700 md:col-span-2">Endereco
          <input name="address" value="${escapeHtml(business.address || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Cidade
          <input name="city" value="${escapeHtml(business.city || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Estado
          <input name="state" value="${escapeHtml(business.state || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <div class="md:col-span-2 flex justify-end">
          <button type="submit" class="min-h-[44px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-semibold">Salvar dados da empresa</button>
        </div>
      </form>
    `,
  );
}

function renderHoursSection(hours = []) {
  const rows = DAY_LABELS.map((label, dayOfWeek) => {
    const row = hours.find((item) => Number(item.dayOfWeek) === dayOfWeek) || {
      dayOfWeek,
      isClosed: dayOfWeek === 0,
    };
    return `
      <article class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold text-slate-900">${label}</div>
          <label class="inline-flex items-center gap-2 text-xs text-slate-700 font-semibold">
            <input type="checkbox" name="closed_${dayOfWeek}" ${checked(row.isClosed)} />
            Fechado
          </label>
        </div>
        <input type="hidden" name="day_${dayOfWeek}" value="${dayOfWeek}" />
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <label class="text-xs font-semibold text-slate-600">Abertura
            <input type="time" name="opensAt_${dayOfWeek}" value="${escapeHtml(row.opensAt || "")}" class="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          </label>
          <label class="text-xs font-semibold text-slate-600">Fechamento
            <input type="time" name="closesAt_${dayOfWeek}" value="${escapeHtml(row.closesAt || "")}" class="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          </label>
          <label class="text-xs font-semibold text-slate-600">Inicio pausa
            <input type="time" name="breakStart_${dayOfWeek}" value="${escapeHtml(row.breakStart || "")}" class="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          </label>
          <label class="text-xs font-semibold text-slate-600">Fim pausa
            <input type="time" name="breakEnd_${dayOfWeek}" value="${escapeHtml(row.breakEnd || "")}" class="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          </label>
        </div>
      </article>
    `;
  }).join("");

  return sectionCard(
    "Horarios de funcionamento",
    "Esses horarios alimentam agenda e disponibilidade da operacao.",
    `
      <form id="settingsHoursForm" class="space-y-2">
        ${rows}
        <div class="flex justify-end pt-2">
          <button type="submit" class="min-h-[44px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-semibold">Salvar horarios</button>
        </div>
      </form>
    `,
  );
}

function renderTeamSection(teamMembers = []) {
  const list = teamMembers.length
    ? teamMembers
        .map(
          (item) => `
            <article class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold text-slate-900">${escapeHtml(item.name)}</div>
                  <div class="text-xs text-slate-500 mt-1">${escapeHtml(item.role)} - ${escapeHtml(item.accessProfile)} - ${item.isActive ? "Ativo" : "Inativo"}</div>
                </div>
                <button type="button" data-settings-action="toggle-team-member" data-member-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="min-h-[38px] rounded-lg border ${item.isActive ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"} px-3 py-1 text-xs font-semibold">${item.isActive ? "Inativar" : "Ativar"}</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Nenhum membro cadastrado.</div>`;

  return sectionCard(
    "Equipe e permissoes",
    "Gerencie quem participa da operacao e o perfil de acesso no sistema.",
    `
      <div class="space-y-2">${list}</div>
      <form id="settingsTeamForm" class="grid grid-cols-1 md:grid-cols-5 gap-2 mt-3">
        <input name="name" required placeholder="Nome" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2" />
        <select name="role" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          ${option("OWNER", "Dono", false)}
          ${option("MANAGER", "Gerente", false)}
          ${option("PROFESSIONAL", "Profissional", true)}
          ${option("RECEPTION", "Recepcao", false)}
        </select>
        <select name="accessProfile" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          ${option("owner", "owner", false)}
          ${option("gerente", "gerente", false)}
          ${option("profissional", "profissional", true)}
          ${option("recepcao", "recepcao", false)}
        </select>
        <button type="submit" class="min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 text-sm font-semibold">Adicionar membro</button>
      </form>
    `,
  );
}

function renderCommissionsSection(commissionRules = [], professionals = [], services = [], business = {}) {
  const list = commissionRules.length
    ? commissionRules
        .map(
          (item) => `
            <article class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold text-slate-900">${item.type === "PERCENTAGE" ? `${Number(item.value || 0).toFixed(2)}%` : `R$ ${Number(item.value || 0).toFixed(2)}`}</div>
                  <div class="text-xs text-slate-500 mt-1">Profissional: ${escapeHtml(item.professionalName || "Todos")} - Servico: ${escapeHtml(item.serviceName || "Todos")}</div>
                </div>
                <button type="button" data-settings-action="toggle-commission-rule" data-rule-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="min-h-[38px] rounded-lg border ${item.isActive ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"} px-3 py-1 text-xs font-semibold">${item.isActive ? "Inativar" : "Ativar"}</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Nenhuma regra de comissao cadastrada.</div>`;

  return sectionCard(
    "Regras de comissao",
    "Defina regra padrao da casa e regras por profissional/servico.",
    `
      <form id="settingsHouseCommissionForm" class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <label class="text-xs font-semibold text-slate-600">Tipo padrao
          <select name="houseCommissionType" class="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm">
            ${option("PERCENTAGE", "Percentual", business.houseCommissionType === "PERCENTAGE")}
            ${option("FIXED", "Valor fixo", business.houseCommissionType === "FIXED")}
          </select>
        </label>
        <label class="text-xs font-semibold text-slate-600">Valor padrao
          <input name="houseCommissionValue" type="number" min="0" step="0.01" value="${escapeHtml(Number(business.houseCommissionValue || 0).toString())}" class="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" />
        </label>
        <div class="flex items-end">
          <button type="submit" class="min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-1 text-sm font-semibold">Salvar regra da casa</button>
        </div>
      </form>
      <div class="space-y-2">${list}</div>
      <form id="settingsCommissionForm" class="grid grid-cols-1 md:grid-cols-5 gap-2 mt-3">
        <select name="professionalId" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos profissionais</option>
          ${professionals.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select name="serviceId" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos servicos</option>
          ${services.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select name="type" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          ${option("PERCENTAGE", "Percentual", true)}
          ${option("FIXED", "Valor fixo", false)}
        </select>
        <input name="value" type="number" min="0" step="0.01" required placeholder="Valor" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        <button type="submit" class="min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 text-sm font-semibold">Criar regra</button>
      </form>
    `,
  );
}

function renderPaymentsSection(paymentMethods = []) {
  const list = paymentMethods.length
    ? paymentMethods
        .map(
          (item) => `
            <article class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold text-slate-900">${escapeHtml(item.name)}</div>
                  <div class="text-xs text-slate-500 mt-1">${item.isDefault ? "Metodo padrao" : "Metodo secundario"}</div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button type="button" data-settings-action="set-payment-default" data-payment-id="${escapeHtml(item.id)}" class="min-h-[38px] rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Definir padrao</button>
                  <button type="button" data-settings-action="toggle-payment-active" data-payment-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="min-h-[38px] rounded-lg border ${item.isActive ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"} px-3 py-1 text-xs font-semibold">${item.isActive ? "Desativar" : "Ativar"}</button>
                </div>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Nenhum metodo de pagamento configurado.</div>`;

  return sectionCard(
    "Metodos de pagamento",
    "Defina quais metodos a empresa aceita e qual e o metodo padrao.",
    `
      <div class="space-y-2">${list}</div>
      <form id="settingsPaymentCreateForm" class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mt-3">
        <input name="name" required placeholder="Novo metodo (ex.: Transferencia)" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        <button type="submit" class="min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 text-sm font-semibold">Adicionar metodo</button>
      </form>
    `,
  );
}

function renderOperationsSection(business = {}) {
  return sectionCard(
    "Preferencias operacionais",
    "Regras que alimentam agenda, clientes e automacoes.",
    `
      <form id="settingsOperationsForm" class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label class="text-sm font-semibold text-slate-700">Duracao padrao (min)
          <input type="number" name="defaultAppointmentDuration" min="1" step="1" value="${escapeHtml(Number(business.defaultAppointmentDuration || 45).toString())}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Antecedencia minima (min)
          <input type="number" name="minimumAdvanceMinutes" min="0" step="1" value="${escapeHtml(Number(business.minimumAdvanceMinutes || 30).toString())}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Tempo entre atendimentos (min)
          <input type="number" name="bufferBetweenAppointmentsMinutes" min="0" step="1" value="${escapeHtml(Number(business.bufferBetweenAppointmentsMinutes || 10).toString())}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Lembrete antes do horario (min)
          <input type="number" name="reminderLeadMinutes" min="0" step="1" value="${escapeHtml(Number(business.reminderLeadMinutes || 60).toString())}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Cliente em risco apos X dias
          <input type="number" name="atRiskCustomerDays" min="1" step="1" value="${escapeHtml(Number(business.atRiskCustomerDays || 30).toString())}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Cliente inativo apos X dias
          <input type="number" name="inactiveCustomerDays" min="1" step="1" value="${escapeHtml(Number(business.inactiveCustomerDays || 60).toString())}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" name="allowWalkIns" ${checked(business.allowWalkIns)} /> Permitir encaixes
        </label>
        <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" name="allowOutOfHoursAppointments" ${checked(business.allowOutOfHoursAppointments)} /> Permitir fora do horario
        </label>
        <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" name="sendAppointmentReminders" ${checked(business.sendAppointmentReminders)} /> Enviar lembretes
        </label>
        <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-3">
          <input type="checkbox" name="allowOverbooking" ${checked(business.allowOverbooking)} /> Permitir sobreposicao de agendamentos (encaixe excepcional)
        </label>
        <div class="md:col-span-3 flex justify-end">
          <button type="submit" class="min-h-[44px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-semibold">Salvar preferencias</button>
        </div>
      </form>
    `,
  );
}

function renderAppearanceSection(business = {}) {
  return sectionCard(
    "Aparencia do sistema",
    "Ajustes visuais basicos da empresa sem impacto no fluxo operacional.",
    `
      <form id="settingsAppearanceForm" class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label class="text-sm font-semibold text-slate-700 md:col-span-2">Nome exibido
          <input name="displayName" value="${escapeHtml(business.displayName || "")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Cor principal
          <input name="primaryColor" value="${escapeHtml(business.primaryColor || "#0f172a")}" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Tema
          <select name="themeMode" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            ${option("light", "Claro", business.themeMode === "light")}
            ${option("dark", "Escuro", business.themeMode === "dark")}
            ${option("system", "Sistema", business.themeMode === "system")}
          </select>
        </label>
        <div class="md:col-span-4 flex justify-end">
          <button type="submit" class="min-h-[44px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-4 py-2 text-sm font-semibold">Salvar aparencia</button>
        </div>
      </form>
    `,
  );
}

function renderSecuritySection(security = {}) {
  const session = security.currentSession || {};
  return sectionCard(
    "Area de seguranca",
    "Sessao atual e orientacoes de permissao para o dono da operacao.",
    `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <article class="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <div class="text-xs uppercase tracking-wide text-slate-500">Usuario</div>
          <div class="mt-1 font-semibold text-slate-900">${escapeHtml(session.email || "-")}</div>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <div class="text-xs uppercase tracking-wide text-slate-500">Perfil</div>
          <div class="mt-1 font-semibold text-slate-900">${escapeHtml(session.role || "-")}</div>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <div class="text-xs uppercase tracking-wide text-slate-500">Unidade ativa</div>
          <div class="mt-1 font-semibold text-slate-900">${escapeHtml(session.activeUnitId || "-")}</div>
        </article>
      </div>
      <div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        ${escapeHtml(security.note || "Alteracao de senha sera habilitada em uma proxima entrega de identidade.")}
      </div>
    `,
  );
}

export function renderSettingsLoading(elements) {
  if (elements.root) renderPanelMessage(elements.root, "Carregando configuracoes...");
}

export function renderSettingsError(elements, message = "Falha ao carregar configuracoes.") {
  if (elements.root) renderPanelMessage(elements.root, message, "error");
}

export function renderSettingsData(elements, payload = {}, context = {}) {
  const business = payload.business || {};
  const businessHours = Array.isArray(payload.businessHours) ? payload.businessHours : [];
  const teamMembers = Array.isArray(payload.teamMembers) ? payload.teamMembers : [];
  const commissionRules = Array.isArray(payload.commissionRules) ? payload.commissionRules : [];
  const paymentMethods = Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [];
  const security = payload.security || {};
  const professionals = Array.isArray(context.professionals) ? context.professionals : [];
  const services = Array.isArray(context.services) ? context.services : [];

  if (!elements.root) return;
  elements.root.innerHTML = [
    renderBusinessSection(business),
    renderHoursSection(businessHours),
    renderTeamSection(teamMembers),
    renderCommissionsSection(commissionRules, professionals, services, business),
    renderPaymentsSection(paymentMethods),
    renderOperationsSection(business),
    renderAppearanceSection(business),
    renderSecuritySection(security),
  ].join("");
}
