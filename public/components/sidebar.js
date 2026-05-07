export function renderSidebar({ groups, activeModule, collapsed, badges = {}, role = "owner" }) {
  const roleLabelMap = {
    owner: "Owner",
    recepcao: "Recepcao",
    profissional: "Profissional",
  };
  const roleLabel = roleLabelMap[role] || "Owner";

  const groupMarkup = groups
    .map((group) => {
      const modules = group.modules
        .map((module) => {
          const active = module.id === activeModule;
          const badgeValue = Number(badges[module.id] || 0);
          const showBadge = Number.isFinite(badgeValue) && badgeValue > 0;
          const buttonClass = active
            ? "sb-item is-active"
            : "sb-item";
          return `
            <button type="button" class="${buttonClass}" data-sidebar-module="${module.id}" title="${module.label}">
              <span class="sb-dot" aria-hidden="true"></span>
              <span class="sb-label">${module.label}</span>
              ${showBadge ? `<span class="sb-badge">${badgeValue}</span>` : ""}
            </button>
          `;
        })
        .join("");

      return `
        <section class="sb-group">
          <p class="sb-group-title">${group.label}</p>
          <div class="sb-items">${modules}</div>
        </section>
      `;
    })
    .join("");

  return `
    <div class="sidebar-wrap ${collapsed ? "is-collapsed" : ""}">
      <div class="sb-header">
        <div class="sb-brand">
          <p class="sb-kicker">Software Barbearia</p>
          <strong class="sb-title">Hub Operacional Premium</strong>
          <span class="sb-role-chip">Perfil ${roleLabel}</span>
          <div class="sb-brand-line" aria-hidden="true"></div>
        </div>
        <div class="sb-tools">
          <label class="sb-role-wrap" for="globalRoleSelect">
            <span class="sb-role-label">Perfil</span>
            <select id="globalRoleSelect">
              <option value="owner" ${role === "owner" ? "selected" : ""}>Dono</option>
              <option value="recepcao" ${role === "recepcao" ? "selected" : ""}>Recepcao</option>
              <option value="profissional" ${role === "profissional" ? "selected" : ""}>Profissional</option>
            </select>
          </label>
          <button type="button" class="sb-collapse-btn" data-sidebar-toggle>
            ${collapsed ? ">" : "<"}
          </button>
        </div>
      </div>
      <div class="sb-scroll">${groupMarkup}</div>
    </div>
  `;
}
