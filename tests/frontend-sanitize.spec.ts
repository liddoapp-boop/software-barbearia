import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function loadSanitizeModule() {
  const source = await readFile(
    path.join(process.cwd(), "public/modules/sanitize.js"),
    "utf-8",
  );
  return await import(`data:text/javascript,${encodeURIComponent(source)}`);
}

describe("frontend sanitize helpers", () => {
  it("escapa tags, aspas e ampersand para HTML", async () => {
    const { escapeHtml } = await loadSanitizeModule();
    expect(escapeHtml(`<script>alert("xss")</script>&'`)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#039;",
    );
  });

  it("normaliza texto nulo com fallback escapado", async () => {
    const { safeText } = await loadSanitizeModule();
    expect(safeText(null, "<b>fallback</b>")).toBe("&lt;b&gt;fallback&lt;/b&gt;");
  });
});
