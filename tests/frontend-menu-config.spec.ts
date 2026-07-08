import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type MenuModule = { id: string };
type MenuGroup = { modules: MenuModule[] };

async function loadMenuConfig() {
  return await import(pathToFileURL(`${process.cwd()}/public/components/menu-config.js`).href);
}

describe("frontend menu role access", () => {
  it("mantem owner com superficie principal simplificada", async () => {
    const { getAllowedModulesForRole, filterMenuGroupsByRole, MENU_GROUPS, HIDDEN_OWNER_MODULES } = await loadMenuConfig();
    expect(getAllowedModulesForRole("owner")).toEqual(
      ["agenda", "clientes", "financeiro", "estoque", "configuracoes", "servicos", "auditoria"],
    );
    const visibleModules = filterMenuGroupsByRole(MENU_GROUPS, "owner").flatMap((group: MenuGroup) =>
      group.modules.map((module: MenuModule) => module.id),
    );
    expect(visibleModules).toEqual(["agenda", "clientes", "financeiro", "estoque", "configuracoes", "servicos", "auditoria"]);
    expect(HIDDEN_OWNER_MODULES).toEqual(
      expect.arrayContaining(["operacao", "profissionais", "comissoes", "metas", "fidelizacao", "automacoes", "relatorios", "whatsapp", "agendamento-link"]),
    );
  });

  it("limita recepcao a agenda e clientes sem modulos sensiveis", async () => {
    const { getAllowedModulesForRole, filterMenuGroupsByRole, MENU_GROUPS } = await loadMenuConfig();
    const allowed = getAllowedModulesForRole("recepcao");
    expect(allowed).toEqual(["agenda", "clientes"]);
    expect(allowed).not.toEqual(expect.arrayContaining(["financeiro", "auditoria", "configuracoes", "relatorios"]));

    const visibleModules = filterMenuGroupsByRole(MENU_GROUPS, "recepcao").flatMap((group: MenuGroup) =>
      group.modules.map((module: MenuModule) => module.id),
    );
    expect(visibleModules).toEqual(["agenda", "clientes"]);
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
