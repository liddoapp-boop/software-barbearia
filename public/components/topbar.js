export function renderTopbar({ moduleLabel }) {
  const now = new Date();
  const dayLabel = now.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const hourLabel = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `
    <div class="topbar-wrap">
      <div class="topbar-main">
        <p class="topbar-breadcrumb" id="topbarBreadcrumb">Software Barbearia / Operacao assistida</p>
        <p class="topbar-title">${moduleLabel}</p>
        <p class="topbar-subtitle">Modulo atual: <strong>${moduleLabel}</strong></p>
      </div>
      <div class="topbar-side">
        <div class="topbar-clock">
          <span class="topbar-clock-day">${dayLabel}</span>
          <span class="topbar-clock-hour">${hourLabel}</span>
        </div>
        <div class="topbar-meta">
          <span id="todayLabel"></span>
        </div>
      </div>
    </div>
  `;
}
