import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadFinancialRenderers() {
  let source = readFileSync("public/modules/financeiro.js", "utf8");
  source = source.replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
  source = source.replace(/export function /g, "function ");
  source += "\nmodule.exports = { formatProductItemsSummary, renderTransactionRow };";

  const context = {
    module: { exports: {} as Record<string, (...args: any[]) => any> },
    renderEmptyState: () => "",
    renderEntityDrawer: () => "",
    bindEntityDrawers: () => {},
    renderPanelMessage: () => {},
  };
  vm.runInNewContext(source, context, { filename: "public/modules/financeiro.js" });
  return context.module.exports;
}

describe("detalhes de produtos no financeiro", () => {
  it("renderiza nome e quantidade para venda de um produto", () => {
    const { renderTransactionRow } = loadFinancialRenderers();
    const html = renderTransactionRow({
      id: "financial-single",
      type: "INCOME",
      source: "PRODUCT",
      referenceType: "PRODUCT_SALE",
      description: "Receita de venda de produto",
      category: "PRODUTO",
      paymentMethod: "Pix",
      amount: 59,
      date: "2026-07-13T12:00:00.000Z",
      productItems: [{ productId: "product-pomada", productName: "Pomada", quantity: 1 }],
    });

    expect(html).toContain("Receita de venda de produto");
    expect(html).toContain("Pomada — qtd. 1");
    expect(html).toContain("Pix");
  });

  it("renderiza resumo compacto para venda com varios produtos", () => {
    const { renderTransactionRow } = loadFinancialRenderers();
    const html = renderTransactionRow({
      id: "financial-multi",
      type: "INCOME",
      source: "PRODUCT",
      referenceType: "PRODUCT_SALE",
      description: "Receita de venda de produtos",
      category: "PRODUTO",
      paymentMethod: "Dinheiro",
      amount: 177,
      date: "2026-07-13T12:00:00.000Z",
      productItems: [
        { productId: "product-pomada", productName: "Pomada", quantity: 1 },
        { productId: "product-gel", productName: "Gel", quantity: 2 },
      ],
    });

    expect(html).toContain("Pomada x1, Gel x2");
    expect(html).toContain("Dinheiro");
  });

  it("mantem o fallback atual para lancamento manual sem produtos", () => {
    const { renderTransactionRow } = loadFinancialRenderers();
    const html = renderTransactionRow({
      id: "financial-manual",
      type: "INCOME",
      source: "MANUAL",
      referenceType: "MANUAL",
      description: "Ajuste manual",
      category: "AJUSTE",
      paymentMethod: "Pix",
      amount: 10,
      date: "2026-07-13T12:00:00.000Z",
    });

    expect(html).toContain("Lancamento manual · AJUSTE");
    expect(html).not.toContain("qtd.");
  });
});
