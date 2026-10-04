import { describe, expect, it } from "vitest";
import { parseCheckoutDocument } from "../src/checkout-parser";

function page(q = 2, shipping = "¥6", discount = "¥40", total = "¥925"): string {
  return `<main>
    <section class="order"><h2>确认订单信息</h2><div>店铺宝贝</div><div>商品属性</div><div>数量</div><div>价格</div>
      <div class="shop">REFLX LAB</div>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=1">相机后背</a><div><button>−</button><span>${q}</span><button>+</button></div><span>¥252</span></div>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=2">彩色胶卷</a><div><button>−</button><span>2</span><button>+</button></div><span>¥49</span></div>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=3">玻璃鼠标垫</a><div><button>−</button><span>3</span><button>+</button></div><span>¥119</span></div>
      <div><span>配送服务</span><span>快递 ${shipping}</span></div>
    </section>
    <section class="suggestions"><h2>顺手买</h2><div class="product"><span>广告商品</span><div><button>−</button><span>9</span><button>+</button></div><span>¥10</span></div></section>
    <aside><div><span>付款详情</span><span>共7件商品</span></div>
      <div><span>商品总价</span><span>¥959</span></div><div><span>运费</span><span>${shipping}</span></div>
      <div><span>店铺优惠</span><span>${discount}</span></div><div><span>平台优惠</span><span>¥0</span></div>
      <div><span>合计:</span><span>${total}</span></div></aside>
  </main>`;
}

