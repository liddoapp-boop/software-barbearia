import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("notificacoes WhatsApp", () => {
  it("envia payload JSON em UTF-8 explicito para Evolution", async () => {
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";

    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendWhatsAppMessage } = await import("../src/notifications/index.js");
    const text = "Teste interno Liddo Barber: integração, confirmação, horário e serviço.";

    await sendWhatsAppMessage("11999998888", text);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://evolution.local/message/sendText/test-instance");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      apikey: "test-key",
    });

    const body = Buffer.isBuffer(init.body)
      ? init.body.toString("utf8")
      : Buffer.from(init.body as ArrayBuffer).toString("utf8");
    expect(JSON.parse(body)).toEqual({
      number: "5511999998888",
      text,
    });
    expect(Buffer.from(body, "utf8").includes(Buffer.from("integração", "utf8"))).toBe(true);
  });

  it("monta mensagem de booking com acentos validos", async () => {
    process.env.BARBER_NAME = "Barbearia Geovane Borges";

    const { buildBookingWhatsApp } = await import("../src/notifications/index.js");
    const message = buildBookingWhatsApp({
      clientName: "Cliente Teste",
      clientPhone: "11999998888",
      serviceName: "Serviço de confirmação",
      servicePrice: 75,
      startsAt: new Date("2026-07-14T13:00:00.000Z"),
      professionalName: "Geovane Borges",
    });

    expect(message).toContain("Olá Cliente Teste");
    expect(message).toContain("Serviço: Serviço de confirmação");
    expect(message).toContain("Horário:");
    expect(message).toContain("Barbearia Geovane Borges");
    expect(message).not.toContain("�");
    expect(message).not.toMatch(/Ã|Â/);
  });
});
