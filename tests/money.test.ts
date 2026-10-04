import { describe, expect, it } from "vitest";
import { applicationTotalCents, formatCents, lineTotalCents, parseMoneyToCents } from "../src/money";

describe("money", () => {
  it("converts displayed prices to integer cents", () => {
    expect(parseMoneyToCents("￥1,234.56")).toBe(123456);
    expect(parseMoneyToCents("0.4元")).toBe(40);
    expect(parseMoneyToCents("待确认")).toBeNull();
  });

  it("calculates line and application totals without floating point drift", () => {
    const first = { quantity: 12, unitPriceCents: 40, freightCents: 600 };
    const second = { quantity: 3, unitPriceCents: 10, freightCents: 0 };
    expect(lineTotalCents(first)).toBe(1080);
    expect(applicationTotalCents([first, second])).toBe(1110);
    expect(formatCents(1110)).toBe("11.10");
  });

  it("refuses totals while freight is unknown", () => {
    expect(lineTotalCents({ quantity: 1, unitPriceCents: 100, freightCents: null })).toBeNull();
  });
});
