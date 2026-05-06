export const MENU_GROUPS = [
  {
    id: "operacao",
    label: "Operacao",
    modules: [
      { id: "agenda", label: "Agenda" },
      { id: "operacao", label: "PDV (Produtos)" },
      { id: "clientes", label: "Clientes" },
      { id: "servicos", label: "Servicos" },
      { id: "estoque", label: "Estoque" },
    ],
  },
  {
    id: "gestao",
    label: "Gestao",
    modules: [
      { id: "dashboard", label: "Dashboard" },
      { id: "financeiro", label: "Financeiro" },
      { id: "profissionais", label: "Profissionais" },
      { id: "comissoes", label: "Comissoes" },
      { id: "metas", label: "Metas" },
    ],
  },
  {
    id: "administracao",
    label: "Administracao",
    modules: [
      { id: "auditoria", label: "Auditoria" },
      { id: "configuracoes", label: "Configuracoes" },
    ],
  },
  {
    id: "avancado",
    label: "Avancado",
    modules: [
      { id: "fidelizacao", label: "Fidelizacao" },
      { id: "automacoes", label: "Automacoes" },
      { id: "relatorios", label: "Relatorios" },
    ],
  },
];

export const ROLE_ACCESS = {
  owner: MENU_GROUPS.flatMap((group) => group.modules).map((module) => module.id),
  recepcao: [
    "agenda",
    "operacao",
    "clientes",
    "servicos",
    "estoque",
    "dashboard",
  ],
  profissional: ["agenda", "dashboard"],
};

export const ROLE_DEFAULT_MODULE = {
  owner: "agenda",
  recepcao: "agenda",
  profissional: "agenda",
};

export function getDefaultModuleForRole(role) {
  return ROLE_DEFAULT_MODULE[role] || "dashboard";
}

export function getAllowedModulesForRole(role) {
  return ROLE_ACCESS[role] || ROLE_ACCESS.owner;
}

export function filterMenuGroupsByRole(groups, role) {
  const allowed = new Set(getAllowedModulesForRole(role));
  return groups
    .map((group) => ({
      ...group,
      modules: group.modules.filter((module) => allowed.has(module.id)),
    }))
    .filter((group) => group.modules.length > 0);
}

export const QUICK_ACTIONS = [
  { id: "novo-agendamento", label: "Novo Agendamento", moduleId: "agenda" },
  { id: "registrar-venda", label: "Registrar Venda", moduleId: "operacao" },
];

export const MOBILE_TABS = [
  { id: "inicio", label: "Inicio", moduleId: "dashboard" },
  { id: "agenda", label: "Agenda", moduleId: "agenda" },
  { id: "operacao", label: "PDV", moduleId: "operacao" },
  { id: "mais", label: "Mais", moduleId: null },
];

export const SECONDARY_MODULE_IDS = [
  "clientes",
  "servicos",
  "estoque",
  "financeiro",
  "profissionais",
  "comissoes",
  "metas",
  "auditoria",
  "configuracoes",
  "fidelizacao",
  "automacoes",
  "relatorios",
];

const MODULE_MAP = new Map(
  MENU_GROUPS.flatMap((group) => group.modules).map((item) => [item.id, item]),
);

export function getModuleMeta(moduleId) {
  return MODULE_MAP.get(moduleId) || { id: moduleId, label: "Modulo" };
}

export function getModuleLabel(moduleId) {
  return getModuleMeta(moduleId).label;
}

export function isSecondaryModule(moduleId) {
  return SECONDARY_MODULE_IDS.includes(moduleId);
}

export function mapModuleToMobileTab(moduleId) {
  if (moduleId === "dashboard") return "inicio";
  if (moduleId === "agenda") return "agenda";
  if (moduleId === "operacao") return "operacao";
  return "mais";
}
