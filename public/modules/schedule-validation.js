export const SCHEDULE_CLIENT_REQUIRED_MESSAGE =
  "Selecione um cliente cadastrado antes de confirmar o agendamento.";

function safeText(value) {
  return String(value ?? "").trim();
}

export function validateScheduleClientSelection(input = {}) {
  const clientId = safeText(input.clientId);
  const typedClient = safeText(input.clientSearchValue);
  const clientsById = input.clientsById && typeof input.clientsById === "object" ? input.clientsById : {};
  const selectedClient = clientId ? clientsById[clientId] : null;

  if (!clientId || !selectedClient) {
    return {
      ok: false,
      message: SCHEDULE_CLIENT_REQUIRED_MESSAGE,
      typedClient,
    };
  }

  return { ok: true, message: "", clientId, typedClient };
}

export function isRawValidationMessage(message) {
  const text = safeText(message);
  if (!text) return false;
  if (/^[\[{]/.test(text)) return true;
  return (
    text.includes("too_small") ||
    text.includes("invalid_type") ||
    text.includes("expected string") ||
    text.includes("ZodError") ||
    text.includes('"code"') ||
    text.includes('"path"')
  );
}

export function friendlyApiValidationMessage(message, fallbackMessage) {
  const text = safeText(message);
  if (!text || isRawValidationMessage(text)) return fallbackMessage;
  return text;
}
