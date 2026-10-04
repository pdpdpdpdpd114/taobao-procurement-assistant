import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcurementAssistant } from "../src/ui";

describe("team UI", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    document.documentElement.innerHTML = `<head></head><body>
      <div class="J_ItemHolder" data-id="1001">
        <input type="checkbox" checked>
        <a href="https://item.taobao.com/item.htm?id=1001" title="接插件">接插件</a>
        <div class="item-props">2P 黑色</div>
        <input class="amount" value="1">
        <span class="price-now">￥3.50</span>
      </div></body>`;
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) } },
      runtime: { getURL: (path: string) => path, getManifest: () => ({ version: "0.1.0" }) }
    });
  });

  it("mounts an isolated launcher and opens the complete drawer", async () => {
    const assistant = new ProcurementAssistant([]);
    await assistant.mount();
    const host = document.getElementById("taobao-procurement-assistant-host");
    expect(host?.shadowRoot?.querySelector(".launcher")?.textContent).toContain("生成采购申请");
    (host?.shadowRoot?.querySelector(".launcher") as HTMLButtonElement).click();
    expect(host?.shadowRoot?.querySelector(".backdrop")?.classList.contains("open")).toBe(true);
    expect(
      (host?.shadowRoot?.querySelector("input.name") as HTMLInputElement).value,
    ).toBe("接插件");
    expect(
      (host?.shadowRoot?.querySelector("input[data-field='invoiceDate']") as HTMLInputElement).value,
    ).toBe("");
    expect(host?.shadowRoot?.textContent).toContain("请到确认订单页导出");
  });

  it("reads items selected after the page and extension have loaded", async () => {
    document.querySelector<HTMLInputElement>("input[type='checkbox']")!.checked = false;
    const assistant = new ProcurementAssistant([]);
    await assistant.mount();
    document.querySelector<HTMLInputElement>("input[type='checkbox']")!.checked = true;
    const host = document.getElementById("taobao-procurement-assistant-host");
    (host?.shadowRoot?.querySelector(".launcher") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(host?.shadowRoot?.textContent).toContain("商品明细（1项）"));
  });

  it("automatically saves the cart draft on first read and after quantity changes", async () => {
    const assistant = new ProcurementAssistant([]);
    await assistant.mount();
    const writes = vi.mocked(chrome.storage.local.set);
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({
      applicationDraftV1: expect.objectContaining({ items: [expect.objectContaining({ name: "接插件", quantity: 1 })] })
    }));
    const host = document.getElementById("taobao-procurement-assistant-host");
    (host?.shadowRoot?.querySelector(".launcher") as HTMLButtonElement).click();
    const department = host?.shadowRoot?.querySelector<HTMLInputElement>("[data-field='department']");
    department!.value = "电控";
    department!.dispatchEvent(new Event("input", { bubbles: true }));
    const renamed = host?.shadowRoot?.querySelector<HTMLInputElement>("input.name");
    renamed!.value = "接插件-简称";
    renamed!.dispatchEvent(new Event("input", { bubbles: true }));
    const quantity = document.querySelector<HTMLInputElement>("input.amount")!;
    quantity.value = "3";
    quantity.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(writes.mock.calls.some(([value]) => {
      const saved = (value as { applicationDraftV1?: { department: string; items: Array<{ name: string; quantity: number }> } }).applicationDraftV1;
      return saved?.department === "电控" && saved.items[0]?.quantity === 3 &&
        saved.items[0]?.name === "接插件-简称";
    })).toBe(true));
  });

  it("restores previously edited cart names and applicant fields on a new page load", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({
      applicationDraftV1: {
        department: "电控", applicant: "测试成员", purpose: "装车",
        items: [{ id: "1001", name: "自定义简称", model: "2P 黑色", quantity: 1,
          unitPriceCents: 350, freightCents: null, freightConfirmed: false,
          url: "https://item.taobao.com/item.htm?id=1001", source: "dom", warnings: [] }]
      }
    }));
    const assistant = new ProcurementAssistant([]);
    await assistant.mount();
    const host = document.getElementById("taobao-procurement-assistant-host");
    expect((host?.shadowRoot?.querySelector("input.name") as HTMLInputElement).value).toBe("自定义简称");
    expect((host?.shadowRoot?.querySelector("[data-field='applicant']") as HTMLInputElement).value).toBe("测试成员");
    expect((host?.shadowRoot?.querySelector("[data-field='purpose']") as HTMLTextAreaElement).value).toBe("装车");
  });

  it("does not block export merely because duplicate cart rows were merged", async () => {
    const assistant = new ProcurementAssistant([]);
    await assistant.mount();
    const internal = assistant as unknown as {
      draft: Record<string, unknown>;
      diagnostics: Record<string, unknown>;
      exportDocx: () => Promise<void>;
    };
    internal.draft = {
      department: "电控", applicant: "甲", purchaser: "乙", leader: "丙", captain: "丁", teacher: "戊",
      purchaseDate: "2026-08-19", arrivalDate: "", invoiceDate: "2026-08-20", inventory: "", custodian: "", purpose: "", finishedProduct: "",
      annualBudgetCents: null, currentSpentCents: null, remainingBudgetCents: null,
      items: [{ id: "1", name: "接插件", model: "2P", quantity: 1, unitPriceCents: 350, freightCents: 0, freightConfirmed: true, url: "", source: "dom", warnings: [] }]
    };
    internal.diagnostics = { checkedInputs: 2, candidateContainers: 2, domItems: 2, networkItems: 1, mergedItems: 1, warnings: [] };
    await internal.exportDocx();
    expect(hostStatus(assistant)).not.toContain("部分已选商品无法读取");
  });

  it("opens on a confirmation page without a cart snapshot", async () => {
    vi.stubGlobal("location", { hostname: "buy.taobao.com", origin: "https://buy.taobao.com", pathname: "/order/confirm_order.htm" });
    document.body.innerHTML = `<main><section><h2>确认订单信息</h2><span>店铺宝贝</span><span>商品属性</span><span>数量</span><span>价格</span>
      <div class="product"><a href="https://item.taobao.com/item.htm?id=1">接插件</a><div><button>−</button><span>1</span><button>+</button></div><span>¥3.50</span></div></section>
      <aside><span>共1件商品</span><div><span>商品总价</span><span>¥3.50</span></div><div><span>运费</span><span>¥0.00</span></div><div><span>合计:</span><span>¥3.50</span></div></aside></main>`;
    const assistant = new ProcurementAssistant([]);
    await assistant.mount();
    const host = document.getElementById("taobao-procurement-assistant-host");
    expect(host?.shadowRoot?.querySelector(".launcher")?.textContent).toContain("核对采购申请");
    expect((host?.shadowRoot?.querySelector(".payable") as HTMLInputElement).value).toBe("3.50");
    expect(host?.shadowRoot?.textContent).toContain("已核对确认订单页商品、运费与应付金额");
    expect((host?.shadowRoot?.querySelector(".export-docx") as HTMLButtonElement).disabled).toBe(false);
  });
});

function hostStatus(assistant: ProcurementAssistant): string {
  return (assistant as unknown as { shadow: ShadowRoot }).shadow.querySelector(".status")?.textContent || "";
}
