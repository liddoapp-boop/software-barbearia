export function renderTopbar({ moduleLabel }) {
  return `
    <div class="topbar-wrap">
      <div class="topbar-main">
        <p class="topbar-breadcrumb" id="topbarBreadcrumb">Inicio / ${moduleLabel}</p>
        <h1 class="topbar-title">${moduleLabel}</h1>
        <p id="todayLabel" class="topbar-subtitle"></p>
      </div>
    </div>
  `;
}
