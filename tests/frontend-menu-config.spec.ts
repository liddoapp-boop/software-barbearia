import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

type MenuModule = { id: string };
type MenuGroup = { modules: MenuModule[] };

async function loadMenuConfig() {
  return await import(`${pathToFileURL(`${process.cwd()}/public/components/menu-config.js`).href}?v=${Date.now()}-${Math.random()}`);
}

describe("frontend menu role access", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { AI_ASSISTANT_PANEL_ENABLED?: unknown }).AI_ASSISTANT_PANEL_ENABLED;
  });

  it("oculta Atendente IA do owner por padrao", async () => {
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

  it("mostra Atendente IA para owner quando AI_ASSISTANT_PANEL_ENABLED=true", async () => {
    (globalThis as typeof globalThis & { AI_ASSISTANT_PANEL_ENABLED?: unknown }).AI_ASSISTANT_PANEL_ENABLED = "true";
    const { getAllowedModulesForRole, filterMenuGroupsByRole, MENU_GROUPS } = await loadMenuConfig();
    expect(getAllowedModulesForRole("owner")).toEqual(
      ["agenda", "clientes", "financeiro", "estoque", "atendente-ia", "configuracoes", "servicos", "auditoria"],
    );
    const visibleModules = filterMenuGroupsByRole(MENU_GROUPS, "owner").flatMap((group: MenuGroup) =>
      group.modules.map((module: MenuModule) => module.id),
    );
    expect(visibleModules).toContain("atendente-ia");
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

  it.each([undefined, null, "", "admin", "OWNER", " owner ", { role: "owner" }])(
    "falha fechado para papel ausente, desconhecido ou adulterado: %s",
    async (role) => {
      const { getAllowedModulesForRole, filterMenuGroupsByRole, MENU_GROUPS, getDefaultModuleForRole } = await loadMenuConfig();
      expect(getAllowedModulesForRole(role)).toEqual([]);
      expect(filterMenuGroupsByRole(MENU_GROUPS, role)).toEqual([]);
      expect(getDefaultModuleForRole(role)).toBeNull();
    },
  );
});
