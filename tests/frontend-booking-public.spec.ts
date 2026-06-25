import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = () => readFileSync("public/booking.html", "utf8");

type Listener = (event?: { key?: string; shiftKey?: boolean; preventDefault(): void }) => void;

class FakeClassList {
  constructor(private readonly element: FakeElement) {}

  add(...names: string[]) {
    const current = new Set(this.element.className.split(/\s+/).filter(Boolean));
    names.forEach((name) => current.add(name));
    this.element.className = Array.from(current).join(" ");
  }

  remove(...names: string[]) {
    const remove = new Set(names);
    this.element.className = this.element.className
      .split(/\s+/)
      .filter((name) => name && !remove.has(name))
      .join(" ");
  }

  contains(name: string) {
    return this.element.className.split(/\s+/).includes(name);
  }

  toggle(name: string, force?: boolean) {
    const shouldAdd = force ?? !this.contains(name);
    if (shouldAdd) this.add(name);
    else this.remove(name);
    return shouldAdd;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners: Record<string, Listener[]> = {};
  readonly classList = new FakeClassList(this);
  parentNode: FakeElement | null = null;
  attributes: Record<string, string> = {};
  id = "";
  className = "";
  disabled = false;
  value = "";
  placeholder = "";
  type = "";
  name = "";
  autocomplete = "";
  inputMode = "";
  scrollTop = 0;
  scrollHeight = 0;
  private html = "";
  private text = "";

  constructor(readonly tagName: string) {}

  set innerHTML(value: string) {
    this.html = value;
    this.children.splice(0);
    for (const child of parseHtmlElements(value)) {
      this.appendChild(child);
    }
  }

  get innerHTML() {
    return this.html;
  }

  set textContent(value: string) {
    this.text = String(value ?? "");
    this.html = this.text;
  }

  get textContent(): string {
    return [this.text, stripTags(this.html), ...this.children.map((child) => child.textContent)]
      .filter(Boolean)
      .join(" ");
  }

  appendChild(child: FakeElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name: string, value: string | boolean) {
    const normalized = String(value);
    this.attributes[name] = normalized;
    if (name === "id") this.id = normalized;
    if (name === "class") this.className = normalized;
    if (name.startsWith("data-")) this.dataset[toDatasetKey(name.slice(5))] = normalized;
    if (name === "disabled" || name === "aria-disabled") this.disabled = normalized === "true" || normalized === "";
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  click() {
    for (const listener of this.listeners.click ?? []) listener();
  }

  focus() {}

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string) {
    const simpleSelector = selector.trim().split(/\s+/).at(-1) ?? selector;
    const result: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      for (const child of node.children) {
        if (matchesSelector(child, simpleSelector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}

class FakeDocument {
  readonly body = new FakeElement("body");

  constructor() {
    for (const id of ["chat", "chatInput", "btnSend", "liveRgn", "sheet", "overlay", "sheetBody", "btnAppts"]) {
      const tag = id === "chatInput" ? "input" : id === "btnSend" || id === "btnAppts" ? "button" : "div";
      const element = new FakeElement(tag);
      element.setAttribute("id", id);
      this.body.appendChild(element);
    }
  }

  createElement(tagName: string) {
    return new FakeElement(tagName);
  }

  getElementById(id: string) {
    return findById(this.body, id);
  }

  querySelector(selector: string) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector: string) {
    return this.body.querySelectorAll(selector);
  }

  addEventListener() {}
}

type FetchRequest = {
  method: string;
  path: string;
  body?: Record<string, unknown>;
};

type PublicProfessional = {
  id: string;
  name: string;
  displayName?: string;
};

type BookingHarnessOptions = {
  professionals?: PublicProfessional[];
  services?: Array<Record<string, unknown>>;
  servicesStatus?: number;
};

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toDatasetKey(value: string) {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function parseHtmlElements(html: string) {
  const root = new FakeElement("root");
  const stack = [root];
  const tagRegex = /<\/?(button|div|span|section|p)\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html))) {
    const fullTag = match[0];
    if (fullTag.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const element = new FakeElement(match[1]);
    const attrs = match[2];
    const attrRegex = /([:\w-]+)(?:="([^"]*)")?/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrRegex.exec(attrs))) {
      element.setAttribute(attr[1], attr[2] ?? "");
    }
    stack.at(-1)!.appendChild(element);
    if (!fullTag.endsWith("/>")) stack.push(element);
  }
  return root.children;
}

function findById(root: FakeElement, id: string): FakeElement | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  const notMatch = selector.match(/^(.+):not\((.+)\)$/);
  if (notMatch) return matchesSelector(element, notMatch[1]) && !matchesSelector(element, notMatch[2]);
  if (selector.startsWith("#")) return element.id === selector.slice(1);
  if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
  const dataMatch = selector.match(/^\[data-([\w-]+)\]$/);
  if (dataMatch) return Object.prototype.hasOwnProperty.call(element.dataset, toDatasetKey(dataMatch[1]));
  return element.tagName === selector.toLowerCase();
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createFetchMock(requests: FetchRequest[], options: BookingHarnessOptions = {}) {
  const professionals = options.professionals ?? [
    { id: "pro-01", name: "Geovane Borges", displayName: "Geovane Borges" },
  ];
  const services = options.services ?? [
    { id: "svc-barba", name: "Barba Terapia", price: 5500, durationMinutes: 35, imageUrl: "" },
  ];
  return async (input: string, init?: { method?: string; body?: string }) => {
    const url = new URL(input, "http://booking.local");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    requests.push({ method, path: url.pathname, body });

    if (url.pathname === "/public/business") return jsonResponse({ name: "Barbearia Harness" });
    if (url.pathname === "/public/services") {
      return jsonResponse(services, options.servicesStatus ?? 200);
    }
    if (url.pathname === "/public/services/svc-barba/professionals") {
      return jsonResponse({
        service: { id: "svc-barba", name: "Barba Terapia" },
        professionals,
      });
    }
    if (url.pathname === "/public/working-hours") {
      return jsonResponse({
        workingHours: {
          weekly: [{ day: 1, start: "08:00", end: "20:00", isClosed: false }],
        },
      });
    }
    if (url.pathname === "/public/slots") {
      return jsonResponse({
        "2026-06-01": [{ time: "10:00", available: true, professionalId: "pro-01", professionalName: "Geovane Borges" }],
      });
    }
    if (url.pathname === "/public/booking") {
      return jsonResponse({ id: "appt-harness-01", professionalId: "pro-01", professionalName: "Geovane Borges" }, 201);
    }
    return jsonResponse({}, 404);
  };
}

function getInlineBookingScript() {
  const match = source().match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
  if (!match) throw new Error("Script inline do booking publico nao encontrado");
  return match[1];
}

async function createBookingHarness(initialStorage: Record<string, string> = {}, options: BookingHarnessOptions = {}) {
  const document = new FakeDocument();
  const storage = new Map(Object.entries(initialStorage));
  const requests: FetchRequest[] = [];
  const context = {
    window: { location: { search: "?unitId=unit-01" } },
    document,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
    },
    fetch: createFetchMock(requests, options),
    URLSearchParams,
    URL,
    Date,
    Map,
    Set,
    Promise,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Intl,
    Error,
    encodeURIComponent,
    requestAnimationFrame: (callback: () => void) => callback(),
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
  };
  const script = getInlineBookingScript().replace(
    /\binit\(\);\s*$/,
    `window.__bookingHarness = {
      getClient,
      handleSend,
      beginNewBooking,
      onPickService,
      onPickProfessional,
      onPickDay,
      onPickSlot,
      submitBooking,
      getState: () => ({ step, bookingSubmitting, bookingCompleted, selectedProfessional, selectedSlot, confirmData })
    };
    window.__bookingReady = init();`,
  );
  vm.createContext(context);
  vm.runInContext(script, context);
  await (context.window as unknown as { __bookingReady: Promise<void> }).__bookingReady;
  return {
    document,
    requests,
    storage,
    api: (context.window as unknown as {
      __bookingHarness: {
        getClient(): Record<string, unknown>;
        handleSend(): Promise<void>;
        beginNewBooking(fromUserAction?: boolean): Promise<void>;
        onPickService(id: string): Promise<void>;
        onPickProfessional(id: string): Promise<void>;
        onPickDay(key: string): void;
        onPickSlot(time: string): Promise<void>;
        submitBooking(): Promise<void>;
        getState(): Record<string, unknown>;
      };
    }).__bookingHarness,
  };
}

