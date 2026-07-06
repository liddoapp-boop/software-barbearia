import {
  bindEntityDrawers,
  renderEmptyState,
  renderEntityDrawer,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "../components/operational-ui.js";
import { renderPanelMessage } from "./feedback.js";
import { formatPhoneBR, normalizePhoneDigits } from "./phone.js";

const DAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const SETTINGS_SECTIONS = [
  { id: "business", title: "Empresa", description: "Dados institucionais e identidade pública da operação." },
  { id: "hours", title: "Horários", description: "Funcionamento semanal usado pela agenda." },
  { id: "payments", title: "Pagamentos", description: "Métodos aceitos, status e padrão de recebimento." },
  { id: "team", title: "Equipe", description: "Pessoas, funções e perfis de acesso cadastrados." },
  { id: "schedule", title: "Agenda", description: "Preferências operacionais de duração, antecedência e encaixes." },
  { id: "operations", title: "Parâmetros", description: "Clientes em risco, inativos, lembretes e sobreposições." },
  { id: "usuario", title: "Usuário", description: "Perfil, aparência e segurança da conta." },
];

const SETTINGS_GROUPS = [
  { title: "Operação", sections: ["business", "hours", "schedule", "operations"] },
  { title: "Recebimento", sections: ["payments"] },
  { title: "Conta e sistema", sections: ["team", "usuario"] },
];

const SETTINGS_ICONS = {
  business:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  hours:       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  schedule:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  operations:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  payments:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  commissions: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  team:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21a8 8 0 0 0-16 0"/><circle cx="9" cy="7" r="4"/><path d="M23 21a8 8 0 0 0-5.4-7.5"/><circle cx="19" cy="5" r="3"/></svg>`,
  usuario:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
};

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

function themeLabel(value = "system") {
  const mode = String(value || "system");
  if (mode === "dark") return "Escuro";
  if (mode === "light") return "Claro";
  return "Sistema";
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
    estetica: "Estética",
    salao: "Salão",
    pet_shop: "Pet shop",
    clinica: "Clínica",
    outro: "Outro segmento",
  };
  return labels[value] || "Outro segmento";
}

function roleLabel(value = "") {
  const labels = {
    OWNER: "Dono",
    MANAGER: "Gerente",
    PROFESSIONAL: "Profissional",
    RECEPTION: "Recepção",
  };
  return labels[value] || value || "Equipe";
}

function accessLabel(value = "") {
  const labels = {
    owner: "Administração",
    gerente: "Gestão",
    profissional: "Atendimento",
    recepcao: "Recepção",
  };
  return labels[value] || value || "Perfil não informado";
}

function commissionTypeLabel(type = "") {
  return type === "FIXED" ? "Comissão fixa" : "Comissão percentual";
}

function commissionValueLabel(item = {}) {
  return item.type === "FIXED" ? money(item.value) : `${toNumber(item.value).toFixed(2)}%`;
}

function ruleScopeLabel(item = {}) {
  if (item.professionalName && item.serviceName) return "Regra por profissional e serviço";
  if (item.professionalName) return "Regra por profissional";
  if (item.serviceName) return "Regra por serviço";
  return "Regra geral";
}

function hourLabel(item = {}) {
  if (item.isClosed) return "Fechado";
  const range = `${item.opensAt || "--:--"} as ${item.closesAt || "--:--"}`;
  if (item.breakStart && item.breakEnd) return `${range}, pausa ${item.breakStart} as ${item.breakEnd}`;
  return range;
}

function summarizeHours(hours = []) {
  const rows = Array.isArray(hours) ? hours : [];
  const openRows = rows.filter((item) => !item.isClosed && item.opensAt && item.closesAt);
  if (!openRows.length) {
    return {
      openDays: 0,
      weeklyWindow: "0h",
      earliestOpen: "--:--",
      latestClose: "--:--",
    };
  }
  let minOpen = Number.POSITIVE_INFINITY;
  let maxClose = Number.NEGATIVE_INFINITY;
  let totalMinutes = 0;
  for (const row of openRows) {
    const [oh, om] = String(row.opensAt || "00:00").split(":").map(Number);
    const [ch, cm] = String(row.closesAt || "00:00").split(":").map(Number);
    const openMin = (Number.isFinite(oh) ? oh : 0) * 60 + (Number.isFinite(om) ? om : 0);
    const closeMin = (Number.isFinite(ch) ? ch : 0) * 60 + (Number.isFinite(cm) ? cm : 0);
    minOpen = Math.min(minOpen, openMin);
    maxClose = Math.max(maxClose, closeMin);
    totalMinutes += Math.max(0, closeMin - openMin);
  }
  const toHm = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const hoursTotal = (totalMinutes / 60).toFixed(1).replace(".", ",");
  return {
    openDays: openRows.length,
    weeklyWindow: `${hoursTotal}h`,
    earliestOpen: toHm(minOpen),
    latestClose: toHm(maxClose),
  };
}