describe("direct confirmation-page reading", () => {
  it("reads seven units without a cart snapshot and reconciles 959+6-40=925", () => {
    document.body.innerHTML = page();
    const result = parseCheckoutDocument(document);
    expect(result.warnings).toEqual([]);
    expect(result.matched).toBe(true);
    expect(result.items.map((item) => item.quantity)).toEqual([2, 2, 3]);
    expect(result.items.map((item) => item.unitPriceCents)).toEqual([25200, 4900, 11900]);
    expect(result.items.map((item) => item.freightCents)).toEqual([600, 0, 0]);
    expect(result.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents! + item.freightCents! - item.discountCents!, 0)).toBe(92500);
  });

  it("rejects a changed quantity even if old cart data would have matched", () => {
    document.body.innerHTML = page(1);
    expect(parseCheckoutDocument(document).warnings.join(" ")).toContain("商品件数");
  });

  it("rejects unknown freight and unexplained total", () => {
    document.body.innerHTML = page(2, "待计算");
    expect(parseCheckoutDocument(document).matched).toBe(false);
    document.body.innerHTML = page(2, "¥6", "¥40", "¥924");
    expect(parseCheckoutDocument(document).warnings.join(" ")).toContain("优惠与应付总额不一致");
  });

  it("never counts recommendation products outside the order block", () => {
    document.body.innerHTML = page();
    expect(parseCheckoutDocument(document).items.map((item) => item.name)).not.toContain("广告商品");
  });

  it("uses the price combination matching the checkout subtotal, not the last visible price", () => {
    document.body.innerHTML = `<main><section><h2>确认订单信息</h2><span>店铺宝贝</span><span>商品属性</span><span>数量</span><span>价格</span>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=1">相机后背</a><div><button>−</button><span>2</span><button>+</button></div><span>¥250</span></div>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=2">彩色胶卷</a><div><button>−</button><span>1</span><button>+</button></div><span>¥49</span></div>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=3">玻璃鼠标垫</a><div><button>−</button><span>2</span><button>+</button></div><span>优惠后 ¥99</span><span>¥119</span></div>
      <div><span>配送服务</span><span>快递 ¥6</span></div></section>
      <aside><span>共5件商品</span><div><span>商品总价</span><span>¥787</span></div><div><span>运费</span><span>¥6</span></div>
      <div><span>店铺优惠</span><span>¥40</span></div><div><span>合计:</span><span>¥753</span></div></aside></main>`;
    const result = parseCheckoutDocument(document);
    expect(result.matched).toBe(true);
    expect(result.items.map((item) => item.unitPriceCents)).toEqual([25000, 4900, 11900]);
    expect(result.payableCents).toBe(75300);
    document.body.innerHTML = document.body.innerHTML.replace("¥787", "¥747").replace("¥753", "¥713");
    expect(parseCheckoutDocument(document).items[2]?.unitPriceCents).toBe(9900);
  });

  it("collapses a cloned DOM row only when the page count and subtotal prove it is a duplicate", () => {
    document.body.innerHTML = `<main><section><h2>确认订单信息</h2><span>店铺宝贝</span><span>商品属性</span><span>数量</span><span>价格</span>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=1">相机后背</a><div><button>−</button><span>1</span><button>+</button></div><span>¥250</span></div>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=1">相机后背</a><div><button>−</button><span>1</span><button>+</button></div><span>¥250</span></div>
      <div><span>配送服务</span><span>快递 ¥6</span></div></section>
      <aside><span>共1件商品</span><div><span>商品总价</span><span>¥250</span></div><div>运费 ¥6</div>
      <div><span>店铺优惠</span><span>¥0</span></div><div><span>合计:</span><span>¥256</span></div></aside></main>`;
    const one = parseCheckoutDocument(document);
    expect(one.matched).toBe(true);
    expect(one.items).toHaveLength(1);
    expect(one.items[0]?.freightCents).toBe(600);
    document.body.innerHTML = document.body.innerHTML.replace("共1件商品", "共2件商品").replace("¥250</span></div><div>运费", "¥500</span></div><div>运费").replace("¥256", "¥506");
    const two = parseCheckoutDocument(document);
    expect(two.matched).toBe(true);
    expect(two.items).toHaveLength(2);
    expect(two.items.map((item) => item.freightCents)).toEqual([600, 0]);
  });

  it("reads explicit free shipping as zero rather than leaving it unknown", () => {
    document.body.innerHTML = `<main><section><h2>确认订单信息</h2><span>店铺宝贝</span><span>商品属性</span><span>数量</span><span>价格</span>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=1">商品甲</a><div><button>−</button><span>1</span><button>+</button></div><span>¥10</span></div>
      <div><span>配送服务</span><span>包邮</span></div></section>
      <aside><span>共1件商品</span><div><span>商品总价</span><span>¥10</span></div><div><span>运费</span><span>包邮</span></div>
      <div><span>店铺优惠</span><span>¥0</span></div><div><span>合计:</span><span>¥10</span></div></aside></main>`;
    const result = parseCheckoutDocument(document);
    expect(result.matched).toBe(true);
    expect(result.items[0]?.freightCents).toBe(0);
  });

  it("allocates each store's displayed shipping to its first product", () => {
    document.body.innerHTML = `<main><section><h2>确认订单信息</h2><span>店铺宝贝</span><span>商品属性</span><span>数量</span><span>价格</span>
      <div class="shop"><div class="product"><a href="https://item.taobao.com/item.htm?id=1">商品甲</a>
      <div><button>−</button><span>1</span><button>+</button></div><span>¥10</span></div>
      <div><span>配送服务</span><span>快递 ¥6</span></div></div>
      <div class="shop"><div class="product"><a href="https://item.taobao.com/item.htm?id=2">商品乙</a>
      <div><button>−</button><span>1</span><button>+</button></div><span>¥20</span></div>
      <div><span>配送服务</span><span>包邮</span></div></div></section>
      <aside><span>共2件商品</span><div><span>商品总价</span><span>¥30</span></div>
      <div><span>运费</span><span>¥6</span></div><div><span>店铺优惠</span><span>¥0</span></div>
      <div><span>合计:</span><span>¥36</span></div></aside></main>`;
    const result = parseCheckoutDocument(document);
    expect(result.matched).toBe(true);
    expect(result.items.map((item) => item.freightCents)).toEqual([600, 0]);
  });
});
