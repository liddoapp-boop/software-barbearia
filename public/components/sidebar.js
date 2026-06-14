const MODULE_ICONS = {
  agenda:            `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  operacao:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  clientes:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21a8 8 0 0 0-16 0"/><circle cx="9" cy="7" r="4"/><path d="M23 21a8 8 0 0 0-5.4-7.5"/><circle cx="19" cy="5" r="3"/></svg>`,
  financeiro:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  profissionais:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21a8 8 0 0 0-16 0"/><circle cx="9" cy="7" r="4"/><path d="M23 21a8 8 0 0 0-5.4-7.5"/><circle cx="19" cy="5" r="3"/></svg>`,
  servicos:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9c0 3.314 2.686 6 6 6s6-2.686 6-6"/><path d="M3 9h18"/><path d="M12 3v6"/><path d="M8 21h8"/><path d="M12 15v6"/></svg>`,
  auditoria:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  whatsapp:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  "agendamento-link":`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  relatorios:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  comissoes:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  metas:             `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  fidelizacao:       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  automacoes:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  estoque:           `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
};

const ICON_SETTINGS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

const ICON_USER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;

const ICON_LOGOUT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getUserDisplayName(user) {
  const rawName = user?.name || user?.displayName || user?.fullName || user?.email || "Usuário";
  const emailName = String(rawName).includes("@") ? String(rawName).split("@")[0] : rawName;
  return String(emailName || "Usuário").trim();
}

export function renderSidebar({
  groups,
  activeModule,
  badges = {},
  user = null,
  accountMenuOpen = false,
  canOpenSettings = true,
}) {
  const modules = groups.flatMap((group) => group.modules);
  const userName = getUserDisplayName(user);
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

  const itemsMarkup = modules
    .map((module) => {
      const active = module.id === activeModule;
      const badgeValue = Number(badges[module.id] || 0);
      const showBadge = Number.isFinite(badgeValue) && badgeValue > 0;
      const icon = MODULE_ICONS[module.id] || "";
      return `
        <button type="button" class="sb-item ${active ? "is-active" : ""}" data-sidebar-module="${escapeHtml(module.id)}" title="${escapeHtml(module.label)}">
          ${icon ? `<span class="sb-item-icon" aria-hidden="true">${icon}</span>` : ""}
          <span class="sb-label">${escapeHtml(module.label)}</span>
          ${showBadge ? `<span class="sb-badge">${badgeValue}</span>` : ""}
        </button>
      `;
    })
    .join("");

  return `
    <div class="sidebar-wrap">
      <div class="sb-brand" aria-label="LIDDO BARBER">
        <div class="sb-brand-inner">
          <span class="sb-brand-name">LIDDO</span>
          <span class="sb-brand-subtitle">BARBER</span>
        </div>
      </div>

      <div class="sb-scroll">
        <nav class="sb-nav" aria-label="Menu principal">
          ${itemsMarkup}
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
              <span class="sb-user-subtitle">Conta e operação</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  `;
}