function settingsSectionRow({ id, title, description, status = "", facts = [], warning = "" }) {
  const factItems = facts.filter((item) => item?.value !== undefined && item?.value !== null && item?.value !== "").slice(0, 3);
  const primaryFact = factItems[0];
  const secondaryFacts = factItems.slice(1);
  return `
    <button type="button" class="settings-list-row" data-settings-action="open-section" data-settings-section="${escapeHtml(id)}">
      <span class="settings-row-accent" aria-hidden="true"></span>
      <span class="settings-row-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
      <span class="settings-row-primary">
        <span>${escapeHtml(primaryFact?.label || "Status")}</span>
        <strong>${escapeHtml(primaryFact?.value || "Não configurado")}</strong>
      </span>
      <span class="settings-row-secondary">
        <span class="settings-row-pills">
          ${secondaryFacts.map((item) => `<em>${escapeHtml(item.label)} ${escapeHtml(item.value)}</em>`).join("")}
        </span>
        ${warning ? `<em class="settings-row-warning">${escapeHtml(warning)}</em>` : ""}
      </span>
      <span class="settings-row-status">${status ? renderStatusChip(status) : ""}</span>
      <span class="settings-row-arrow" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </span>
    </button>
  `;
}

function renderSettingsNavigator(sectionMap = {}, business = {}) {
  const groups = [
    { title: "Operação", count: 4, sections: ["business", "hours", "schedule", "operations"] },
    { title: "Recebimento", count: 1, sections: ["payments"] },
    { title: "Time e sistema", count: 3, sections: ["team", "security", "appearance"] },
  ];
  const openDays = sectionMap.hours?.facts?.[0]?.value || "0 dia(s)";
  const defaultPayment = sectionMap.payments?.facts?.[1]?.value || "Sem método";
  const activeTeam = sectionMap.team?.facts?.[0]?.value || "0 membro(s)";

  return `
    <section class="settings-overview-strip">
      <article class="settings-overview-card settings-overview-card-wide">
        <span>Operação</span>
        <strong>${escapeHtml(business.displayName || business.businessName || "Minha empresa")}</strong>
        <small>${escapeHtml(segmentLabel(business.segment))}</small>
      </article>
      <article class="settings-overview-card">
        <span>Agenda</span>
        <strong>${escapeHtml(openDays)}</strong>
        <small>${escapeHtml(sectionMap.schedule?.facts?.[0]?.value || "Duração padrão")}</small>
      </article>
      <article class="settings-overview-card">
        <span>Recebimento</span>
        <strong>${escapeHtml(defaultPayment)}</strong>
        <small>${escapeHtml(sectionMap.payments?.facts?.[0]?.value || "0 método(s)")}</small>
      </article>
      <article class="settings-overview-card">
        <span>Equipe</span>
        <strong>${escapeHtml(activeTeam)}</strong>
        <small>${escapeHtml(sectionMap.team?.facts?.[1]?.value || "Perfis")}</small>
      </article>
    </section>

    <section class="settings-command-panel">
      <header class="settings-command-head">
        <div>
          <p class="ux-label">Menu de configurações</p>
          <h2>Ajustes operacionais</h2>
        </div>
        <span>${SETTINGS_SECTIONS.length} blocos</span>
      </header>
      <div class="settings-command-groups">
        ${groups
          .map((group) => {
            const rows = group.sections
              .map((id) => {
                const section = SETTINGS_SECTIONS.find((item) => item.id === id);
                return section ? settingsSectionRow({ ...section, ...(sectionMap[id] || {}) }) : "";
              })
              .join("");
            return `
              <section class="settings-list-group">
                <header class="settings-list-group-head">
                  <h3>${escapeHtml(group.title)}</h3>
                  <span>${group.count} ajuste(s)</span>
                </header>
                <div class="settings-list">${rows}</div>
              </section>
            `;
          })
          .join("")}
      </div>
    </section>
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
        { label: "Nome", value: business.businessName || "Nome não configurado" },
        { label: "Segmento", value: segmentLabel(business.segment) },
        { label: "Contato", value: business.phone || business.email || "Contato não informado" },
      ],
      warning: !business.email ? "E-mail da empresa ainda não foi informado." : "",
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
        { label: "Ativos", value: `${activePayments} método(s)` },
        { label: "Padrão", value: defaultPayment?.name || "Sem método padrão" },
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
        { label: "Duração padrão", value: `${toNumber(business.defaultAppointmentDuration, 45)} min` },
        { label: "Antecedência", value: `${toNumber(business.minimumAdvanceMinutes, 30)} min` },
        { label: "Encaixes", value: business.allowWalkIns ? "Permitidos" : "Desativados" },
      ],
    },
    security: {
      status: security.passwordChangeSupported ? "ACTIVE" : "INFO",
      facts: [
        { label: "Usuário", value: security.currentSession?.email || "Sessão local" },
        { label: "Perfil", value: accessLabel(security.currentSession?.role || "owner") },
        { label: "Senha", value: security.passwordChangeSupported ? "Alteração disponível" : "Não disponível nesta versão" },
      ],
    },
    appearance: {
      status: "INFO",
      facts: [
        { label: "Nome exibido", value: business.displayName || business.businessName || "Não definido" },
        { label: "Tema", value: themeLabel(business.themeMode) },
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
    ${renderSettingsNavigator(sectionMap, business)}
  `;
}

