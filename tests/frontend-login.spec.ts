import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("frontend login", () => {
  it("nao fixa unit-01 no login persistente", () => {
    const html = readFileSync(join(process.cwd(), "public", "login.html"), "utf8");
    const backendLoginStart = html.indexOf("async function loginWithBackend");
    const backendLoginEnd = html.indexOf("loginForm.addEventListener", backendLoginStart);
    const backendLogin = html.slice(backendLoginStart, backendLoginEnd);

    expect(backendLogin).toContain("JSON.stringify({ email, password })");
    expect(backendLogin).not.toContain('activeUnitId: "unit-01"');
  });
});
