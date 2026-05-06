import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPageHeader,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
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

const SETTINGS_SECTIONS = [
  { id: "business", title: "Empresa", description: "Dados institucionais e identidade publica da operacao." },
  { id: "hours", title: "Horarios", description: "Funcionamento semanal usado pela agenda." },
  { id: "payments", title: "Pagamentos", description: "Metodos aceitos, status e padrao de recebimento." },
  { id: "team", title: "Equipe", description: "Pessoas, funcoes e perfis de acesso cadastrados." },
  { id: "commissions", title: "Comissoes", description: "Regra da casa e excecoes por profissional ou servico." },
  { id: "schedule", title: "Agenda", description: "Preferencias operacionais de duracao, antecedencia e encaixes." },
  { id: "security", title: "Seguranca", description: "Sessao atual e limites suportados nesta versao." },
  { id: "appearance", title: "Aparencia", description: "Nome exibido, cor principal e modo visual ja existentes." },
  { id: "operations", title: "Parametros", description: "Clientes em risco, inativos, lembretes e sobreposicoes." },
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return toNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function segmentLabel(value = "barbearia") {
  const labels = {
    barbearia: "Barbearia",
    estetica: "Estetica",
    salao: "Salao",
    pet_shop: "Pet shop",
    clinica: "Clinica",
    outro: "Outro segmento",
  };
  return labels[value] || "Outro segmento";
}

function roleLabel(value = "") {
  const labels = {
    OWNER: "Dono",
    MANAGER: "Gerente",
    PROFESSIONAL: "Profissional",
    RECEPTION: "Recepcao",
  };
  return labels[value] || value || "Equipe";
}

function accessLabel(value = "") {
  const labels = {
    owner: "Administracao",
    gerente: "Gestao",
    profissional: "Atendimento",
    recepcao: "Recepcao",
  };
  return labels[value] || value || "Perfil nao informado";
}

function commissionTypeLabel(type = "") {
  return type === "FIXED" ? "Comissao fixa" : "Comissao percentual";
}

function commissionValueLabel(item = {}) {
  return item.type === "FIXED" ? money(item.value) : `${toNumber(item.value).toFixed(2)}%`;
}

function ruleScopeLabel(item = {}) {
  if (item.professionalName && item.serviceName) return "Regra por profissional e servico";
  if (item.professionalName) return "Regra por profissional";
  if (item.serviceName) return "Regra por servico";
  return "Regra geral";
}

function hourLabel(item = {}) {
  if (item.isClosed) return "Fechado";
  const range = `${item.opensAt || "--:--"} as ${item.closesAt || "--:--"}`;
  if (item.breakStart && item.breakEnd) return `${range}, pausa ${item.breakStart} as ${item.breakEnd}`;
  return range;
}

function settingsSectionCard({ id, title, description, status = "", facts = [], warning = "" }) {
  return `
    <article class="settings-hub-card">
      <div class="settings-hub-card-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        ${status ? renderStatusChip(status) : ""}
      </div>
      <dl class="settings-hub-facts">
        ${facts
          .filter((item) => item?.value !== undefined && item?.value !== null && item?.value !== "")
          .slice(0, 3)
          .map(
            (item) => `
              <div>
                <dt>${escapeHtml(item.label)}</dt>
                <dd>${escapeHtml(item.value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
      ${warning ? `<p class="settings-hub-warning">${escapeHtml(warning)}</p>` : ""}
      <button type="button" class="ux-btn ux-btn-muted" data-settings-action="open-section" data-settings-section="${escapeHtml(id)}">Editar e revisar</button>
    </article>
  `;
}

function renderHub(payload = {}) {
  const business = payload.business || {};
  const hours = Array.isArray(payload.businessHours) ? payload.businessHours : [];
  const teamMembers = Array.isArray(payload.teamMembers) ? payload.teamMembers : [];
  const commissionRules = Array.isArray(payload.commissionRules) ? payload.commissionRules : [];
  const paymentMethods = Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [];
  const security = payload.security || {};
  const activePayments = paymentMethods.filter((item) => item.isActive).length;
  const defaultPayment = paymentMethods.find((item) => item.isDefault);
  const activeTeam = teamMembers.filter((item) => item.isActive).length;
  const activeRules = commissionRules.filter((item) => item.isActive).length;
  const openDays = hours.filter((item) => !item.isClosed).length;
  const sectionMap = {
    business: {
      status: business.businessName ? "ACTIVE" : "WARNING",
      facts: [
        { label: "Nome", value: business.businessName || "Nome nao configurado" },
        { label: "Segmento", value: segmentLabel(business.segment) },
        { label: "Contato", value: business.phone || business.email || "Contato nao informado" },
      ],
      warning: !business.email ? "E-mail da empresa ainda nao foi informado." : "",
    },
    hours: {
      status: openDays ? "ACTIVE" : "WARNING",
      facts: [
        { label: "Dias abertos", value: `${openDays} dia(s) por semana` },
        { label: "Domingo", value: hourLabel(hours.find((item) => Number(item.dayOfWeek) === 0) || { isClosed: true }) },
        { label: "Segunda", value: hourLabel(hours.find((item) => Number(item.dayOfWeek) === 1) || {}) },
      ],
      warning: openDays ? "" : "Nenhum dia aberto configurado.",
    },
    payments: {
      status: defaultPayment ? "ACTIVE" : "WARNING",
      facts: [
        { label: "Ativos", value: `${activePayments} metodo(s)` },
        { label: "Padrao", value: defaultPayment?.name || "Sem metodo padrao" },
        { label: "Total", value: `${paymentMethods.length} cadastrado(s)` },
      ],
    },
    team: {
      status: activeTeam ? "ACTIVE" : "WARNING",
      facts: [
        { label: "Ativos", value: `${activeTeam} membro(s)` },
        { label: "Perfis", value: [...new Set(teamMembers.map((item) => accessLabel(item.accessProfile)))].slice(0, 2).join(", ") || "Sem equipe" },
        { label: "Total", value: `${teamMembers.length} cadastrado(s)` },
      ],
    },
    commissions: {
      status: activeRules || business.houseCommissionValue ? "ACTIVE" : "INFO",
      facts: [
        { label: "Regra da casa", value: `${commissionTypeLabel(business.houseCommissionType)}: ${commissionValueLabel({ type: business.houseCommissionType, value: business.houseCommissionValue })}` },
        { label: "Regras ativas", value: `${activeRules} regra(s)` },
        { label: "Total", value: `${commissionRules.length} cadastrada(s)` },
      ],
    },
    schedule: {
      status: "ACTIVE",
      facts: [
        { label: "Duracao padrao", value: `${toNumber(business.defaultAppointmentDuration, 45)} min` },
        { label: "Antecedencia", value: `${toNumber(business.minimumAdvanceMinutes, 30)} min` },
        { label: "Encaixes", value: business.allowWalkIns ? "Permitidos" : "Desativados" },
      ],
    },
    security: {
      status: security.passwordChangeSupported ? "ACTIVE" : "INFO",
      facts: [
        { label: "Usuario", value: security.currentSession?.email || "Sessao local" },
        { label: "Perfil", value: accessLabel(security.currentSession?.role || "owner") },
        { label: "Senha", value: security.passwordChangeSupported ? "Alteracao disponivel" : "Nao disponivel nesta versao" },
      ],
    },
    appearance: {
      status: "INFO",
      facts: [
        { label: "Nome exibido", value: business.displayName || business.businessName || "Nao definido" },
        { label: "Tema", value: business.themeMode === "dark" ? "Escuro" : business.themeMode === "system" ? "Sistema" : "Claro" },
        { label: "Cor principal", value: business.primaryColor || "#0f172a" },
      ],
    },
    operations: {
      status: "ACTIVE",
      facts: [
        { label: "Lembretes", value: business.sendAppointmentReminders ? `${toNumber(business.reminderLeadMinutes, 60)} min antes` : "Desativados" },
        { label: "Cliente em risco", value: `${toNumber(business.atRiskCustomerDays, 30)} dias` },
        { label: "Cliente inativo", value: `${toNumber(business.inactiveCustomerDays, 60)} dias` },
      ],
    },
  };

  return `
    <section class="settings-hub-hero">
      <div>
        <p class="ux-label">Operacao atual</p>
        <h2>${escapeHtml(business.displayName || business.businessName || "Minha empresa")}</h2>
        <p>${escapeHtml(segmentLabel(business.segment))} com configuracoes organizadas por tema. Dados tecnicos ficam no detalhe.</p>
      </div>
      <div class="settings-hub-hero-status">
        ${renderStatusChip(business.businessName ? "ACTIVE" : "WARNING", { label: business.businessName ? "Configuracao ativa" : "Revisar empresa" })}
        ${renderStatusChip("INFO", { label: `${SETTINGS_SECTIONS.length} blocos` })}
      </div>
    </section>
    <section class="settings-hub-grid">
      ${SETTINGS_SECTIONS.map((section) => settingsSectionCard({ ...section, ...(sectionMap[section.id] || {}) })).join("")}
    </section>
  `;
}

function field(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "Nao informado")}</dd>
    </div>
  `;
}

function renderBusinessForm(business = {}) {
  const segment = String(business.segment || "barbearia");
  return `
    <form id="settingsBusinessForm" class="settings-form-grid">
      <label>Nome da empresa
        <input name="businessName" value="${escapeHtml(business.businessName || "")}" required />
      </label>
      <label>Segmento
        <select name="segment">
          ${option("barbearia", "Barbearia", segment === "barbearia")}
          ${option("estetica", "Estetica", segment === "estetica")}
          ${option("salao", "Salao", segment === "salao")}
          ${option("pet_shop", "Pet Shop", segment === "pet_shop")}
          ${option("clinica", "Clinica", segment === "clinica")}
          ${option("outro", "Outro", segment === "outro")}
        </select>
      </label>
      <label>Telefone
        <input name="phone" value="${escapeHtml(business.phone || "")}" />
      </label>
      <label>E-mail
        <input name="email" type="email" value="${escapeHtml(business.email || "")}" />
      </label>
      <label>Documento
        <input name="document" value="${escapeHtml(business.document || "")}" />
      </label>
      <label>Endereco
        <input name="address" value="${escapeHtml(business.address || "")}" />
      </label>
      <label>Cidade
        <input name="city" value="${escapeHtml(business.city || "")}" />
      </label>
      <label>Estado
        <input name="state" value="${escapeHtml(business.state || "")}" />
      </label>
      <div class="settings-form-actions">
        ${renderPrimaryAction({ label: "Salvar dados da empresa", type: "submit" })}
      </div>
    </form>
  `;
}

function renderHoursForm(hours = []) {
  return `
    <form id="settingsHoursForm" class="settings-hours-list">
      ${DAY_LABELS.map((label, dayOfWeek) => {
        const row = hours.find((item) => Number(item.dayOfWeek) === dayOfWeek) || {
          dayOfWeek,
          isClosed: dayOfWeek === 0,
        };
        return `
          <article class="settings-hour-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(hourLabel(row))}</span>
            </div>
            <label class="settings-check"><input type="checkbox" name="closed_${dayOfWeek}" ${checked(row.isClosed)} /> Fechado</label>
            <input type="hidden" name="day_${dayOfWeek}" value="${dayOfWeek}" />
            <label>Abre<input type="time" name="opensAt_${dayOfWeek}" value="${escapeHtml(row.opensAt || "")}" /></label>
            <label>Fecha<input type="time" name="closesAt_${dayOfWeek}" value="${escapeHtml(row.closesAt || "")}" /></label>
            <label>Inicio pausa<input type="time" name="breakStart_${dayOfWeek}" value="${escapeHtml(row.breakStart || "")}" /></label>
            <label>Fim pausa<input type="time" name="breakEnd_${dayOfWeek}" value="${escapeHtml(row.breakEnd || "")}" /></label>
          </article>
        `;
      }).join("")}
      <div class="settings-form-actions">
        ${renderPrimaryAction({ label: "Salvar horarios", type: "submit" })}
      </div>
    </form>
  `;
}

function renderPaymentsList(paymentMethods = []) {
  if (!paymentMethods.length) {
    return renderEmptyState({
      title: "Nenhum metodo de pagamento configurado.",
      description: "Adicione pelo menos um metodo para orientar checkout e financeiro.",
    });
  }
  return `
    <div class="settings-compact-list">
      ${paymentMethods
        .map(
          (item) => `
            <article class="settings-compact-row">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>Atualizado em ${escapeHtml(formatDateTime(item.updatedAt))}</span>
              </div>
              <div class="settings-row-chips">
                ${renderStatusChip(item.isActive ? "ACTIVE" : "INACTIVE")}
                ${item.isDefault ? renderStatusChip("INFO", { label: "Padrao" }) : ""}
              </div>
              <div class="settings-row-actions">
                <button type="button" data-settings-action="set-payment-default" data-payment-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-muted">Definir padrao</button>
                <button type="button" data-settings-action="toggle-payment-active" data-payment-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="ux-btn ${item.isActive ? "ux-btn-muted" : "ux-btn-success"}">${item.isActive ? "Desativar" : "Ativar"}</button>
              </div>
              ${renderTechnicalTrace({
                paymentMethodId: item.id,
                unitId: item.unitId,
                status: item.isActive ? "ACTIVE" : "INACTIVE",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              })}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPaymentsForm() {
  return `
    <form id="settingsPaymentCreateForm" class="settings-inline-form">
      <input name="name" required placeholder="Novo metodo (ex.: Transferencia)" />
      ${renderPrimaryAction({ label: "Adicionar metodo", type: "submit" })}
    </form>
  `;
}

function renderTeamList(teamMembers = []) {
  if (!teamMembers.length) {
    return renderEmptyState({
      title: "Nenhum membro cadastrado.",
      description: "Cadastre a equipe para organizar perfis e responsabilidades.",
    });
  }
  return `
    <div class="settings-compact-list">
      ${teamMembers
        .map(
          (item) => `
            <article class="settings-compact-row">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(roleLabel(item.role))} - ${escapeHtml(accessLabel(item.accessProfile))}${item.phone || item.email ? ` - ${escapeHtml(item.phone || item.email)}` : ""}</span>
              </div>
              <div class="settings-row-chips">${renderStatusChip(item.isActive ? "ACTIVE" : "INACTIVE")}</div>
              <div class="settings-row-actions">
                <button type="button" data-settings-action="toggle-team-member" data-member-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="ux-btn ${item.isActive ? "ux-btn-muted" : "ux-btn-success"}">${item.isActive ? "Inativar" : "Ativar"}</button>
              </div>
              ${renderTechnicalTrace({
                teamMemberId: item.id,
                unitId: item.unitId,
                status: item.isActive ? "ACTIVE" : "INACTIVE",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              })}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTeamForm() {
  return `
    <form id="settingsTeamForm" class="settings-form-grid settings-form-grid-compact">
      <input name="name" required placeholder="Nome do membro" />
      <select name="role">
        ${option("OWNER", "Dono", false)}
        ${option("MANAGER", "Gerente", false)}
        ${option("PROFESSIONAL", "Profissional", true)}
        ${option("RECEPTION", "Recepcao", false)}
      </select>
      <select name="accessProfile">
        ${option("owner", "Administracao", false)}
        ${option("gerente", "Gestao", false)}
        ${option("profissional", "Atendimento", true)}
        ${option("recepcao", "Recepcao", false)}
      </select>
      ${renderPrimaryAction({ label: "Adicionar membro", type: "submit" })}
    </form>
  `;
}

function renderCommissionsList(commissionRules = []) {
  if (!commissionRules.length) {
    return renderEmptyState({
      title: "Nenhuma regra de comissao cadastrada.",
      description: "Use a regra da casa ou crie excecoes por profissional e servico.",
    });
  }
  return `
    <div class="settings-compact-list">
      ${commissionRules
        .map(
          (item) => `
            <article class="settings-compact-row">
              <div>
                <strong>${escapeHtml(ruleScopeLabel(item))}</strong>
                <span>${escapeHtml(commissionTypeLabel(item.type))}: ${escapeHtml(commissionValueLabel(item))} - ${escapeHtml(item.professionalName || "Todos profissionais")} - ${escapeHtml(item.serviceName || "Todos servicos")}</span>
              </div>
              <div class="settings-row-chips">${renderStatusChip(item.isActive ? "ACTIVE" : "INACTIVE")}</div>
              <div class="settings-row-actions">
                <button type="button" data-settings-action="toggle-commission-rule" data-rule-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="ux-btn ${item.isActive ? "ux-btn-muted" : "ux-btn-success"}">${item.isActive ? "Inativar" : "Ativar"}</button>
              </div>
              ${renderTechnicalTrace({
                commissionRuleId: item.id,
                ruleId: item.id,
                professionalId: item.professionalId,
                serviceId: item.serviceId,
                unitId: item.unitId,
                status: item.isActive ? "ACTIVE" : "INACTIVE",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              })}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCommissionsForms(commissionRules = [], professionals = [], services = [], business = {}) {
  return `
    <details class="client-progressive-panel" open>
      <summary>Regra da casa</summary>
      <form id="settingsHouseCommissionForm" class="settings-inline-form">
        <select name="houseCommissionType">
          ${option("PERCENTAGE", "Comissao percentual", business.houseCommissionType === "PERCENTAGE")}
          ${option("FIXED", "Comissao fixa", business.houseCommissionType === "FIXED")}
        </select>
        <input name="houseCommissionValue" type="number" min="0" step="0.01" value="${escapeHtml(toNumber(business.houseCommissionValue).toString())}" />
        ${renderPrimaryAction({ label: "Salvar regra da casa", type: "submit" })}
      </form>
    </details>
    <details class="client-progressive-panel" ${commissionRules.length ? "" : "open"}>
      <summary>Nova regra especifica</summary>
      <form id="settingsCommissionForm" class="settings-form-grid settings-form-grid-compact">
        <select name="professionalId">
          <option value="">Todos profissionais</option>
          ${professionals.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select name="serviceId">
          <option value="">Todos servicos</option>
          ${services.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <select name="type">
          ${option("PERCENTAGE", "Comissao percentual", true)}
          ${option("FIXED", "Comissao fixa", false)}
        </select>
        <input name="value" type="number" min="0" step="0.01" required placeholder="Valor" />
        ${renderPrimaryAction({ label: "Criar regra", type: "submit" })}
      </form>
    </details>
  `;
}

function renderOperationsForm(business = {}) {
  return `
    <form id="settingsOperationsForm" class="settings-form-grid">
      <label>Duracao padrao do atendimento
        <input type="number" name="defaultAppointmentDuration" min="1" step="1" value="${escapeHtml(toNumber(business.defaultAppointmentDuration, 45).toString())}" />
      </label>
      <label>Antecedencia minima
        <input type="number" name="minimumAdvanceMinutes" min="0" step="1" value="${escapeHtml(toNumber(business.minimumAdvanceMinutes, 30).toString())}" />
      </label>
      <label>Tempo entre atendimentos
        <input type="number" name="bufferBetweenAppointmentsMinutes" min="0" step="1" value="${escapeHtml(toNumber(business.bufferBetweenAppointmentsMinutes, 10).toString())}" />
      </label>
      <label>Lembrete antes do horario
        <input type="number" name="reminderLeadMinutes" min="0" step="1" value="${escapeHtml(toNumber(business.reminderLeadMinutes, 60).toString())}" />
      </label>
      <label>Cliente em risco apos
        <input type="number" name="atRiskCustomerDays" min="1" step="1" value="${escapeHtml(toNumber(business.atRiskCustomerDays, 30).toString())}" />
      </label>
      <label>Cliente inativo apos
        <input type="number" name="inactiveCustomerDays" min="1" step="1" value="${escapeHtml(toNumber(business.inactiveCustomerDays, 60).toString())}" />
      </label>
      <label class="settings-check"><input type="checkbox" name="allowWalkIns" ${checked(business.allowWalkIns)} /> Permitir encaixes</label>
      <label class="settings-check"><input type="checkbox" name="allowOutOfHoursAppointments" ${checked(business.allowOutOfHoursAppointments)} /> Permitir fora do horario</label>
      <label class="settings-check"><input type="checkbox" name="sendAppointmentReminders" ${checked(business.sendAppointmentReminders)} /> Enviar lembretes</label>
      <label class="settings-check"><input type="checkbox" name="allowOverbooking" ${checked(business.allowOverbooking)} /> Permitir sobreposicao excepcional</label>
      <div class="settings-form-actions">
        ${renderPrimaryAction({ label: "Salvar preferencias", type: "submit" })}
      </div>
    </form>
  `;
}

function renderAppearanceForm(business = {}) {
  return `
    <form id="settingsAppearanceForm" class="settings-form-grid">
      <label>Nome exibido
        <input name="displayName" value="${escapeHtml(business.displayName || "")}" />
      </label>
      <label>Cor principal
        <input name="primaryColor" value="${escapeHtml(business.primaryColor || "#0f172a")}" />
      </label>
      <label>Tema
        <select name="themeMode">
          ${option("light", "Claro", business.themeMode === "light")}
          ${option("dark", "Escuro", business.themeMode === "dark")}
          ${option("system", "Sistema", business.themeMode === "system")}
        </select>
      </label>
      <div class="settings-form-actions">
        ${renderPrimaryAction({ label: "Salvar aparencia", type: "submit" })}
      </div>
    </form>
  `;
}

function renderBusinessTrace(business = {}) {
  return renderTechnicalTrace({
    businessSettingsId: business.id,
    id: business.id,
    unitId: business.unitId,
    businessId: business.businessId,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  });
}

function sectionContent(section, payload = {}, context = {}) {
  const business = payload.business || {};
  const hours = Array.isArray(payload.businessHours) ? payload.businessHours : [];
  const teamMembers = Array.isArray(payload.teamMembers) ? payload.teamMembers : [];
  const commissionRules = Array.isArray(payload.commissionRules) ? payload.commissionRules : [];
  const paymentMethods = Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [];
  const security = payload.security || {};
  const professionals = Array.isArray(context.professionals) ? context.professionals : [];
  const services = Array.isArray(context.services) ? context.services : [];

  const configs = {
    business: {
      title: "Dados da empresa",
      subtitle: "Nome, segmento, contato, endereco e documento.",
      status: business.businessName ? "ACTIVE" : "WARNING",
      summary: `<dl class="op-summary-grid">${field("Nome", business.businessName)}${field("Segmento", segmentLabel(business.segment))}${field("Telefone", business.phone)}${field("E-mail", business.email)}${field("Endereco", business.address)}${field("Cidade/estado", [business.city, business.state].filter(Boolean).join(" - "))}${field("Documento", business.document)}${field("Nome exibido", business.displayName)}</dl>`,
      details: renderBusinessForm(business),
      technicalTrace: renderBusinessTrace(business),
    },
    hours: {
      title: "Horarios de funcionamento",
      subtitle: "Agenda usa estes horarios para orientar disponibilidade.",
      status: hours.some((item) => !item.isClosed) ? "ACTIVE" : "WARNING",
      summary: `<dl class="op-summary-grid">${DAY_LABELS.map((label, index) => field(label, hourLabel(hours.find((item) => Number(item.dayOfWeek) === index) || { isClosed: index === 0 }))).join("")}</dl>`,
      details: renderHoursForm(hours),
      technicalTrace: renderTechnicalTrace({
        unitId: business.unitId,
        businessSettingsId: business.id,
        metadataJson: { businessHours: hours },
      }),
    },
    payments: {
      title: "Metodos de pagamento",
      subtitle: "Ativos, inativos e padrao de recebimento.",
      status: paymentMethods.some((item) => item.isDefault) ? "ACTIVE" : "WARNING",
      summary: `<p class="settings-drawer-note">Mostre ao caixa apenas os metodos aceitos. O metodo padrao orienta o preenchimento operacional.</p>${renderPaymentsForm()}`,
      details: renderPaymentsList(paymentMethods),
      technicalTrace: renderTechnicalTrace({
        unitId: business.unitId,
        businessSettingsId: business.id,
        metadataJson: { paymentMethods },
      }),
    },
    team: {
      title: "Equipe",
      subtitle: "Pessoas, papel na operacao e perfil de acesso.",
      status: teamMembers.some((item) => item.isActive) ? "ACTIVE" : "WARNING",
      summary: renderTeamForm(),
      details: renderTeamList(teamMembers),
      technicalTrace: renderTechnicalTrace({
        unitId: business.unitId,
        businessSettingsId: business.id,
        metadataJson: { teamMembers },
      }),
    },
    commissions: {
      title: "Regras de comissao",
      subtitle: "Regra geral da casa e excecoes por profissional ou servico.",
      status: "ACTIVE",
      summary: `<dl class="op-summary-grid">${field("Regra da casa", `${commissionTypeLabel(business.houseCommissionType)}: ${commissionValueLabel({ type: business.houseCommissionType, value: business.houseCommissionValue })}`)}${field("Regras ativas", String(commissionRules.filter((item) => item.isActive).length))}${field("Regras cadastradas", String(commissionRules.length))}</dl>`,
      details: `${renderCommissionsForms(commissionRules, professionals, services, business)}<div class="mt-3">${renderCommissionsList(commissionRules)}</div>`,
      technicalTrace: renderTechnicalTrace({
        unitId: business.unitId,
        businessSettingsId: business.id,
        commissionRuleIds: commissionRules.map((item) => item.id),
        metadataJson: { commissionRules },
      }),
    },
    schedule: {
      title: "Preferencias de agenda",
      subtitle: "Duracao, antecedencia e regras de encaixe.",
      status: "ACTIVE",
      summary: `<dl class="op-summary-grid">${field("Duracao padrao", `${toNumber(business.defaultAppointmentDuration, 45)} min`)}${field("Antecedencia minima", `${toNumber(business.minimumAdvanceMinutes, 30)} min`)}${field("Tempo entre atendimentos", `${toNumber(business.bufferBetweenAppointmentsMinutes, 10)} min`)}${field("Encaixes", business.allowWalkIns ? "Permitidos" : "Desativados")}</dl>`,
      details: renderOperationsForm(business),
      technicalTrace: renderBusinessTrace(business),
    },
    security: {
      title: "Seguranca",
      subtitle: "Informacoes suportadas pelo backend atual.",
      status: security.passwordChangeSupported ? "ACTIVE" : "INFO",
      summary: `<dl class="op-summary-grid">${field("Usuario", security.currentSession?.email)}${field("Perfil", accessLabel(security.currentSession?.role || "owner"))}${field("Alteracao de senha", security.passwordChangeSupported ? "Disponivel" : "Alteracao de senha ainda nao esta disponivel nesta versao.")}</dl>`,
      details: `<p class="settings-drawer-note">${escapeHtml(security.passwordChangeSupported ? "Use o fluxo de identidade disponivel para gerenciar senha." : "Alteracao de senha ainda nao esta disponivel nesta versao.")}</p>`,
      technicalTrace: renderTechnicalTrace({
        unitId: business.unitId || security.currentSession?.activeUnitId,
        businessSettingsId: business.id,
        metadataJson: { security },
      }),
    },
    appearance: {
      title: "Aparencia e tema",
      subtitle: "Campos visuais ja suportados pela configuracao atual.",
      status: "INFO",
      summary: `<dl class="op-summary-grid">${field("Nome exibido", business.displayName || business.businessName)}${field("Tema", business.themeMode === "dark" ? "Escuro" : business.themeMode === "system" ? "Sistema" : "Claro")}${field("Cor principal", business.primaryColor || "#0f172a")}</dl>`,
      details: renderAppearanceForm(business),
      technicalTrace: renderBusinessTrace(business),
    },
    operations: {
      title: "Parametros operacionais",
      subtitle: "Clientes, lembretes e excecoes de agenda.",
      status: "ACTIVE",
      summary: `<dl class="op-summary-grid">${field("Lembretes", business.sendAppointmentReminders ? `${toNumber(business.reminderLeadMinutes, 60)} min antes` : "Desativados")}${field("Cliente em risco", `${toNumber(business.atRiskCustomerDays, 30)} dias`)}${field("Cliente inativo", `${toNumber(business.inactiveCustomerDays, 60)} dias`)}${field("Sobreposicao", business.allowOverbooking ? "Permitida em excecao" : "Bloqueada")}</dl>`,
      details: renderOperationsForm(business),
      technicalTrace: renderBusinessTrace(business),
    },
  };
  return configs[section] || configs.business;
}

export function renderSettingsLoading(elements) {
  if (elements.root) renderPanelMessage(elements.root, "Carregando configuracoes...");
}

export function renderSettingsError(elements, message = "Falha ao carregar configuracoes.") {
  if (elements.root) renderPanelMessage(elements.root, message, "error");
}

export function renderSettingsData(elements, payload = {}) {
  if (!elements.root) return;
  elements.root.innerHTML = `
    ${renderPageHeader({
      breadcrumb: "Inicio / Configuracoes",
      eyebrow: "Configuracoes",
      title: "Hub de configuracoes",
      subtitle: "Organize empresa, agenda, pagamentos, equipe, comissoes, seguranca e aparencia sem transformar a tela em um formulario gigante.",
    })}
    ${renderHub(payload)}
    <div id="settingsDrawerHost" class="hidden"></div>
  `;
}

export function renderSettingsSectionDrawer(elements, payload = {}, context = {}, section = "business") {
  const host = elements.root?.querySelector("#settingsDrawerHost");
  if (!host) return;
  const content = sectionContent(section, payload, context);
  host.innerHTML = renderEntityDrawer({
    id: "settingsEntityDrawer",
    title: content.title,
    subtitle: content.subtitle,
    status: content.status,
    open: true,
    summary: content.summary,
    details: content.details,
    technicalTrace: content.technicalTrace,
  });
  host.classList.remove("hidden");
  bindEntityDrawers(host);
  host.querySelectorAll("[data-drawer-close]").forEach((button) => {
    button.addEventListener("click", () => host.classList.add("hidden"));
  });
}
