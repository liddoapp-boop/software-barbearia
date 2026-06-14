import { expect, test } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3335";

const credentials = {
  owner: { email: "owner@barbearia.local", password: "owner123" },
  recepcao: { email: "recepcao@barbearia.local", password: "recepcao123" },
  profissional: { email: "profissional@barbearia.local", password: "profissional123" },
};

async function loginAs(page, role: keyof typeof credentials, activeModule = "agenda") {
  const response = await page.request.post(`${BASE_URL}/auth/login`, {
    data: credentials[role],
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.addInitScript(
    ({ activeModuleValue, sessionValue }) => {
      window.localStorage.setItem("sb.activeModule", activeModuleValue);
      window.localStorage.setItem("sb.authSession", JSON.stringify(sessionValue));
      window.localStorage.setItem("authToken", sessionValue.accessToken);
    },
    { activeModuleValue: activeModule, sessionValue: session },
  );
}

async function visibleSidebarModules(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  return await page.locator("[data-sidebar-module]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-sidebar-module")),
  );
}

test("menu desktop respeita perfil visual", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });

  await loginAs(page, "owner");
  await expect.poll(() => visibleSidebarModules(page)).toEqual(
    expect.arrayContaining(["agenda", "operacao", "clientes", "financeiro", "profissionais", "servicos", "auditoria"]),
  );

  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await loginAs(page, "recepcao");
  expect(await visibleSidebarModules(page)).toEqual(["agenda", "operacao", "clientes"]);

  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());
  await loginAs(page, "profissional");
  expect(await visibleSidebarModules(page)).toEqual(["agenda", "clientes"]);
});

test("PDV mobile nao exibe botao flutuante sobre o carrinho", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "owner", "operacao");
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });

  await expect(page.locator("#operationSection")).toBeVisible();
  await expect(page.locator("#saleClientId")).toBeVisible();
  await expect(page.locator("#saleProfessionalId")).toBeVisible();
  await expect(page.locator("#saleCheckoutBtn")).toBeVisible();
  await expect(page.locator("#saleRecentList")).toBeVisible();
  await expect(page.locator("#mobileOperationActions")).toBeHidden();
});
