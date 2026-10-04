import { describe, expect, it } from "vitest";
import { parseCartDocument } from "../src/cart-parser";

describe("DOM cart parser", () => {
  it("reads checked items and ignores unchecked items", () => {
    document.body.innerHTML = `
      <div class="J_ItemHolder" data-id="1001">
        <input type="checkbox" checked>
        <a href="https://item.taobao.com/item.htm?id=1001" title="双绞屏蔽线">双绞屏蔽线</a>
        <div class="item-props">2×0.5mm²</div>
        <input class="amount" value="2">
        <span class="price-now">￥12.30</span>
      </div>
      <div class="J_ItemHolder" data-id="1002">
        <input type="checkbox">
        <a href="https://item.taobao.com/item.htm?id=1002">未选商品</a>
        <span class="price-now">￥99.00</span>
      </div>`;
    const result = parseCartDocument(document);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: "1001", name: "双绞屏蔽线", model: "2×0.5mm²", quantity: 2, unitPriceCents: 1230, freightCents: null
    }));
  });

  it("uses selected network records when DOM selectors fail", () => {
    document.body.innerHTML = "<main>新页面结构</main>";
    const result = parseCartDocument(document, [{ id: "n1", name: "网络商品", model: "规格A", quantity: 1, unitPriceCents: 500, url: "" }]);
    expect(result.items[0]?.source).toBe("network");
  });

  it("does not treat a checked shop-level checkbox as a third product", () => {
    document.body.innerHTML = `<section class="shop"><input type="checkbox" checked>
      <div class="J_ItemHolder" data-id="1"><input type="checkbox" checked><a href="https://item.taobao.com/item.htm?id=1">商品一</a><span class="price-now">1.00</span></div>
      <div class="J_ItemHolder" data-id="2"><input type="checkbox" checked><a href="https://item.taobao.com/item.htm?id=2">商品二</a><span class="price-now">2.00</span></div>
    </section>`;
    const result = parseCartDocument(document);
    expect(result.items.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("does not read a single-product shop wrapper and its selected product twice", () => {
    document.body.innerHTML = `<section class="CartItem--shop" data-id="shop">
      <input type="checkbox" checked>
      <div class="CartItem--row" data-id="row-1"><input type="checkbox" checked>
        <a href="https://item.taobao.com/item.htm?id=1">玻璃鼠标垫</a>
        <div class="sku">黑色</div><input class="quantity" value="2"><span class="price-now">￥99</span>
      </div></section>`;
    const result = parseCartDocument(document);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ id: "row-1", quantity: 2 }));
    expect(result.diagnostics.candidateContainers).toBe(1);
  });

  it("uses the current unit price instead of the crossed-out original price", () => {
    document.body.innerHTML = `<div class="J_ItemHolder" data-id="1"><input type="checkbox" checked>
      <a href="https://item.taobao.com/item.htm?id=1">商品一</a>
      <span class="price-original">￥99.00</span><span class="Price--actual">￥12.30</span>
    </div>`;
    expect(parseCartDocument(document).items[0]?.unitPriceCents).toBe(1230);
  });

  it("does not add a second line when a network fallback describes the same product", () => {
    document.body.innerHTML = `<div class="J_ItemHolder" data-id="cart-row-1"><input type="checkbox" checked>
      <a href="https://item.taobao.com/item.htm?id=1001">商品一</a><div class="item-props">黑色 2P</div>
      <span class="price-now">￥12.30</span>
    </div>`;
    const result = parseCartDocument(document, [{
      id: "network-row-9", name: "商品一", model: "黑色 2P", quantity: 1,
      unitPriceCents: 1230, url: "https://item.taobao.com/item.htm?id=1001&utm=test"
    }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ source: "dom", unitPriceCents: 1230 }));
  });

  it("deduplicates a network product id even if the fallback has no product URL", () => {
    document.body.innerHTML = `<div class="J_ItemHolder" data-id="cart-row-1"><input type="checkbox" checked>
      <a href="https://item.taobao.com/item.htm?id=1001">商品一</a><div class="item-props">黑色 2P</div>
      <span class="price-now">￥12.30</span>
    </div>`;
    const result = parseCartDocument(document, [{
      id: "1001", name: "商品一", model: "黑色 2P", quantity: 1, unitPriceCents: 1230, url: ""
    }]);
    expect(result.items).toHaveLength(1);
  });

  it("uses the fallback price only when the DOM has no trustworthy unit price", () => {
    document.body.innerHTML = `<div class="J_ItemHolder" data-id="cart-row-1"><input type="checkbox" checked>
      <a href="https://item.taobao.com/item.htm?id=1001">商品一</a><div class="item-props">黑色 2P</div>
      <span class="price-total">合计￥99.00</span>
    </div>`;
    const result = parseCartDocument(document, [{
      id: "1001", name: "商品一", model: "黑色 2P", quantity: 1, unitPriceCents: 1230, url: ""
    }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ unitPriceCents: 1230 }));
    expect(result.items[0]?.warnings).toContain("单价来自页面数据兜底，请核对");
  });

  it("reads +/- steppers as per-line quantities, not the selected line count", () => {
    document.body.innerHTML = [7, 2, 2].map((quantity, index) => `
      <div class="CartItem--row" data-id="row-${index}"><input type="checkbox" checked>
        <a href="https://item.taobao.com/item.htm?id=${index + 1}">商品${index + 1}</a>
        <div class="stepper"><button>−</button><span>${quantity}</span><button>+</button></div>
        <span class="price-now">￥10.00</span>
      </div>`).join("");
    const result = parseCartDocument(document);
    expect(result.items.map((item) => item.quantity)).toEqual([7, 2, 2]);
    expect(result.items).toHaveLength(3);
  });

  it("does not invent quantity one or merge separate rows of the same SKU", () => {
    document.body.innerHTML = `<div class="CartItem--row" data-id="row-a"><input type="checkbox" checked><a href="https://item.taobao.com/item.htm?id=7">同款</a><div class="sku">黑色</div><span class="price-now">￥5</span></div>
      <div class="CartItem--row" data-id="row-b"><input type="checkbox" checked><a href="https://item.taobao.com/item.htm?id=7">同款</a><div class="sku">黑色</div><input class="quantity" value="3"><span class="price-now">￥5</span></div>`;
    const result = parseCartDocument(document);
    expect(result.items.map((item) => item.quantity)).toEqual([0, 3]);
    expect(result.items).toHaveLength(2);
  });

  it("retains separate same-SKU rows without data-id attributes", () => {
    document.body.innerHTML = `<div class="CartItem--row"><input type="checkbox" checked><a href="https://item.taobao.com/item.htm?id=7">同款</a><input class="quantity" value="2"><span class="price-now">￥5</span></div>
      <div class="CartItem--row"><input type="checkbox" checked><a href="https://item.taobao.com/item.htm?id=7">同款</a><input class="quantity" value="3"><span class="price-now">￥5</span></div>`;
    expect(parseCartDocument(document).items.map((item) => item.quantity)).toEqual([2, 3]);
  });
});
