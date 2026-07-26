const MODULE_ICONS = {
  agenda:            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 7.5h14v11H5z"/><path d="M8 4.5v5M16 4.5v5M5 11h14"/><path d="M9 14h2M13 14h2M9 16.5h2"/></svg>`,
  operacao:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  clientes:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="10" cy="8" r="3.5"/><path d="M4.5 19c.6-3.4 2.4-5 5.5-5s4.9 1.6 5.5 5"/><path d="M16 7.5h3.5M17.75 5.75v3.5M17 14.5h3"/></svg>`,
  financeiro:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 18.5V12M9.5 18.5V8M14 18.5v-4M18.5 18.5V5"/><path d="M4 18.5h16M5 8l4.5-3 4.5 4 5-5"/></svg>`,
  profissionais:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21a8 8 0 0 0-16 0"/><circle cx="9" cy="7" r="4"/><path d="M23 21a8 8 0 0 0-5.4-7.5"/><circle cx="19" cy="5" r="3"/></svg>`,
  servicos:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 6.5h14M7 6.5v3a5 5 0 0 0 10 0v-3M12 14.5v5M8.5 19.5h7"/><path d="M9.5 4h5"/></svg>`,
  auditoria:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 4.5h9l3 3v12H6z"/><path d="M15 4.5v3h3M9 11h6M9 14h6M9 17h3"/><path d="m8.5 7.5.8.8 1.7-2"/></svg>`,
  whatsapp:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  "agendamento-link":`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  relatorios:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  comissoes:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  metas:             `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  fidelizacao:       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  automacoes:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  estoque:           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 8 7-3.5L19 8v9l-7 3.5L5 17z"/><path d="m5 8 7 3.5L19 8M12 11.5v9M8.5 6.2l7 3.5"/></svg>`,
  configuracoes:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 0 1 22.4 6.1l-.06.06A1.65 1.65 0 0 0 22 7.98a1.65 1.65 0 0 0 1.51 1H24a2 2 0 0 1 0 4h-.49a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  "atendente-ia":    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 6.5h14v10H9l-4 3z"/><path d="M8.5 10.5h7M8.5 13.5H13"/><path d="M16.5 4v5M14 6.5h5"/></svg>`,
};

const ICON_SETTINGS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

const ICON_USER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;

