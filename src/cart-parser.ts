import { parseMoneyToCents } from "./money";
import type { CartItem, NetworkCandidate, ParseResult } from "./types";

const ITEM_CONTAINER_SELECTORS = [
  ".J_ItemHolder",
  ".item-holder",
  "[class*='CartItem']",
  "[class*='cartItem']",
  "[class*='Item--']",
  "[data-id][class*='item']"
];

function compact(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function productLink(container: Element): HTMLAnchorElement | null {
  const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")];
  return links.find((link) => /item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/.test(link.href)) || null;
}

function selectedContainerFor(checkbox: Element): Element | null {
  const row = checkbox.closest(ITEM_CONTAINER_SELECTORS.join(","));
  if (row && productLink(row)) return row;
  let current = checkbox.parentElement;
  for (let depth = 0; current && depth < 9; depth++, current = current.parentElement) {
    const links = [...current.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .filter((link) => /item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/.test(link.href));
    const productKeys = new Set(links.map((link) => {
      const parsed = new URL(link.href, location.href);
      return parsed.searchParams.get("id") || `${parsed.origin}${parsed.pathname}`;
    }));
    if (productKeys.size === 1 && compact(current.textContent).length > 10) return current;
    if (productKeys.size > 1) return null;
  }
  return null;
}

function readModel(container: Element): string {
  const selectors = ["[class*='sku']", "[class*='Sku']", "[class*='prop']", ".item-props", "[data-sku]"];
  for (const selector of selectors) {
    const text = compact(container.querySelector(selector)?.textContent);
    if (text && text.length < 300) return text.replace(/修改$/, "").trim();
  }
  return "待确认";
}

export function readQuantity(container: Element): number {
  const exactQuantity = (value: string | null | undefined): number => {
    const text = compact(value);
    return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : 0;
  };
  const inputs = container.querySelectorAll<HTMLInputElement>(
    "input[type='number'], input[class*='amount'], input[class*='quantity'], input[class*='Quantity'], input[aria-label*='数量']"
  );
  for (const input of inputs) {
    const quantity = exactQuantity(input.value || input.getAttribute("value"));
    if (quantity) return quantity;
  }
  // Taobao's +/- stepper can render its number as plain text between buttons.
  for (const element of container.querySelectorAll<HTMLElement>("button, [role='button']")) {
    if (!/^[+＋]$/.test(compact(element.textContent))) continue;
    const stepper = element.parentElement;
    if (!stepper || ![...stepper.children].some((child) => /^[-−－]$/.test(compact(child.textContent)))) continue;
    for (const child of stepper.children) {
      if (child === element || /^[-−－]$/.test(compact(child.textContent))) continue;
      const quantity = exactQuantity(child instanceof HTMLInputElement ? child.value : child.textContent);
      if (quantity) return quantity;
    }
  }
  for (const element of container.querySelectorAll<HTMLElement>("[data-quantity], [aria-label*='数量'], [class*='quantity'], [class*='Quantity']")) {
    const quantity = exactQuantity(element.dataset.quantity || element.getAttribute("aria-valuenow") || element.textContent);
    if (quantity) return quantity;
  }
  return 0;
}

function readUnitPrice(container: Element): number | null {
  const selectors = [
    "[data-unit-price]",
    "[data-price]",
    "[class*='price-now']",
    "[class*='Price--promotion']",
    "[class*='Price--actual']",
    "[class*='Price--priceText']",
    ".price-now",
    ".price-content",
    "[class*='Price--']",
    "[class*='price']"
  ];
  const excluded = /original|market|del|before|old|total|sum|freight|postage|运费|小计|原价/;
  const numericTokens = /\d+(?:\.\d{1,4})?/g;
  for (const selector of selectors) {
    for (const element of container.querySelectorAll<HTMLElement>(selector)) {
      const className = String(element.getAttribute("class") || "").toLowerCase();
      const raw = element.dataset.unitPrice || element.dataset.price || compact(element.textContent);
      if (!raw || excluded.test(`${className} ${raw.toLowerCase()}`)) continue;
      const values = raw.match(numericTokens) || [];
      if (values.length !== 1) continue;
      const cents = parseMoneyToCents(raw);
      if (cents !== null && cents >= 0) return cents;
    }
  }
  return null;
}

function normalizedText(value: string): string {
  return compact(value).toLowerCase();
}

function productIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url, location.href);
    return parsed.searchParams.get("id") || `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function itemIdentity(item: Pick<CartItem, "id" | "url" | "name" | "model">): string {
  // The same SKU can appear in two independent cart rows; never collapse it by
  // product URL and model alone.
  return item.id || `${productIdFromUrl(item.url)}|${normalizedText(item.name)}|${normalizedText(item.model)}`;
}

function sameItem(domItem: CartItem, networkItem: NetworkCandidate): boolean {
  if (domItem.id === networkItem.id) return true;
  const domProductId = productIdFromUrl(domItem.url);
  const networkProductId = productIdFromUrl(networkItem.url);
  const sameProduct = Boolean(domProductId) && (domProductId === networkItem.id || domProductId === networkProductId);
  if (!sameProduct) return false;
  const domModel = normalizedText(domItem.model);
  const networkModel = normalizedText(networkItem.model);
  return domModel === networkModel || domModel === "待确认" || networkModel === "待确认";
}

function deduplicateDomItems(items: CartItem[]): CartItem[] {
  const unique = new Map<string, CartItem>();
  for (const item of items) {
    const key = itemIdentity(item);
    const existing = unique.get(key);
    if (!existing || (existing.unitPriceCents === null && item.unitPriceCents !== null)) unique.set(key, item);
  }
  return [...unique.values()];
}

function mergeItems(domItems: CartItem[], networkItems: NetworkCandidate[]): CartItem[] {
  const merged = deduplicateDomItems(domItems);
  for (const candidate of networkItems) {
    const matches = merged.filter((item) => sameItem(item, candidate));
    if (matches.length === 1) {
      const matched = matches[0]!;
      if (matched.unitPriceCents === null && candidate.unitPriceCents !== null) {
        matched.unitPriceCents = candidate.unitPriceCents;
        matched.warnings = [...matched.warnings.filter((warning) => warning !== "单价未识别"), "单价来自页面数据兜底，请核对"];
      }
      if (!matched.quantity && candidate.quantity > 0) matched.quantity = candidate.quantity;
      continue;
    }
    if (matches.length > 1) continue; // Ambiguous fallback must not add a phantom line.
    merged.push({
      ...candidate,
      freightCents: null,
      freightConfirmed: false,
      source: "network",
      warnings: ["来自页面数据兜底，请核对选中状态", "运费待确认", "页面价格需在结算前确认"]
    });
  }
  return merged;
}

function itemFromContainer(container: Element, index: number): CartItem | null {
  const link = productLink(container);
  if (!link) return null;
  const name = compact(link.getAttribute("title")) || compact(link.textContent) || compact(
    container.querySelector("[class*='title'], [class*='Title']")?.textContent
  );
  if (!name) return null;
  const url = link.href;
  const id = container.getAttribute("data-id") || container.getAttribute("data-itemid") ||
    `${new URL(url, location.href).searchParams.get("id") || name}-row-${index}`;
  const price = readUnitPrice(container);
  const model = readModel(container);
  const warnings = ["运费待确认", "页面价格需在结算前确认"];
  if (model === "待确认") warnings.push("型号/规格未识别");
  if (price === null) warnings.push("单价未识别");
  const quantity = readQuantity(container);
  if (!quantity) warnings.push("数量未识别，请核对");
  return {
    id,
    name,
    model,
    quantity,
    unitPriceCents: price,
    freightCents: null,
    freightConfirmed: false,
    url,
    source: "dom",
    warnings
  };
}

export function parseCartDocument(document: Document, networkItems: NetworkCandidate[] = []): ParseResult {
  const checked = [...document.querySelectorAll<HTMLInputElement>(
    "input[type='checkbox']:checked, [role='checkbox'][aria-checked='true']"
  )];
  const containers = new Set<Element>();
  for (const selected of checked) {
    const container = selectedContainerFor(selected);
    if (container) containers.add(container);
  }
  if (!containers.size) {
    for (const selector of ITEM_CONTAINER_SELECTORS) {
      for (const container of document.querySelectorAll(selector)) {
        if (container.matches("[class*='selected'], [aria-selected='true']") ||
            container.querySelector("input[type='checkbox']:checked, [aria-checked='true']")) {
          containers.add(container);
        }
      }
    }
  }

  // A checked shop/group checkbox can resolve to a wrapper containing only
  // one product, while that product has its own checked checkbox. Keep the
  // innermost selected item container; never deduplicate by SKU, because two
  // independent cart rows may legitimately have the same SKU.
  const itemContainers = [...containers].filter((container) =>
    ![...containers].some((other) => other !== container && container.contains(other)));

  const domItems = itemContainers
    .map((container, index) => itemFromContainer(container, index))
    .filter((item): item is CartItem => Boolean(item));
  const items = mergeItems(domItems, networkItems);
  const warnings: string[] = [];
  if (!checked.length) warnings.push("未检测到原生勾选框，已尝试页面状态兜底");
  if (!domItems.length && networkItems.length) warnings.push("DOM读取失败，当前结果完全来自页面数据兜底");
  if (!items.length) warnings.push("没有识别到已勾选商品；请滚动购物车使商品加载后重试");

  return {
    items,
    diagnostics: {
      checkedInputs: checked.length,
      candidateContainers: itemContainers.length,
      domItems: domItems.length,
      networkItems: networkItems.length,
      mergedItems: items.length,
      warnings
    }
  };
}
