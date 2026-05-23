export function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

export function formatPhoneBR(value) {
  const digits = normalizePhoneDigits(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function buildWhatsAppLinkFromPhone(value) {
  const original = String(value || "").trim();
  const digits = normalizePhoneDigits(original);

  if (!digits) {
    return {
      ok: false,
      reason: "missing",
      message: "Cliente sem telefone cadastrado.",
      digits: "",
      whatsappNumber: "",
      url: "",
    };
  }

  let whatsappNumber = "";

  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    if (national.length < 10 || national.length > 11) {
      return {
        ok: false,
        reason: "invalid",
        message: "Telefone invalido para abrir WhatsApp.",
        digits,
        whatsappNumber: "",
        url: "",
      };
    }
    whatsappNumber = `55${national}`;
  } else if (digits.length >= 10 && digits.length <= 11) {
    whatsappNumber = `55${digits}`;
  } else {
    return {
      ok: false,
      reason: "invalid",
      message: "Telefone invalido para abrir WhatsApp.",
      digits,
      whatsappNumber: "",
      url: "",
    };
  }

  return {
    ok: true,
    reason: "ok",
    message: "",
    digits,
    whatsappNumber,
    url: `https://wa.me/${whatsappNumber}`,
  };
}

export function isValidClientPhone(value) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}
