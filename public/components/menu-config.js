export const MENU_GROUPS = [
  {
    id: "operacao",
    label: "Operacao",
    modules: [
      { id: "agenda", label: "Agenda" },
      { id: "operacao", label: "PDV" },
      { id: "clientes", label: "Clientes" },
    ],
  },
  {
    id: "gestao",
    label: "Gestao",
    modules: [
      { id: "financeiro", label: "Financeiro" },
      { id: "profissionais", label: "Equipe" },
    ],
  },
  {
    id: "administracao",
    label: "Administracao",
    modules: [
      { id: "servicos", label: "Serviços" },
      { id: "auditoria", label: "Auditoria" },
    ],
  },
  {
    id: "integracoes",
    label: "Integracoes",
    modules: [
      { id: "whatsapp", label: "WhatsApp" },
      { id: "agendamento-link", label: "Link Agendamento" },
    ],
  },
];

export const ROLE_ACCESS = {
  owner: [
    ...MENU_GROUPS.flatMap((group) => group.modules).map((module) => module.id),
    "configuracoes",
    "estoque",
    "metas",
    "fidelizacao",
    "automacoes",
    "relatorios",
  ],
  recepcao: ["agenda", "operacao", "clientes"],
  profissional: ["agenda", "clientes"],
};

export const ROLE_DEFAULT_MODULE = {
  owner: "agenda",
  recepcao: "agenda",
  profissional: "agenda",
};

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_ACCESS, value) ? value : "owner";
}

export function getDefaultModuleForRole(role) {
  return ROLE_DEFAULT_MODULE[normalizeRole(role)] || "agenda";
}

export function getAllowedModulesForRole(role) {
  return ROLE_ACCESS[normalizeRole(role)];
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
  { id: "inicio", label: "Inicio", moduleId: "financeiro" },
  { id: "agenda", label: "Agenda", moduleId: "agenda" },
  { id: "operacao", label: "PDV", moduleId: "operacao" },
  { id: "mais", label: "Mais", moduleId: null },
];

export const SECONDARY_MODULE_IDS = [
  "clientes",
  "estoque",
  "financeiro",
  "profissionais",
  "servicos",
  "auditoria",
  "metas",
  "fidelizacao",
  "automacoes",
  "relatorios",
  "whatsapp",
  "agendamento-link",
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
  if (moduleId === "dashboard" || moduleId === "financeiro") return "inicio";
  if (moduleId === "agenda") return "agenda";
  if (moduleId === "operacao") return "operacao";
  return "mais";
}
