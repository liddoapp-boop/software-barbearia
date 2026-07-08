import { escapeHtml } from "../modules/sanitize.js";

export function renderTopbar({ moduleLabel }) {
  return `
    <div class="topbar-wrap">
      <div class="topbar-main">
        <p class="topbar-breadcrumb" id="topbarBreadcrumb">Liddo / Barbearia Geovane Borges</p>
        <p class="topbar-title">Operacao em andamento</p>
        <p class="topbar-subtitle">Tela atual: <strong>${escapeHtml(moduleLabel)}</strong></p>
      </div>
      <div class="topbar-meta">
        <span id="todayLabel"></span>
      </div>
    </div>
  `;
}
