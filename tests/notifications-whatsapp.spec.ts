import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("notificacoes WhatsApp", () => {
  it("envia payload JSON em UTF-8 explicito para Evolution", async () => {
    process.env.SERVER_MODE = "pilot";
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

  it.each([
    ["configuracao ausente", undefined, undefined, "isolated_outbound_disabled"],
    ["modo disabled", "disabled", "5511999998888", "isolated_outbound_disabled"],
    ["modo invalido", "enabled", "5511999998888", "isolated_outbound_invalid_mode"],
    ["allowlist vazia", "allowlist", "  ", "isolated_outbound_allowlist_invalid"],
  ])("bloqueia em ambiente isolado com %s antes do provider", async (_label, mode, allowlist, reason) => {
    process.env.SERVER_MODE = "isolated";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";
    if (mode == null) delete process.env.ISOLATED_WHATSAPP_OUTBOUND_MODE;
    else process.env.ISOLATED_WHATSAPP_OUTBOUND_MODE = mode;
    if (allowlist == null) delete process.env.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST;
    else process.env.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST = allowlist;

    const fetchMock = vi.fn();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsAppMessage } = await import("../src/notifications/index.js");

    await expect(sendWhatsAppMessage("11999998888", "nao enviar")).rejects.toMatchObject({ reason });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("bloqueia numero fora da allowlist com evidencia mascarada e sem chamar o provider", async () => {
    process.env.SERVER_MODE = "isolated";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_MODE = "allowlist";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST = "5511999998888";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";

    const fetchMock = vi.fn();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsAppMessage } = await import("../src/notifications/index.js");

    await expect(sendWhatsAppMessage("21988887777", "nao enviar")).rejects.toMatchObject({
      reason: "isolated_outbound_not_allowlisted",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const evidence = warning.mock.calls.flat().join(" ");
    expect(evidence).toContain("whatsapp.outbound.blocked");
    expect(evidence).toContain("(**) *****-7777");
    expect(evidence).not.toContain("5521988887777");
    expect(evidence).not.toContain("21988887777");
  });

  it("normaliza allowlist e destinatario pelo mesmo contrato antes de autorizar", async () => {
    process.env.SERVER_MODE = "isolated";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_MODE = "allowlist";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST = "+55 (11) 99999-8888; 55 21 98888-7777";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";
    process.env.EVOLUTION_INSTANCE_NAME = "test-instance";

    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsAppMessage } = await import("../src/notifications/index.js");

    await sendWhatsAppMessage("(11) 99999-8888", "canario controlado");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = Buffer.isBuffer(init.body)
      ? init.body.toString("utf8")
      : Buffer.from(init.body as ArrayBuffer).toString("utf8");
    expect(JSON.parse(body)).toMatchObject({ number: "5511999998888" });
  });

  it("ignora o guard isolado fora do ambiente isolado e preserva o contrato anterior", async () => {
    process.env.SERVER_MODE = "pilot";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_MODE = "valor-invalido";
    process.env.ISOLATED_WHATSAPP_OUTBOUND_ALLOWLIST = "";
    process.env.EVOLUTION_API_URL = "http://evolution.local";
    process.env.EVOLUTION_API_KEY = "test-key";

    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsAppMessage } = await import("../src/notifications/index.js");

    await sendWhatsAppMessage("11999998888", "contrato operacional");

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
