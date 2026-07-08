export const STATUS_LANGUAGE = {
  INFO: { label: "Informativo", tone: "info" },
  WARNING: { label: "Atencao", tone: "warning" },
  SCHEDULED: { label: "Agendado", tone: "neutral" },
  AGENDADO: { label: "Agendado", tone: "neutral" },
  CONFIRMED: { label: "Confirmado", tone: "info" },
  CONFIRMADO: { label: "Confirmado", tone: "info" },
  IN_SERVICE: { label: "Em atendimento", tone: "warning" },
  EM_ATENDIMENTO: { label: "Em atendimento", tone: "warning" },
  COMPLETED: { label: "Concluido", tone: "success" },
  CONCLUIDO: { label: "Concluido", tone: "success" },
  CANCELLED: { label: "Cancelado", tone: "danger" },
  CANCELADO: { label: "Cancelado", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "danger" },
  NO_SHOW: { label: "Falta", tone: "danger" },
  NAO_COMPARECEU: { label: "Falta", tone: "danger" },
  DELAY_RECORDED: { label: "Atraso registrado", tone: "warning" },
  WALK_IN: { label: "Atendimento sem agendamento", tone: "info" },
  FITTING: { label: "Encaixe", tone: "info" },
  APPOINTMENT_BLOCK: { label: "Horario bloqueado", tone: "warning" },
  FULL_DAY: { label: "Dia bloqueado", tone: "warning" },
  PAID: { label: "Pago", tone: "success" },
  PAGO: { label: "Pago", tone: "success" },
  PENDING: { label: "Pendente", tone: "warning" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  REFUNDED: { label: "Devolvido", tone: "danger" },
  DEVOLVIDO: { label: "Devolvido", tone: "danger" },
  NOT_REFUNDED: { label: "Sem devolucao", tone: "muted" },
  PARTIALLY_REFUNDED: { label: "Parcialmente devolvido", tone: "warning" },
  LOW_STOCK: { label: "Estoque baixo", tone: "warning" },
  CRITICAL: { label: "Critico", tone: "danger" },
  CRITICAL_STOCK: { label: "Critico", tone: "danger" },
  OUT_OF_STOCK: { label: "Sem estoque", tone: "danger" },
  IN_STOCK: { label: "Em estoque", tone: "success" },
  BLOCKED: { label: "Bloqueado", tone: "danger" },
  ACTIVE: { label: "Ativo", tone: "success" },
  NEW: { label: "Novo", tone: "info" },
  NOVO: { label: "Novo", tone: "info" },
  RECURRING: { label: "Recorrente", tone: "success" },
  RECORRENTE: { label: "Recorrente", tone: "success" },
  INACTIVE: { label: "Inativo", tone: "muted" },
  INATIVO: { label: "Inativo", tone: "muted" },
  VIP: { label: "VIP", tone: "premium" },
  AT_RISK: { label: "Em risco", tone: "warning" },
  EM_RISCO: { label: "Em risco", tone: "warning" },
};

export const ACTION_LANGUAGE = {
  CONFIRMED: "Confirmar",
  IN_SERVICE: "Iniciar atendimento",
  COMPLETE: "Ir para checkout",
  SERVICES: "Alterar servicos",
  RESCHEDULE: "Remarcar",
  CANCELLED: "Cancelar",
  NO_SHOW: "Marcar falta",
  DELAY: "Registrar atraso",
  DETAIL: "Ver detalhes",
  HISTORY: "Ver historico",
  EDIT: "Editar",
  WHATSAPP: "WhatsApp",
  REFUND: "Correcao administrativa",
};

export function normalizeLanguageKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function statusLanguage(value, fallbackLabel = "Status") {
  const key = normalizeLanguageKey(value);
  return STATUS_LANGUAGE[key] || { label: fallbackLabel || key || "Status", tone: "neutral" };
}

export function actionLanguage(value, fallbackLabel = "") {
  const key = normalizeLanguageKey(value);
  return ACTION_LANGUAGE[key] || fallbackLabel || key || "Acao";
}