function field(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "Não informado")}</dd>
    </div>
  `;
}

function renderBusinessForm(business = {}) {
  const segment = String(business.segment || "barbearia");
  const phoneDisplay = formatPhoneBR(business.phone || "");
  return `
    <form id="settingsBusinessForm" class="cfg-form">
      <div class="cfg-grid">
        <label class="cfg-field cfg-field-wide">
          <span>Nome da empresa</span>
          <input class="cfg-input" name="businessName" value="${escapeHtml(business.businessName || "")}" required />
        </label>
        <label class="cfg-field">
          <span>Segmento</span>
          <select class="cfg-input" name="segment">
            ${option("barbearia", "Barbearia", segment === "barbearia")}
            ${option("estetica", "Estética", segment === "estetica")}
            ${option("salao", "Salão", segment === "salao")}
            ${option("pet_shop", "Pet Shop", segment === "pet_shop")}
            ${option("clinica", "Clínica", segment === "clinica")}
            ${option("outro", "Outro", segment === "outro")}
          </select>
        </label>
        <label class="cfg-field">
          <span>Telefone</span>
          <input class="cfg-input" name="phone" value="${escapeHtml(phoneDisplay)}" placeholder="(11) 99999-9999" maxlength="15" data-phone-mask />
        </label>
        <label class="cfg-field">
          <span>E-mail</span>
          <input class="cfg-input" name="email" type="email" value="${escapeHtml(business.email || "")}" />
        </label>
        <label class="cfg-field">
          <span>Documento</span>
          <input class="cfg-input" name="document" value="${escapeHtml(business.document || "")}" />
        </label>
        <label class="cfg-field">
          <span>Endereço</span>
          <input class="cfg-input" name="address" value="${escapeHtml(business.address || "")}" />
        </label>
        <label class="cfg-field">
          <span>Cidade</span>
          <input class="cfg-input" name="city" value="${escapeHtml(business.city || "")}" />
        </label>
        <label class="cfg-field">
          <span>Estado</span>
          <input class="cfg-input" name="state" value="${escapeHtml(business.state || "")}" />
        </label>
      </div>
      <div class="cfg-actions">
        ${renderPrimaryAction({ label: "Salvar dados da empresa", type: "submit" })}
      </div>
    </form>
  `;
}

function renderHoursForm(hours = []) {
  const summary = summarizeHours(hours);
  const presetCards = [
    {
      id: "barber_default",
      title: "Grade do barbeiro",
      description: "Seg a Sex 08:00-20:00, Sab 08:00-14:00 e Domingo fechado.",
    },
    {
      id: "commercial_day",
      title: "Comercial padrão",
      description: "Seg a Sex 09:00-19:00, Sab 09:00-14:00 e Domingo fechado.",
    },
    {
      id: "clear_all",
      title: "Fechar todos",
      description: "Limpa a grade atual e marca todos os dias como fechados.",
    },
  ];
  return `
    <form id="settingsHoursForm" class="cfg-form">
      <div class="cfg-kpi-strip">
        <article class="cfg-kpi">
          <span>Dias abertos</span>
          <strong>${summary.openDays}</strong>
          <small>de 7 dias</small>
        </article>
        <article class="cfg-kpi">
          <span>Carga semanal</span>
          <strong>${summary.weeklyWindow}</strong>
          <small>total aberto</small>
        </article>
        <article class="cfg-kpi">
          <span>Primeiro horário</span>
          <strong>${summary.earliestOpen}</strong>
          <small>mais cedo</small>
        </article>
        <article class="cfg-kpi">
          <span>Ultimo horario</span>
          <strong>${summary.latestClose}</strong>
          <small>mais tarde</small>
        </article>
      </div>

      <div class="cfg-presets-grid">
        ${presetCards.map((preset) => `
          <button type="button" class="cfg-preset-btn" data-settings-action="apply-hours-preset" data-preset="${escapeHtml(preset.id)}">
            <strong>${escapeHtml(preset.title)}</strong>
            <span>${escapeHtml(preset.description)}</span>
          </button>
        `).join("")}
      </div>

      <div class="cfg-days">
      ${DAY_LABELS.map((label, dayOfWeek) => {
        const row = hours.find((item) => Number(item.dayOfWeek) === dayOfWeek) || {
          dayOfWeek,
          isClosed: dayOfWeek === 0,
        };
        const isClosed = Boolean(row.isClosed);
        return `
          <article class="cfg-day ${isClosed ? "is-closed" : ""}">
            <div class="cfg-day-head">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(hourLabel(row))}</span>
              <label class="cfg-check cfg-check-inline">
                <input type="checkbox" name="closed_${dayOfWeek}" ${checked(row.isClosed)} />
                Fechado
              </label>
              <button type="button" class="cfg-copy-btn ux-btn ux-btn-muted" data-settings-action="copy-day-hours" data-source-day="${dayOfWeek}">
                Copiar
              </button>
            </div>
            <input type="hidden" name="day_${dayOfWeek}" value="${dayOfWeek}" />
            <div class="cfg-day-grid">
              <label class="cfg-field">
                <span>Abre</span>
                <input class="cfg-input" type="time" name="opensAt_${dayOfWeek}" value="${escapeHtml(row.opensAt || "")}" ${isClosed ? "disabled" : ""} />
              </label>
              <label class="cfg-field">
                <span>Fecha</span>
                <input class="cfg-input" type="time" name="closesAt_${dayOfWeek}" value="${escapeHtml(row.closesAt || "")}" ${isClosed ? "disabled" : ""} />
              </label>
              <label class="cfg-field">
                <span>Inicio pausa</span>
                <input class="cfg-input" type="time" name="breakStart_${dayOfWeek}" value="${escapeHtml(row.breakStart || "")}" ${isClosed ? "disabled" : ""} />
              </label>
              <label class="cfg-field">
                <span>Fim pausa</span>
                <input class="cfg-input" type="time" name="breakEnd_${dayOfWeek}" value="${escapeHtml(row.breakEnd || "")}" ${isClosed ? "disabled" : ""} />
              </label>
            </div>
          </article>
        `;
      }).join("")}
      </div>
      <div class="cfg-actions">
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
    <div class="cfg-list">
      ${paymentMethods
        .map(
          (item) => `
            <article class="cfg-list-row">
              <div class="cfg-list-info">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${item.isDefault ? "Metodo padrao" : "Metodo de pagamento"}</span>
              </div>
              <div class="cfg-list-chips">
                ${renderStatusChip(item.isActive ? "ACTIVE" : "INACTIVE")}
                ${item.isDefault ? renderStatusChip("INFO", { label: "Padrao" }) : ""}
              </div>
              <div class="cfg-list-actions">
                <button type="button" data-settings-action="set-payment-default" data-payment-id="${escapeHtml(item.id)}" class="ux-btn ux-btn-muted">Definir padrao</button>
                <button type="button" data-settings-action="toggle-payment-active" data-payment-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="ux-btn ${item.isActive ? "ux-btn-muted" : "ux-btn-success"}">${item.isActive ? "Desativar" : "Ativar"}</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderPaymentsForm() {
  return `
    <form id="settingsPaymentCreateForm" class="cfg-inline-form">
      <input class="cfg-input" name="name" required placeholder="Novo metodo (ex.: Transferencia)" />
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
    <div class="cfg-list">
      ${teamMembers
        .map(
          (item) => `
            <article class="cfg-list-row">
              <div class="cfg-list-info">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(roleLabel(item.role))} — ${escapeHtml(accessLabel(item.accessProfile))}${item.phone || item.email ? ` — ${escapeHtml(item.phone || item.email)}` : ""}</span>
              </div>
              <div class="cfg-list-chips">${renderStatusChip(item.isActive ? "ACTIVE" : "INACTIVE")}</div>
              <div class="cfg-list-actions">
                <button type="button" data-settings-action="toggle-team-member" data-member-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="ux-btn ${item.isActive ? "ux-btn-muted" : "ux-btn-success"}">${item.isActive ? "Inativar" : "Ativar"}</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTeamForm() {
  return `
    <form id="settingsTeamForm" class="cfg-inline-form cfg-inline-form-4">
      <label class="cfg-field">
        <span>Nome</span>
        <input class="cfg-input" name="name" required placeholder="Nome do membro" />
      </label>
      <label class="cfg-field">
        <span>Funcao</span>
        <select class="cfg-input" name="role">
          ${option("OWNER", "Dono", false)}
          ${option("MANAGER", "Gerente", false)}
          ${option("PROFESSIONAL", "Profissional", true)}
          ${option("RECEPTION", "Recepcao", false)}
        </select>
      </label>
      <label class="cfg-field">
        <span>Perfil de acesso</span>
        <select class="cfg-input" name="accessProfile">
          ${option("owner", "Administracao", false)}
          ${option("gerente", "Gestao", false)}
          ${option("profissional", "Atendimento", true)}
          ${option("recepcao", "Recepcao", false)}
        </select>
      </label>
      <div class="cfg-field-action">
        ${renderPrimaryAction({ label: "Adicionar", type: "submit" })}
      </div>
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
    <div class="cfg-list">
      ${commissionRules
        .map(
          (item) => `
            <article class="cfg-list-row">
              <div class="cfg-list-info">
                <strong>${escapeHtml(ruleScopeLabel(item))}</strong>
                <span>${escapeHtml(commissionTypeLabel(item.type))}: ${escapeHtml(commissionValueLabel(item))} — ${escapeHtml(item.professionalName || "Todos profissionais")} — ${escapeHtml(item.serviceName || "Todos servicos")}</span>
              </div>
              <div class="cfg-list-chips">${renderStatusChip(item.isActive ? "ACTIVE" : "INACTIVE")}</div>
              <div class="cfg-list-actions">
                <button type="button" data-settings-action="toggle-commission-rule" data-rule-id="${escapeHtml(item.id)}" data-next-active="${item.isActive ? "false" : "true"}" class="ux-btn ${item.isActive ? "ux-btn-muted" : "ux-btn-success"}">${item.isActive ? "Inativar" : "Ativar"}</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCommissionsForms(commissionRules = [], professionals = [], services = [], business = {}) {
  return `
    <details class="cfg-panel" open>
      <summary class="cfg-panel-summary">Regra da casa</summary>
      <form id="settingsHouseCommissionForm" class="cfg-inline-form">
        <label class="cfg-field">
          <span>Tipo</span>
          <select class="cfg-input" name="houseCommissionType">
            ${option("PERCENTAGE", "Comissao percentual", business.houseCommissionType === "PERCENTAGE")}
            ${option("FIXED", "Comissao fixa", business.houseCommissionType === "FIXED")}
          </select>
        </label>
        <label class="cfg-field">
          <span>Valor</span>
          <input class="cfg-input" name="houseCommissionValue" type="number" min="0" step="0.01" value="${escapeHtml(toNumber(business.houseCommissionValue).toString())}" />
        </label>
        <div class="cfg-field-action">
          ${renderPrimaryAction({ label: "Salvar", type: "submit" })}
        </div>
      </form>
    </details>
    <details class="cfg-panel" ${commissionRules.length ? "" : "open"}>
      <summary class="cfg-panel-summary">Nova regra especifica</summary>
      <form id="settingsCommissionForm" class="cfg-inline-form cfg-inline-form-4">
        <label class="cfg-field">
          <span>Profissional</span>
          <select class="cfg-input" name="professionalId">
            <option value="">Todos</option>
            ${professionals.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </label>
        <label class="cfg-field">
          <span>Servico</span>
          <select class="cfg-input" name="serviceId">
            <option value="">Todos</option>
            ${services.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </label>
        <label class="cfg-field">
          <span>Tipo</span>
          <select class="cfg-input" name="type">
            ${option("PERCENTAGE", "Percentual", true)}
            ${option("FIXED", "Fixo", false)}
          </select>
        </label>
        <label class="cfg-field">
          <span>Valor</span>
          <input class="cfg-input" name="value" type="number" min="0" step="0.01" required placeholder="0" />
        </label>
        <div class="cfg-field-action">
          ${renderPrimaryAction({ label: "Criar regra", type: "submit" })}
        </div>
      </form>
    </details>
  `;
}

function renderScheduleForm(business = {}) {
  return `
    <form id="settingsScheduleForm" class="cfg-form">
      <div class="cfg-grid">
        <label class="cfg-field">
          <span>Duracao padrao (min)</span>
          <input class="cfg-input" type="number" name="defaultAppointmentDuration" min="1" step="1" value="${escapeHtml(toNumber(business.defaultAppointmentDuration, 45).toString())}" />
        </label>
        <label class="cfg-field">
          <span>Antecedencia minima (min)</span>
          <input class="cfg-input" type="number" name="minimumAdvanceMinutes" min="0" step="1" value="${escapeHtml(toNumber(business.minimumAdvanceMinutes, 30).toString())}" />
        </label>
        <label class="cfg-field">
          <span>Buffer entre atendimentos (min)</span>
          <input class="cfg-input" type="number" name="bufferBetweenAppointmentsMinutes" min="0" step="1" value="${escapeHtml(toNumber(business.bufferBetweenAppointmentsMinutes, 0).toString())}" />
        </label>
      </div>
      <div class="cfg-checks">
        <label class="cfg-check"><input type="checkbox" name="allowWalkIns" ${checked(business.allowWalkIns)} /> Permitir encaixes</label>
        <label class="cfg-check"><input type="checkbox" name="allowOutOfHoursAppointments" ${checked(business.allowOutOfHoursAppointments)} /> Permitir fora do horario</label>
        <label class="cfg-check"><input type="checkbox" name="allowOverbooking" ${checked(business.allowOverbooking)} /> Permitir sobreposicao excepcional</label>
      </div>
      <div class="cfg-actions">
        ${renderPrimaryAction({ label: "Salvar preferencias de agenda", type: "submit" })}
      </div>
    </form>
  `;
}

function renderOperationsForm(business = {}) {
  return `
    <form id="settingsOperationsForm" class="cfg-form">
      <div class="cfg-grid">
        <label class="cfg-field">
          <span>Lembrete antes do horario (min)</span>
          <input class="cfg-input" type="number" name="reminderLeadMinutes" min="0" step="1" value="${escapeHtml(toNumber(business.reminderLeadMinutes, 60).toString())}" />
        </label>
        <label class="cfg-field">
          <span>Cliente em risco apos (dias)</span>
          <input class="cfg-input" type="number" name="atRiskCustomerDays" min="1" step="1" value="${escapeHtml(toNumber(business.atRiskCustomerDays, 30).toString())}" />
        </label>
        <label class="cfg-field">
          <span>Cliente inativo apos (dias)</span>
          <input class="cfg-input" type="number" name="inactiveCustomerDays" min="1" step="1" value="${escapeHtml(toNumber(business.inactiveCustomerDays, 60).toString())}" />
        </label>
      </div>
      <div class="cfg-checks">
        <label class="cfg-check"><input type="checkbox" name="sendAppointmentReminders" ${checked(business.sendAppointmentReminders)} /> Enviar lembretes</label>
      </div>
      <div class="cfg-actions">
        ${renderPrimaryAction({ label: "Salvar parametros", type: "submit" })}
      </div>
    </form>
  `;
}

function renderUserForm(business = {}, security = {}) {
  const themeMode = String(business.themeMode || "system");
  const email = escapeHtml(security.currentSession?.email || "—");
  const role = escapeHtml(accessLabel(security.currentSession?.role || "owner"));

  return `
    <form id="settingsUserForm" class="cfg-form">

      <div class="cfg-user-block">
        <p class="cfg-block-label">Perfil</p>
        <div class="cfg-grid">
          <label class="cfg-field cfg-field-wide">
            <span>Nome exibido</span>
            <input class="cfg-input" name="displayName" value="${escapeHtml(business.displayName || business.businessName || "")}" placeholder="Como voce quer ser chamado" />
          </label>
        </div>
        <div class="cfg-user-info-row">
          <div class="cfg-user-info-item">
            <span>E-mail</span>
            <strong>${email}</strong>
          </div>
          <div class="cfg-user-info-item">
            <span>Perfil de acesso</span>
            <strong>${role}</strong>
          </div>
        </div>
      </div>

      <div class="cfg-user-block">
        <p class="cfg-block-label">Aparencia</p>
        <label class="cfg-field">
          <span>Tema</span>
          <select class="cfg-input" name="themeMode" data-theme-select>
            ${option("system", "Sistema", themeMode === "system")}
            ${option("light", "Claro", themeMode === "light")}
            ${option("dark", "Escuro", themeMode === "dark")}
          </select>
        </label>
      </div>

      <div class="cfg-user-block">
        <p class="cfg-block-label">Seguranca</p>
        <div class="cfg-security-placeholder">
          <span class="cfg-security-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <div>
            <strong>Alteracao de senha</strong>
            <span>Em desenvolvimento. Disponivel em breve.</span>
          </div>
        </div>
      </div>

      <div class="cfg-actions">
        ${renderPrimaryAction({ label: "Salvar configuracoes", type: "submit" })}
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
      summary: `<dl class="op-summary-grid">${field("Metodos ativos", `${paymentMethods.filter((item) => item.isActive).length} metodo(s)`)}${field("Padrao", paymentMethods.find((item) => item.isDefault)?.name || "Sem metodo padrao")}${field("Total cadastrado", `${paymentMethods.length} metodo(s)`)}</dl>`,
      details: `<div class="settings-editor-stack">${renderPaymentsForm()}${renderPaymentsList(paymentMethods)}</div>`,
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
      summary: `<dl class="op-summary-grid">${field("Membros ativos", `${teamMembers.filter((item) => item.isActive).length} membro(s)`)}${field("Perfis", [...new Set(teamMembers.map((item) => accessLabel(item.accessProfile)))].slice(0, 2).join(", ") || "Sem equipe")}${field("Total cadastrado", `${teamMembers.length} membro(s)`)}</dl>`,
      details: `<div class="settings-editor-stack">${renderTeamForm()}${renderTeamList(teamMembers)}</div>`,
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
      details: `${renderCommissionsForms(commissionRules, professionals, services, business)}<div class="ds-gap-top">${renderCommissionsList(commissionRules)}</div>`,
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
      summary: `<dl class="op-summary-grid">${field("Duracao padrao", `${toNumber(business.defaultAppointmentDuration, 45)} min`)}${field("Antecedencia minima", `${toNumber(business.minimumAdvanceMinutes, 30)} min`)}${field("Tempo entre atendimentos", `${toNumber(business.bufferBetweenAppointmentsMinutes, 0)} min`)}${field("Encaixes", business.allowWalkIns ? "Permitidos" : "Desativados")}</dl>`,
      details: renderScheduleForm(business),
      technicalTrace: renderBusinessTrace(business),
    },
    usuario: {
      title: "Configuracao do usuario",
      subtitle: "Perfil, aparencia e seguranca da conta.",
      status: "ACTIVE",
      summary: `<dl class="op-summary-grid">${field("E-mail", security.currentSession?.email)}${field("Perfil", accessLabel(security.currentSession?.role || "owner"))}${field("Tema", themeLabel(business.themeMode))}</dl>`,
      details: renderUserForm(business, security),
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

export function renderSettingsData(elements, payload = {}, context = {}, activeSection = "business") {
  renderSettingsDataWithSection(elements, payload, context, activeSection);
}

export function renderSettingsSidebar({ activeSection = "business", user = null, accountMenuOpen = false } = {}) {
  const selectedSection = SETTINGS_SECTIONS.some((section) => section.id === activeSection)
    ? activeSection
    : "business";
  const userName = String(user?.name || user?.displayName || user?.fullName || user?.email || "Usuario").split("@")[0];
  const userInitial = userName.charAt(0).toUpperCase() || "U";
  const menu = SETTINGS_GROUPS.flatMap((group) => group.sections)
    .map((sectionId) => {
      const section = SETTINGS_SECTIONS.find((item) => item.id === sectionId);
      if (!section) return "";
      const isActive = section.id === selectedSection;
      return `
        <button type="button" class="sb-item ${isActive ? "is-active" : ""}" data-settings-action="select-settings-section" data-settings-section="${escapeHtml(section.id)}" data-motion-item title="${escapeHtml(section.title)}">
          <span class="sb-item-icon" aria-hidden="true">${SETTINGS_ICONS[section.id] || ""}</span>
          <span class="sb-label">${escapeHtml(section.title)}</span>
        </button>
      `;
    })
    .join("");

  return `
    <div class="sidebar-wrap settings-sidebar-wrap">
      <div class="sb-brand" aria-label="LIDDO BARBER">
        <div class="sb-brand-inner">
          <span class="sb-brand-name">LIDDO</span>
          <span class="sb-brand-subtitle">BARBER</span>
        </div>
      </div>

      <div class="sb-scroll">
        <nav class="sb-nav" aria-label="Menu de configuracoes">
          <button type="button" class="sb-item settings-back-item" data-settings-shell-action="back" title="Voltar">
            <span class="sb-item-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            </span>
            <span class="sb-label">Voltar</span>
          </button>
          ${menu}
        </nav>
      </div>

      <div class="sb-footer">
        <div class="sb-account ${accountMenuOpen ? "is-open" : ""} is-active">
          <div class="sb-account-menu" aria-label="Menu do usuario">
            <button type="button" data-account-action="settings">
              <span class="sb-menu-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
              Configuracoes
            </button>
            <button type="button" data-account-action="user">
              <span class="sb-menu-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg></span>
              Usuario
            </button>
            <button type="button" data-account-action="logout">
              <span class="sb-menu-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
              Sair
            </button>
          </div>
          <button type="button" class="sb-user-card" title="${escapeHtml(userName)}" data-account-action="toggle" aria-expanded="${accountMenuOpen ? "true" : "false"}">
            <span class="sb-user-avatar" aria-hidden="true">
              <span class="sb-user-initial">${escapeHtml(userInitial)}</span>
            </span>
            <span class="sb-user-info">
              <span class="sb-user-name">${escapeHtml(userName || "Usuario")}</span>
              <span class="sb-user-subtitle">Conta e operacao</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsAdminLayout(payload = {}, context = {}, activeSection = "business") {
  const selectedSection = SETTINGS_SECTIONS.some((section) => section.id === activeSection)
    ? activeSection
    : "business";
  const content = sectionContent(selectedSection, payload, context);
  const currentMeta = SETTINGS_SECTIONS.find((section) => section.id === selectedSection) || SETTINGS_SECTIONS[0];

  return `
    <div class="settings-page" data-settings-screen data-motion-item>
      <header class="settings-page-head">
        <div>
          <p class="ux-label">${escapeHtml(currentMeta.title)}</p>
          <h2>${escapeHtml(content.title)}</h2>
          <span>${escapeHtml(content.subtitle)}</span>
        </div>
        ${renderStatusChip(content.status)}
      </header>
      <div class="settings-page-body" data-settings-panel data-settings-active-section="${escapeHtml(selectedSection)}">
        ${content.details || ""}
      </div>
    </div>
    <div id="settingsDrawerHost" class="hidden"></div>
  `;
}

export function renderSettingsDataWithSection(elements, payload = {}, context = {}, activeSection = "business") {
  if (!elements.root) return;
  elements.root.innerHTML = `
    ${renderSettingsAdminLayout(payload, context, activeSection)}
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
