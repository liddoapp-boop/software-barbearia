import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type MenuModule = { id: string };
type MenuGroup = { modules: MenuModule[] };

async function loadMenuConfig() {
  return await import(pathToFileURL(`${process.cwd()}/public/components/menu-config.js`).href);
}

describe("frontend menu role access", () => {
  it("mantem owner com modulos administrativos", async () => {
    const { getAllowedModulesForRole } = await loadMenuConfig();
    expect(getAllowedModulesForRole("owner")).toEqual(
      expect.arrayContaining(["financeiro", "auditoria", "configuracoes", "relatorios", "comissoes"]),
    );
  });

  it("limita recepcao a operacao sem modulos sensiveis", async () => {
    const { getAllowedModulesForRole, filterMenuGroupsByRole, MENU_GROUPS } = await loadMenuConfig();
    const allowed = getAllowedModulesForRole("recepcao");
    expect(allowed).toEqual(["agenda", "operacao", "clientes"]);
    expect(allowed).not.toEqual(expect.arrayContaining(["financeiro", "auditoria", "configuracoes", "relatorios", "comissoes"]));

    const visibleModules = filterMenuGroupsByRole(MENU_GROUPS, "recepcao").flatMap((group: MenuGroup) =>
      group.modules.map((module: MenuModule) => module.id),
    );
    expect(visibleModules).toEqual(["agenda", "operacao", "clientes"]);
  });

  it("limita profissional a agenda e clientes", async () => {
    const { getAllowedModulesForRole, filterMenuGroupsByRole, MENU_GROUPS } = await loadMenuConfig();
    const allowed = getAllowedModulesForRole("profissional");
    expect(allowed).toEqual(["agenda", "clientes"]);
    expect(allowed).not.toEqual(expect.arrayContaining(["operacao", "financeiro", "auditoria", "configuracoes", "relatorios", "comissoes"]));

    const visibleModules = filterMenuGroupsByRole(MENU_GROUPS, "profissional").flatMap((group: MenuGroup) =>
      group.modules.map((module: MenuModule) => module.id),
    );
    expect(visibleModules).toEqual(["agenda", "clientes"]);
  });
});
