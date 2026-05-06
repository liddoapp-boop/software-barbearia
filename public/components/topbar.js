export function renderTopbar({ moduleLabel }) {
  return `
    <div class="topbar-wrap">
      <div class="topbar-main">
        <p class="topbar-breadcrumb" id="topbarBreadcrumb">Software Barbearia / Operacao assistida</p>
        <p class="topbar-title">Visao operacional ativa</p>
        <p class="topbar-subtitle">Modulo atual: <strong>${moduleLabel}</strong></p>
      </div>
      <div class="topbar-meta">
        <span id="todayLabel"></span>
      </div>
    </div>
  `;
}
