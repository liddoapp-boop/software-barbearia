import nodemailer from "nodemailer";

const EVOLUTION_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME ?? "liddo-barber";
const GMAIL_USER = process.env.GMAIL_USER ?? "";
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD ?? "";
const BARBER_NAME = process.env.BARBER_NAME ?? "Barbearia";

// ─── WhatsApp ────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function sendWhatsAppMessage(phone: string, text: string): Promise<void> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return;

  const number = formatPhone(phone);
  const payload = JSON.stringify({ number, text });
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", apikey: EVOLUTION_KEY },
    body: Buffer.from(payload, "utf8"),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WhatsApp error ${res.status}: ${body}`);
  }
}

export async function getWhatsAppConnectionState(): Promise<{
  state: "open" | "close" | "connecting";
  qrcode?: string;
}> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return { state: "close" };

  const res = await fetch(
    `${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`,
    { headers: { apikey: EVOLUTION_KEY } },
  );

  if (!res.ok) return { state: "close" };

  const data = (await res.json()) as {
    instance?: { state?: string };
    qrcode?: { base64?: string };
  };

  const state = (data.instance?.state ?? "close") as "open" | "close" | "connecting";
  return { state, qrcode: data.qrcode?.base64 };
}

export async function connectWhatsApp(): Promise<{ qrcode?: string; pairingCode?: string }> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) throw new Error("Evolution API nao configurada");

  const res = await fetch(`${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`, {
    headers: { apikey: EVOLUTION_KEY },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Erro ao conectar WhatsApp: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    base64?: string;
    code?: string;
    qrcode?: { base64?: string; code?: string };
  };

  const qrcode = data.base64 ?? data.qrcode?.base64;
  const pairingCode = data.code ?? data.qrcode?.code;
  return { qrcode, pairingCode };
}

export async function disconnectWhatsApp(): Promise<void> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) return;

  await fetch(`${EVOLUTION_URL}/instance/logout/${EVOLUTION_INSTANCE}`, {
    method: "DELETE",
    headers: { apikey: EVOLUTION_KEY },
  });
}

// ─── Email ───────────────────────────────────────────────────────────────────

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!GMAIL_USER || !GMAIL_PASSWORD) return;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${BARBER_NAME}" <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

// ─── Mensagens de agendamento ─────────────────────────────────────────────────

function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

function formatTimeBR(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

interface BookingData {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  serviceName: string;
  servicePrice: number;
  startsAt: Date;
  professionalName?: string;
}

export function buildBookingWhatsApp(data: BookingData): string {
  const dateStr = formatDateBR(data.startsAt);
  const timeStr = formatTimeBR(data.startsAt);
  const price = data.servicePrice.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    `Olá ${data.clientName}! ✂️\n\n` +
    `Seu agendamento na *${BARBER_NAME}* foi confirmado!\n\n` +
    `📋 Serviço: ${data.serviceName}\n` +
    `💰 Valor: ${price}\n` +
    `📅 Data: ${dateStr}\n` +
    `⏰ Horário: ${timeStr}\n` +
    (data.professionalName ? `💈 Profissional: ${data.professionalName}\n` : "") +
    `\nQualquer dúvida pode nos chamar aqui mesmo!\n\n` +
    `Até logo 🤙`
  );
}

export function buildReminderWhatsApp(data: BookingData): string {
  const timeStr = formatTimeBR(data.startsAt);
  return (
    `Olá ${data.clientName}! 👋\n\n` +
    `Lembrando do seu agendamento *hoje* às *${timeStr}* na ${BARBER_NAME}.\n\n` +
    `📋 Serviço: ${data.serviceName}\n\n` +
    `Te esperamos! ✂️`
  );
}

export function buildBookingEmailHtml(data: BookingData): string {
  const dateStr = formatDateBR(data.startsAt);
  const timeStr = formatTimeBR(data.startsAt);
  const price = data.servicePrice.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0B0F14;padding:28px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:2px;">✂️ ${BARBER_NAME}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="color:#0B0F14;margin:0 0 8px;font-size:20px;">Agendamento Confirmado!</h2>
            <p style="color:#6b7280;margin:0 0 24px;">Olá, <strong>${data.clientName}</strong>! Seu horário está reservado.</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Serviço</span>
                  <div style="color:#111827;font-size:16px;font-weight:600;margin-top:4px;">${data.serviceName}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Data</span>
                  <div style="color:#111827;font-size:16px;font-weight:600;margin-top:4px;">${dateStr}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Horário</span>
                  <div style="color:#111827;font-size:16px;font-weight:600;margin-top:4px;">${timeStr}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Valor</span>
                  <div style="color:#059669;font-size:18px;font-weight:700;margin-top:4px;">${price}</div>
                </td>
              </tr>
            </table>

            <p style="color:#6b7280;font-size:14px;margin:0;">
              Qualquer dúvida entre em contato conosco. Nos vemos em breve!
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">${BARBER_NAME} — Este é um email automático</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
