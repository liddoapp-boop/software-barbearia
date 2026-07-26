import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("correcoes visuais estruturais", () => {
  it("usa cabecalho compartilhado sem numeracao e com colunas flexiveis", () => {
    const component = source("public/components/operational-ui.js");
    const settings = source("public/modules/configuracoes.js");
    const identity = source("public/styles/liddo-identity.css");
    const header = source("public/styles/header-surface.css");
    const density = source("public/styles/mobile-density.css");
    const layout = source("public/styles/layout.css");
    const index = source("public/index.html");
    const effectiveMobileHeaderStyles = `${layout}\n${density}`;

    expect(component).not.toContain("op-header-coordinate");
    expect(component).not.toContain("op-header-title-index");
    expect(settings).not.toContain("op-header-coordinate");
    expect(settings).not.toContain("op-header-title-index");
    expect(identity).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, max-content) minmax(0, max-content)",
    );
    expect(header).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, max-content) minmax(0, max-content)",
    );
    expect(header).toContain("max-width: none !important");
    expect(header).toContain("#appContent .op-header-link-rail");
    expect(header).toContain("#appContent .op-header-focus::after");
    expect(index.indexOf('/styles/mobile-density.css')).toBeGreaterThan(index.indexOf('/styles/layout.css'));
    expect(effectiveMobileHeaderStyles).toMatch(
      /#appContent \.op-header-context-row\s*,\s*#appContent \.op-header-layout\s*\{\s*grid-column:\s*1 !important;/,
    );
    expect(density).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*#appContent \.op-header-context-row\s*\{\s*display:\s*none !important;/,
    );
    expect(layout).not.toContain("#appContent .op-page-header-main,\n  #appContent .settings-page-head > div");
  });

  it("remove contadores decorativos e o espaco reservado nos instrumentos", () => {
    const identity = source("public/styles/liddo-identity.css");
    const commerce = source("public/styles/commerce-surfaces.css");
    const index = source("public/index.html");
    const app = source("public/app.js");

    expect(identity).not.toContain("counter-reset: liddo-instrument");
    expect(identity).not.toContain("counter-increment: liddo-instrument");
    expect(identity).not.toContain('content: "0" counter(liddo-instrument)');
    expect(identity).toContain("padding: 20px 18px 16px !important");
    expect(index).not.toContain("commerce-zone-index");
    expect(app).not.toContain("commerce-zone-index");
    expect(commerce).not.toContain(".commerce-zone-index");
  });

  it("mantem autocomplete ancorado, acessivel e navegavel por teclado", () => {
    const app = source("public/app.js");
    const css = source("public/styles/interaction-surfaces.css");

    expect(app).toContain('role", "combobox"');
    expect(app).toContain('aria-autocomplete", "list"');
    expect(app).toContain('event.key === "ArrowDown" || event.key === "ArrowUp"');
    expect(app).toContain('event.key === "Enter"');
    expect(app).toContain('event.key === "Escape"');
    expect(app).toContain("Nenhum cliente encontrado.");
    expect(css).toContain("#scheduleDrawer .client-search-dropdown");
    expect(css).toContain("max-height: min(280px, 42vh)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) auto");
  });

  it("coloca o link somente em Configuracoes Canais e remove Venda de Estoque", () => {
    const index = source("public/index.html");
    const settings = source("public/modules/configuracoes.js");
    const app = source("public/app.js");
    const inventoryHeader = app.slice(
      app.indexOf("const inventoryHeaderMount"),
      app.indexOf("const inventoryFilterMount"),
    );

    expect(index).not.toContain("agendamento-linkSection");
    expect(index).not.toContain('id="bookingLinkOpen"');
    expect(settings).toContain('{ id: "channels", title: "Canais"');
    expect(settings).toContain('id="bookingLinkOpen"');
    expect(settings).toContain('id="copyBookingLink"');
    expect(app).not.toContain('"agendamento-link": document.getElementById');
    expect(inventoryHeader).not.toContain('data-pdv-target="operacao"');
    expect(inventoryHeader).not.toContain("secondaryActions");
  });

  it("padroniza destaques monetarios sem separar simbolo e valor", () => {
    const identity = source("public/styles/liddo-identity.css");
    const interaction = source("public/styles/interaction-surfaces.css");
    const commerce = source("public/styles/commerce-surfaces.css");
    const app = source("public/app.js");
    const agenda = source("public/modules/agenda.js");
    const pdv = source("public/modules/pdv.js");
    const combined = `${identity}\n${interaction}\n${commerce}`;

    expect(identity).toContain('data-kpi-kind="monetary"');
    expect(combined).toContain("font-variant-numeric: tabular-nums");
    expect(combined).toContain("white-space: nowrap");
    expect(commerce).toContain("#operationSection .pdv-mkt-cart-total .pdv-total-value");
    expect(commerce).toContain("#appointmentCheckoutModal .checkout-total-panel strong");
    expect(commerce).not.toMatch(
      /(?:pdv-total-value|checkout-total-panel strong)[\s\S]{0,180}font-family:\s*Georgia/,
    );
    expect(`${app}\n${agenda}\n${pdv}`).not.toMatch(/R\$\s*\$\{[^}]*toFixed\(2\)/);
    expect(agenda).toContain('style: "currency"');
    expect(pdv).toContain('currency: "BRL"');
  });
});