async function completeBookingUntilConfirm() {
  const harness = await createBookingHarness({
    liddo_client: JSON.stringify({
      name: "Cliente Mobile",
      phone: "11999999999",
      email: "",
    }),
  });
  await harness.api.beginNewBooking();
  await harness.api.onPickService("svc-barba");
  harness.api.onPickDay("2026-06-01");
  await harness.api.onPickSlot("10:00");
  return harness;
}

describe("booking publico - trava pos-sucesso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mantem estado explicito de conclusao e bloqueia mutacoes do fluxo antigo", () => {
    const html = source();

    expect(html).toContain("let bookingCompleted = false");
    expect(html).toContain("function canMutateBookingFlow");
    expect(html).toContain("return isCurrentBookingRun(runId) && !bookingCompleted");
    expect(html).toContain("function lockCompletedBookingUI");
    expect(html).toContain("bookingCompleted = true");
    expect(html).toContain("selectedSlot = null");
    expect(html).toContain("selectedSlotProfessional = null");
    expect(html).not.toContain("bookingSubmitted");

    const guardedHandlers = [
      "async function onPickService",
      "async function onPickProfessional",
      "function onPickDay",
      "async function onPickSlot",
      "async function showConfirm",
      "async function submitBooking",
    ];
    for (const handler of guardedHandlers) {
      const index = html.indexOf(handler);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(html.slice(index, index + 180)).toContain("if (!canMutateBookingFlow(runId)) return;");
    }
  });

  it("remove calendario e confirmacao antigos e renderiza um unico sucesso com resumo", () => {
    const html = source();

    expect(html).toContain("removeCurrentBookingWidgets");
    expect(html).toContain("'calWidgetWrap'");
    expect(html).toContain("'confirmWidgetWrap'");
    expect(html).toContain("'bookingSuccessWrap'");
    expect(html).toContain("'bookingSuccessMessageWrap'");
    expect(html).toContain('id="bookingSuccessWrap"');
    expect(html).toContain("oldSuccess.remove()");
    expect(html).toContain("oldSuccessMessage.remove()");
    expect(html).toContain("renderBookingSuccess({");
    expect(html).toContain("serviceName: submittedData.serviceName");
    expect(html).toContain("professionalName: assignedProfessionalName");
    expect(html).toContain("dateStr: submittedData.dateStr");
    expect(html).toContain("time: submittedData.time");
    expect(html).toContain("Novo agendamento");
  });

  it("bloqueia double tap no confirmar e libera somente em falha", () => {
    const html = source();

    expect(html).toContain("if (bookingSubmitting || bookingCompleted) return;");
    expect(html).toContain("bookingSubmitting = true");
    expect(html).toContain("const btn = document.querySelector('#confirmWidgetWrap #btnConfirm')");
    expect(html).toContain("btn.disabled = true");
    expect(html).toContain("lockCompletedBookingUI();");
    expect(html).toContain("bookingSubmitting = false;");
    expect(html).toContain("btn.disabled = false");
  });

  it("novo agendamento limpa sucesso anterior e reinicia conscientemente", () => {
    const html = source();

    expect(html).toContain("resetBookingFlowState()");
    expect(html).toContain("bookingCompleted = false");
    expect(html).toContain("document.body.classList.remove('booking-locked')");
    expect(html).toContain("removeCurrentBookingWidgets();");
    expect(html).toContain("success.querySelector('#btnRestartBooking').addEventListener('click', () => beginNewBooking(true))");
    expect(html).toContain("await loadServices()");
  });

  it("preserva contratos publicos ja validados do booking", () => {
    const html = source();
    const api = readFileSync("src/http/app.ts", "utf8");

    expect(html).toContain("isPublicServiceVisible");
    expect(html).toContain("payload.professionalId = confirmData.professionalId");
    expect(html).toContain("if (email) payload.clientEmail = email");
    expect(html).toContain("isValidEmail(email)");
    expect(api).toContain("professionalName");
    expect(api).toContain("APPOINTMENT_CREATED");
  });

  it("seleciona automaticamente o unico profissional publico e segue para horarios", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const harness = await createBookingHarness();

    await harness.api.beginNewBooking();
    await harness.api.onPickService("svc-barba");

    const text = harness.document.getElementById("chat")?.textContent ?? "";
    expect(harness.requests.some((request) => request.path === "/public/services/svc-barba/professionals")).toBe(true);
    expect(harness.api.getState()).toMatchObject({
      selectedProfessional: { id: "pro-01", name: "Geovane Borges" },
    });
    expect(text).toContain("Profissional: Geovane Borges");
    expect(text).not.toContain("Sem preferência");
    expect(harness.document.querySelector("[data-professional-id]")).toBeNull();
    expect(harness.document.getElementById("calWidgetWrap")).not.toBeNull();
    expect(harness.requests.some((request) => request.path === "/public/slots")).toBe(true);
  });

  it("mantem escolha explicita quando ha mais de um profissional publico", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const harness = await createBookingHarness({}, {
      professionals: [
        { id: "pro-01", name: "Geovane Borges", displayName: "Geovane Borges" },
        { id: "pro-02", name: "Rafael Andrade", displayName: "Rafael Andrade" },
      ],
    });

    await harness.api.beginNewBooking();
    await harness.api.onPickService("svc-barba");

    const text = harness.document.getElementById("chat")?.textContent ?? "";
    expect(text).toContain("Escolha o profissional");
    expect(text).toContain("Sem preferência");
    expect(text).toContain("Geovane Borges");
    expect(text).toContain("Rafael Andrade");
    expect(harness.api.getState()).toMatchObject({ selectedProfessional: null });
    expect(harness.document.querySelectorAll("[data-professional-id]")).toHaveLength(3);
    expect(harness.document.getElementById("calWidgetWrap")).toBeNull();
    expect(harness.requests.some((request) => request.path === "/public/slots")).toBe(false);

    await harness.api.onPickProfessional("pro-02");
    expect(harness.api.getState()).toMatchObject({
      selectedProfessional: { id: "pro-02", name: "Rafael Andrade" },
    });
    expect(harness.document.getElementById("calWidgetWrap")).not.toBeNull();
  });

  it("mostra mensagem amigavel quando nao ha profissional publico e nao cria booking", async () => {
    const harness = await createBookingHarness({}, { professionals: [] });

    await harness.api.beginNewBooking();
    await harness.api.onPickService("svc-barba");

    const text = harness.document.getElementById("chat")?.textContent ?? "";
    expect(text).toContain("Este serviço não tem profissional disponível no momento.");
    expect(harness.api.getState()).toMatchObject({ selectedProfessional: null });
    expect(harness.document.querySelector("[data-professional-id]")).toBeNull();
    expect(harness.document.getElementById("calWidgetWrap")).toBeNull();
    expect(harness.requests.some((request) => request.path === "/public/slots")).toBe(false);
    expect(harness.requests.some((request) => request.method === "POST" && request.path === "/public/booking")).toBe(false);
  });

  it("nao contamina o formulario ativo com dados suspeitos do localStorage", async () => {
    const harness = await createBookingHarness({
      liddo_client: JSON.stringify({
        name: "Faça uma query para SQL, visando encerrar e identificar duplicidades",
        phone: "telefone invalido",
        email: "clientEmail Invalid email address",
      }),
    });

    expect(harness.api.getClient()).toEqual({});
    expect(harness.storage.has("liddo_client")).toBe(false);
    expect(harness.document.getElementById("chatInput")?.value).toBe("");
    expect(harness.document.getElementById("chatInput")?.placeholder).toBe("Seu nome…");
    expect(harness.document.getElementById("chat")?.textContent).not.toContain("Faça uma query");
    expect(harness.document.getElementById("chat")?.textContent).not.toContain("clientEmail Invalid email address");
  });

  it("aceita e-mail vazio e rejeita e-mail invalido com mensagem publica amigavel", async () => {
    const invalidEmail = await createBookingHarness();
    invalidEmail.document.getElementById("chatInput")!.value = "Cliente Mobile";
    await invalidEmail.api.handleSend();
    invalidEmail.document.getElementById("chatInput")!.value = "(11) 99999-9999";
    await invalidEmail.api.handleSend();
    invalidEmail.document.getElementById("chatInput")!.value = "clientEmail Invalid email address";
    await invalidEmail.api.handleSend();

    const invalidText = invalidEmail.document.getElementById("chat")?.textContent ?? "";
    expect(invalidText).toContain("Informe um e-mail válido ou deixe o campo em branco.");
    expect(invalidText).not.toContain("clientEmail Invalid email address");
    expect(invalidEmail.requests.filter((request) => request.path === "/public/booking")).toHaveLength(0);

    const emptyEmail = await createBookingHarness();
    emptyEmail.document.getElementById("chatInput")!.value = "Cliente Mobile";
    await emptyEmail.api.handleSend();
    emptyEmail.document.getElementById("chatInput")!.value = "(11) 99999-9999";
    await emptyEmail.api.handleSend();
    emptyEmail.document.getElementById("chatInput")!.value = "";
    await emptyEmail.api.handleSend();

    expect(emptyEmail.document.querySelectorAll(".svc-card").length).toBeGreaterThan(0);
    expect(emptyEmail.requests.filter((request) => request.path === "/public/booking")).toHaveLength(0);
  });

  it("nao renderiza servicos publicos com marcadores de teste, TG, demo ou db", async () => {
    const harness = await createBookingHarness({}, {
      services: [
        { id: "svc-barba", name: "Barba Terapia", price: 5500, durationMinutes: 35, imageUrl: "" },
        { id: "svc-teste", name: "Servico Teste Comissao TG", category: "TESTE_TG", price: 10000, durationMinutes: 30 },
        { id: "demo-svc-combo", name: "Combo demo", price: 11500, durationMinutes: 75 },
        { id: "svc-db-import", name: "Servico DB", price: 9000, durationMinutes: 30 },
      ],
    });

    await harness.api.beginNewBooking();

    const text = harness.document.getElementById("chat")?.textContent ?? "";
    expect(text).toContain("Barba Terapia");
    expect(text).not.toContain("Servico Teste Comissao TG");
    expect(text).not.toContain("Combo demo");
    expect(text).not.toContain("Servico DB");
  });

  it("nao usa catalogo ficticio quando a API publica de servicos falha", async () => {
    const harness = await createBookingHarness({}, { servicesStatus: 500 });

    await harness.api.beginNewBooking();

    const text = harness.document.getElementById("chat")?.textContent ?? "";
    expect(text).toContain("Não conseguimos carregar os serviços agora");
    expect(text).not.toContain("Corte Clássico");
    expect(text).not.toContain("Barba Completa");
    expect(harness.document.querySelectorAll(".svc-card")).toHaveLength(0);
  });

  it("executa o fluxo mobile com profissionais publicos, trava double tap e bloqueia estado antigo apos sucesso", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const harness = await completeBookingUntilConfirm();

    const professionalsText = harness.document.getElementById("chat")?.textContent ?? "";
    expect(professionalsText).toContain("Geovane Borges");
    expect(professionalsText).not.toContain("demo-pro-");
    expect(professionalsText).not.toContain("Rafael Demo");

    const staleSlot = harness.document.querySelector(".slot-btn");
    const staleConfirm = harness.document.getElementById("btnConfirm");
    const firstSubmit = harness.api.submitBooking();
    const secondSubmit = harness.api.submitBooking();
    await Promise.all([firstSubmit, secondSubmit]);

    const postsAfterDoubleTap = harness.requests.filter((request) => request.method === "POST" && request.path === "/public/booking");
    expect(postsAfterDoubleTap).toHaveLength(1);
    expect(postsAfterDoubleTap[0].body).toMatchObject({
      unitId: "unit-01",
      clientName: "Cliente Mobile",
      clientPhone: "11999999999",
      serviceId: "svc-barba",
      startsAt: "2026-06-01T13:00:00.000Z",
    });
    expect(postsAfterDoubleTap[0].body).not.toHaveProperty("clientEmail");

    expect(harness.api.getState()).toMatchObject({
      bookingCompleted: true,
      bookingSubmitting: false,
      selectedSlot: null,
    });
    expect(harness.document.body.classList.contains("booking-locked")).toBe(true);
    expect(harness.document.getElementById("calWidgetWrap")).toBeNull();
    expect(harness.document.getElementById("confirmWidgetWrap")).toBeNull();
    expect(harness.document.getElementById("bookingSuccessWrap")).not.toBeNull();
    expect(harness.document.querySelector(".slot-btn")).toBeNull();

    staleSlot?.click();
    staleConfirm?.click();
    await Promise.resolve();
    expect(harness.requests.filter((request) => request.method === "POST" && request.path === "/public/booking")).toHaveLength(1);
  });

  it("novo agendamento reinicia o fluxo sem disparar POST automaticamente", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const harness = await completeBookingUntilConfirm();
    await harness.api.submitBooking();
    expect(harness.requests.filter((request) => request.method === "POST" && request.path === "/public/booking")).toHaveLength(1);

    harness.document.getElementById("btnRestartBooking")?.click();
    await Promise.resolve();

    expect(harness.api.getState()).toMatchObject({
      bookingCompleted: false,
      bookingSubmitting: false,
    });
    expect(harness.document.body.classList.contains("booking-locked")).toBe(false);
    expect(harness.document.getElementById("bookingSuccessWrap")).toBeNull();
    expect(harness.document.querySelectorAll(".svc-card").length).toBeGreaterThan(0);
    expect(harness.requests.filter((request) => request.method === "POST" && request.path === "/public/booking")).toHaveLength(1);
  });
});