const ICON_LOGOUT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
const ADMIN_MODULE_IDS = new Set(["configuracoes", "auditoria"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getUserDisplayName(user) {
  const explicitName = user?.name || user?.displayName || user?.fullName;
  if (!explicitName && user?.role === "owner") return "Geovane Borges";
  const rawName = explicitName || user?.email || "Usuário";
  const emailName = String(rawName).includes("@") ? String(rawName).split("@")[0] : rawName;
  return String(emailName || "Usuário").trim();
}

function getUserRoleLabel(user) {
  const labels = {
    owner: "Proprietário",
    recepcao: "Recepção",
    profissional: "Profissional",
  };
  return labels[user?.role] || "Perfil da operação";
}

export function renderSidebar({
  groups,
  activeModule,
  badges = {},
  user = null,
  accountMenuOpen = false,
  canOpenSettings = true,
  operationName = "Barbearia Geovane Borges",
}) {
  const modules = groups.flatMap((group) => group.modules);
  const primaryModules = modules.filter((module) => !ADMIN_MODULE_IDS.has(module.id));
  const administrativeModules = modules.filter((module) => ADMIN_MODULE_IDS.has(module.id));
  const userName = getUserDisplayName(user);
  const userRole = getUserRoleLabel(user);
  const userInitial = userName.charAt(0).toUpperCase() || "U";
  const accountMenuMarkup = canOpenSettings
    ? `
            <button type="button" data-account-action="settings">
              <span class="sb-menu-icon" aria-hidden="true">${ICON_SETTINGS}</span>
              Configurações
            </button>
            <button type="button" data-account-action="user">
              <span class="sb-menu-icon" aria-hidden="true">${ICON_USER}</span>
              Usuário
            </button>
            <button type="button" data-account-action="logout">
              <span class="sb-menu-icon" aria-hidden="true">${ICON_LOGOUT}</span>
              Sair
            </button>
    `
    : `
            <button type="button" data-account-action="logout">
              <span class="sb-menu-icon" aria-hidden="true">${ICON_LOGOUT}</span>
              Sair
            </button>
    `;

  const renderItems = (items, namespace = "") => items
    .map((module, index) => {
      const active = module.id === activeModule;
      const badgeValue = Number(badges[module.id] || 0);
      const showBadge = Number.isFinite(badgeValue) && badgeValue > 0;
      const icon = MODULE_ICONS[module.id] || "";
      const itemIndex = `${namespace}${String(index + 1).padStart(2, "0")}`;
      return `
        <button type="button" class="sb-item ${active ? "is-active" : ""}" data-sidebar-module="${escapeHtml(module.id)}" title="${escapeHtml(module.label)}">
          <span class="sb-item-index" aria-hidden="true">${itemIndex}</span>
          ${icon ? `<span class="sb-item-icon" aria-hidden="true">${icon}</span>` : ""}
          <span class="sb-label">${escapeHtml(module.label)}</span>
          ${showBadge ? `<span class="sb-badge">${badgeValue}</span>` : ""}
          <span class="sb-item-terminus" aria-hidden="true"></span>
        </button>
      `;
    })
    .join("");
  const primaryItemsMarkup = renderItems(primaryModules);
  const administrativeItemsMarkup = renderItems(administrativeModules, "A");

  return `
    <div class="sidebar-wrap">
      <div class="sb-brand" aria-label="Liddo System">
        <span class="sb-brand-axis" aria-hidden="true"></span>
        <div class="sb-brand-inner">
          <span class="sb-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M8.5 5v18.2a3.8 3.8 0 0 0 3.8 3.8H24" />
              <path d="M12.5 5v15.5a2 2 0 0 0 2 2H24" />
              <path d="M8 10h5M8 16h5" />
            </svg>
          </span>
          <span class="sb-brand-copy">
            <span class="sb-brand-kicker">LIDDO / BARBER OS</span>
            <span class="sb-brand-name">Liddo System</span>
            <span class="sb-brand-signature">Gestão de excelência</span>
          </span>
          <span class="sb-brand-edition" aria-hidden="true">01—26</span>
        </div>
        <div class="sb-operation" aria-label="Estabelecimento atual">
          <span class="sb-operation-label"><i aria-hidden="true"></i> Estabelecimento</span>
          <strong>${escapeHtml(operationName || "Barbearia Geovane Borges")}</strong>
        </div>
      </div>

      <div class="sb-scroll">
        <nav class="sb-nav" aria-label="Menu principal">
          <span class="sb-active-indicator" aria-hidden="true"></span>
          <div class="sb-nav-section sb-nav-primary" data-sidebar-area="primary" aria-label="Navegação principal">
            ${primaryItemsMarkup}
          </div>
          ${administrativeModules.length ? `
            <div class="sb-nav-section sb-nav-administrative" data-sidebar-area="administrative" aria-label="Administração">
              ${administrativeItemsMarkup}
            </div>
          ` : ""}
        </nav>
      </div>

      <div class="sb-footer">
        <div class="sb-account ${accountMenuOpen ? "is-open" : ""} ${activeModule === "configuracoes" ? "is-active" : ""}">
          <div class="sb-account-menu" aria-label="Menu do usuario">
            ${accountMenuMarkup}
          </div>
          <button type="button" class="sb-user-card" title="${escapeHtml(userName)}" data-account-action="toggle" aria-expanded="${accountMenuOpen ? "true" : "false"}">
            <span class="sb-user-avatar" aria-hidden="true">
              <span class="sb-user-initial">${escapeHtml(userInitial)}</span>
            </span>
            <span class="sb-user-info">
              <span class="sb-user-name">${escapeHtml(userName)}</span>
              <span class="sb-user-subtitle">${escapeHtml(userRole)}</span>
            </span>
            <span class="sb-account-chevron" aria-hidden="true">
              <svg viewBox="0 0 16 16"><path d="m5 6 3 3 3-3"/></svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
}
