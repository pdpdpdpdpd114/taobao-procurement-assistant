import { describe, expect, it } from "vitest";
import { buildTemplateData } from "../src/docx";
import type { ApplicationDraft, CartItem } from "../src/types";

function item(index: number): CartItem {
  return { id: String(index), name: `物品${index}`, model: `型号${index}`, quantity: 1, unitPriceCents: 100, freightCents: 0, freightConfirmed: true, url: "", source: "manual", warnings: [] };
}

function draft(count: number): ApplicationDraft {
  return {
    department: "电控", applicant: "A", purchaser: "B", leader: "C", captain: "D", teacher: "E",
    purchaseDate: "2026-08-19", arrivalDate: "2026-08-20", invoiceDate: "2026-08-21",
    inventory: "不足", custodian: "F", purpose: "测试", finishedProduct: "成品",
    annualBudgetCents: 1000, currentSpentCents: 400, remainingBudgetCents: 600,
    items: Array.from({ length: count }, (_, index) => item(index + 1))
  };
}

describe("DOCX template data", () => {
  it("keeps eight main items and moves the remainder to an appendix", () => {
    const data = buildTemplateData(draft(9));
    expect(data.mainItems).toHaveLength(8);
    expect(data.hasAppendix).toHaveLength(1);
    expect(data.hasAppendix[0]?.appendixItems).toHaveLength(1);
  });

  it("does not create a blank appendix for eight items", () => {
    expect(buildTemplateData(draft(8)).hasAppendix).toEqual([]);
  });

  it("renders requested optional fields as blank Word cells", () => {
    const optional = draft(1);
    optional.arrivalDate = "";
    optional.inventory = "";
    optional.custodian = "";
    optional.purpose = "";
    optional.annualBudgetCents = null;
    optional.currentSpentCents = null;
    optional.remainingBudgetCents = null;
    expect(buildTemplateData(optional)).toEqual(expect.objectContaining({
      arrivalDate: "", inventory: "", custodian: "", purpose: "",
      annualBudget: "", currentSpent: "", remainingBudget: ""
    }));
  });

  it("keeps six columns and notes a checkout discount in the item name", () => {
    const discounted = draft(1);
    discounted.items[0]!.discountCents = 1;
    expect(buildTemplateData(discounted).mainItems[0]).toEqual(expect.objectContaining({
      name: "物品1（优惠-0.01元）", total: "0.99"
    }));
  });
});
