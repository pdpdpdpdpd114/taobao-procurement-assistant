import { describe, expect, it } from "vitest";
import { extractNetworkCandidates } from "../src/network-parser";

describe("network parser", () => {
  it("extracts only explicitly selected cart objects", () => {
    const payload = {
      data: {
        groups: [{
          items: [
            { itemId: "1", title: "接插件", skuText: "黑色 2P", quantity: 2, price: "1.25", selected: true, itemUrl: "https://item.taobao.com/item.htm?id=1" },
            { itemId: "2", title: "未选商品", skuText: "默认", quantity: 1, price: "9.90", selected: false }
          ]
        }]
      }
    };
    expect(extractNetworkCandidates(payload)).toEqual([expect.objectContaining({
      id: "1", name: "接插件", model: "黑色 2P", quantity: 2, unitPriceCents: 125
    })]);
  });
});
