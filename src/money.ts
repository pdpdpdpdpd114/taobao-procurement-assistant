export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const normalized = input
    .replace(/[,，\s]/g, "")
    .replace(/[￥¥元]/g, "")
    .match(/-?\d+(?:\.\d{1,4})?/);
  if (!normalized) return null;
  const number = Number(normalized[0]);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

export function lineTotalCents(item: {
  quantity: number;
  unitPriceCents: number | null;
  freightCents: number | null;
  discountCents?: number | null;
}): number | null {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPriceCents === null || item.freightCents === null || item.discountCents === null) return null;
  return item.quantity * item.unitPriceCents + item.freightCents - (item.discountCents || 0);
}

export function applicationTotalCents(items: Array<Parameters<typeof lineTotalCents>[0]>): number | null {
  let total = 0;
  for (const item of items) {
    const line = lineTotalCents(item);
    if (line === null) return null;
    total += line;
  }
  return total;
}
