import { parseMoneyToCents } from "./money";
import type { NetworkCandidate } from "./types";

const TITLE_KEYS = ["title", "itemTitle", "item_title", "name", "itemName"];
const MODEL_KEYS = ["skuText", "skuDesc", "skuName", "sku", "properties", "itemSkuText"];
const QUANTITY_KEYS = ["quantity", "amount", "count", "num", "buyAmount"];
const PRICE_KEYS = ["promotionPrice", "actualPrice", "nowPrice", "price", "priceText"];
const URL_KEYS = ["url", "itemUrl", "item_url", "detailUrl"];
const ID_KEYS = ["itemId", "item_id", "cartId", "cart_id", "id"];
const SELECT_KEYS = ["selected", "checked", "isChecked", "isSelected"];

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return undefined;
}

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return scalar(firstValue(record, ["text", "value", "name", "priceText", "display"]));
  }
  return "";
}

function isSelected(record: Record<string, unknown>): boolean {
  const value = firstValue(record, SELECT_KEYS);
  return value === true || value === 1 || value === "1" || value === "true" || value === "selected";
}

export function extractNetworkCandidates(payload: unknown): NetworkCandidate[] {
  const results: NetworkCandidate[] = [];
  const visited = new Set<object>();

  function walk(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || depth > 9 || visited.has(value as object)) return;
    visited.add(value as object);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 1000)) walk(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    const name = scalar(firstValue(record, TITLE_KEYS));
    const quantityText = scalar(firstValue(record, QUANTITY_KEYS));
    const priceText = scalar(firstValue(record, PRICE_KEYS));
    if (isSelected(record) && name && quantityText && priceText) {
      const quantity = /^\d+$/.test(quantityText) && Number(quantityText) > 0 ? Number(quantityText) : 0;
      const url = scalar(firstValue(record, URL_KEYS));
      const id = scalar(firstValue(record, ID_KEYS)) || url || `${name}-${results.length}`;
      results.push({
        id,
        name,
        model: scalar(firstValue(record, MODEL_KEYS)) || "待确认",
        quantity,
        unitPriceCents: parseMoneyToCents(priceText),
        url
      });
    }
    for (const child of Object.values(record)) walk(child, depth + 1);
  }

  walk(payload, 0);
  const unique = new Map<string, NetworkCandidate>();
  for (const candidate of results) unique.set(candidate.id, candidate);
  return [...unique.values()];
}
