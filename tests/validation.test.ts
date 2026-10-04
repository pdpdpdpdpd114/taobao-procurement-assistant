import { describe, expect, it } from "vitest";
import { parseTeamConfig, validateDraft, validateTeamConfig } from "../src/validation";
import type { ApplicationDraft } from "../src/types";

function validDraft(): ApplicationDraft {
  return {
    department: "电控", applicant: "申请人", purchaser: "采购人", leader: "组长", captain: "队长", teacher: "老师",
    purchaseDate: "2026-08-19", arrivalDate: "2026-08-26", invoiceDate: "2026-09-02",
    inventory: "库存不足", custodian: "保管人", purpose: "车辆调试", finishedProduct: "低压线束",
    annualBudgetCents: 2_000_000, currentSpentCents: 1_080_404, remainingBudgetCents: 919_596,
    items: [{ id: "1", name: "接插件", model: "2P", quantity: 12, unitPriceCents: 40, freightCents: 600, discountCents: 0, freightConfirmed: true, url: "", source: "dom", warnings: [] }],
    checkout: { payableCents: 1080, observedAt: "2026-08-19T00:00:00.000Z", matched: true, warnings: [] }
  };
}

describe("draft validation", () => {
  it("accepts a complete application", () => expect(validateDraft(validDraft())).toEqual({ valid: true, errors: [] }));

  it("requires explicit freight confirmation", () => {
    const draft = validDraft();
    draft.items[0]!.freightCents = null;
    draft.items[0]!.freightConfirmed = false;
    expect(validateDraft(draft).errors.join(" ")).toContain("运费尚未确认");
  });

  it("rejects inconsistent budgets", () => {
    const draft = validDraft();
    draft.remainingBudgetCents = 1;
    expect(validateDraft(draft).errors.join(" ")).toContain("预算关系不成立");
  });

  it("allows the requested optional procurement fields and an empty budget", () => {
    const draft = validDraft();
    draft.arrivalDate = "";
    draft.invoiceDate = "";
    draft.inventory = "";
    draft.custodian = "";
    draft.purpose = "";
    draft.finishedProduct = "";
    draft.annualBudgetCents = null;
    draft.currentSpentCents = null;
    draft.remainingBudgetCents = null;
    expect(validateDraft(draft)).toEqual({ valid: true, errors: [] });
  });

  it("requires all three budget values only when one is entered", () => {
    const draft = validDraft();
    draft.remainingBudgetCents = null;
    expect(validateDraft(draft).errors.join(" ")).toContain("如填写预算");
  });

  it("blocks a mismatch with the observed checkout total", () => {
    const draft = validDraft();
    draft.checkout!.payableCents = 1079;
    expect(validateDraft(draft).errors.join(" ")).toContain("应付金额不一致");
  });
});

describe("team config", () => {
  it("checks the public schema version", () => {
    expect(validateTeamConfig({ schemaVersion: 1, teamName: "车队", department: "电控", leader: "", captain: "", teacher: "", annualBudgetCents: null, templateVersion: "1.0.0" })).toBe(true);
    expect(validateTeamConfig({ schemaVersion: 2 })).toBe(false);
  });

  it("migrates the legacy v1 shape without losing defaults", () => {
    const migrated = parseTeamConfig({ schemaVersion: 1, teamName: "车队", department: "电控", leader: "组长", captain: "队长", teacher: "老师", annualBudgetCents: 100, templateVersion: "1.0.0" });
    expect(migrated).toEqual(expect.objectContaining({
      configVersion: "1.0.0",
      departments: ["电控"],
      people: ["组长", "队长", "老师"]
    }));
  });
});
