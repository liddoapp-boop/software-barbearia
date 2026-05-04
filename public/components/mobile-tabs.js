export function renderMobileTabs({ tabs, activeTab, showMoreSheet, secondaryModules, activeModule }) {
  const tabsMarkup = tabs
    .map((tab) => {
      const active = tab.id === activeTab;
      return `
        <button type="button" data-mobile-tab="${tab.id}" class="mobile-tab-btn ${active ? "is-active" : ""}">
          ${tab.label}
        </button>
      `;
    })
    .join("");

  const moreMarkup = secondaryModules
    .map((module) => {
      const active = module.id === activeModule;
      return `
        <button type="button" data-mobile-module="${module.id}" class="mobile-more-item ${active ? "is-active" : ""}">
          ${module.label}
        </button>
      `;
    })
    .join("");

  return `
    <div class="mobile-tabs-shell ${showMoreSheet ? "show-more" : ""}">
      <div class="mobile-tabs-grid">${tabsMarkup}</div>
      ${showMoreSheet ? `<div class="mobile-more-sheet">${moreMarkup}</div>` : ""}
    </div>
  `;
}
