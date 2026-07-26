import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Liddo operational record surfaces", () => {
  it("loads the record layer after the existing identity layer", () => {
    const html = source("public/index.html");
    const identity = html.indexOf("/styles/liddo-identity.css");
    const records = html.indexOf("/styles/record-surfaces.css");

    expect(identity).toBeGreaterThanOrEqual(0);
    expect(records).toBeGreaterThan(identity);
  });

  it("marks the distinct operational record families without changing their action contracts", () => {
    const modules = {
      client: source("public/modules/clientes.js"),
      inventory: source("public/modules/estoque.js"),
      financial: source("public/modules/financeiro.js"),
      service: source("public/modules/servicos.js"),
      professional: source("public/modules/profissionais.js"),
      appointment: source("public/modules/agendamentos.js"),
      commission: source("public/modules/comissoes.js"),
      audit: source("public/modules/auditoria.js"),
    };

    for (const [family, moduleSource] of Object.entries(modules)) {
      expect(moduleSource).toContain(`data-record-surface="${family}"`);
    }

    expect(modules.client).toContain('data-clients-action="detail"');
    expect(modules.inventory).toContain('data-inventory-action="detail"');
    expect(modules.financial).toContain('data-financial-action="detail"');
    expect(modules.service).toContain('data-service-action="detail"');
    expect(modules.professional).toContain('data-professional-action="detail"');
    expect(modules.audit).toContain('data-audit-action="detail"');
    expect(source("public/app.js")).toContain('data-al-open="${item.id}"');
    expect(source("public/app.js")).toContain('data-record-surface="appointment"');
  });

  it("supports keyboard activation only on non-native record triggers", async () => {
    const { bindRecordSurfaceKeyboard } = await import(
      pathToFileURL(`${process.cwd()}/public/components/record-surfaces.js`).href
    );
    let listener: ((event: any) => void) | undefined;
    const root = {
      addEventListener: vi.fn((type: string, callback: (event: any) => void) => {
        if (type === "keydown") listener = callback;
      }),
    };
    const click = vi.fn();
    const trigger = {
      getAttribute: vi.fn(() => null),
      click,
    };
    const preventDefault = vi.fn();

    bindRecordSurfaceKeyboard(root as any);
    listener?.({
      key: "Enter",
      preventDefault,
      target: {
        closest: (selector: string) =>
          selector.includes("data-record-interactive") ? trigger : null,
      },
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("defines semantic module signatures, adaptive layouts and reduced motion", () => {
    const css = source("public/styles/record-surfaces.css");

    expect(css).toContain("#clientsSection .cl-row");
    expect(css).toContain(".inv-row-critical");
    expect(css).toContain("#financeiroSection .fn-row-income");
    expect(css).toContain("#financeiroSection .fn-row-expense");
    expect(css).toContain("#servicesSection .svc-row-price");
    expect(css).toContain("#professionalsSection .team-metric");
    expect(css).toContain("#auditSection .aud-timeline::before");
    expect(css).toContain("#agendaListMode .al-card");
    expect(css).toContain(".commission-professional-group");
    expect(css).toContain(".reports-detail-row");
    expect(css).toContain(".cfg-list-row");
    expect(css).toContain("@media (max-width: 820px)");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
