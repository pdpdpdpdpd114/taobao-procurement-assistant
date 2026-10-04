import { readQuantity } from "./cart-parser";
import { parseMoneyToCents } from "./money";
import type { CartItem } from "./types";

export interface CheckoutRead {
  items: CartItem[];
  payableCents: number | null;
  matched: boolean;
  warnings: string[];
}

const compact = (value: string | null | undefined): string => (value || "").replace(/\s+/g, "");
const money = (value: string): number | null => {
  const found = value.match(/[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/);
  return found ? parseMoneyToCents(found[1]) : null;
};
const leaves = (root: ParentNode): Element[] => [...root.querySelectorAll("span,div,p,a,strong,b,label,h1,h2,h3,h4")]
  .filter((element) => !element.children.length && !element.closest("#taobao-procurement-assistant-host"));

function labeledAmount(root: ParentNode, label: RegExp): number | null {
  for (const element of leaves(root)) {
    const ownText = compact(element.textContent);
    if (!label.test(ownText)) {
      const inlineLabel = ownText.replace(/[¥￥].*$/, "").replace(/(?:包邮|免运费|免费).*$/, "");
      if (label.test(inlineLabel)) {
        const inlineAmount = money(ownText);
        if (inlineAmount !== null) return inlineAmount;
        if (/包邮|免运费|免费/.test(ownText)) return 0;
      }
      continue;
    }
    const parent = element.parentElement;
    if (!parent) continue;
    for (const sibling of [...parent.children].filter((child) => child !== element)) {
      const value = money(sibling.textContent || "");
      if (value !== null) return value;
      if (/包邮|免运费|免费/.test(sibling.textContent || "")) return 0;
    }
    const value = money(parent.textContent || "");
    if (value !== null) return value;
    if (/包邮|免运费|免费/.test(parent.textContent || "")) return 0;
  }
  return null;
}

function shippingAmount(label: Element): number | null {
  const row = label.parentElement;
  if (!row) return null;
  const amounts = leaves(row).filter((element) => element !== label)
    .map((element) => money(element.textContent || "")).filter((value): value is number => value !== null);
  if (amounts.length === 1) return amounts[0]!;
  if (amounts.length > 1) return null;
  return /包邮|免运费|免费/.test(row.textContent || "") ? 0 : null;
}

function orderRoot(document: Document): Element | null {
  const heading = leaves(document).find((element) => /^确认订单信息$/.test(compact(element.textContent)));
  if (!heading) return null;
  for (let node = heading.parentElement; node && node !== document.body; node = node.parentElement) {
    const text = compact(node.textContent);
    if (/店铺宝贝/.test(text) && /商品属性/.test(text) && /数量/.test(text) && /价格/.test(text) &&
        [...node.querySelectorAll("button,[role='button']")].some((button) => /^[+＋]$/.test(compact(button.textContent)))) return node;
  }
  return null;
}

function productRows(root: Element): Element[] {
  const rows: Element[] = [];
  for (const plus of root.querySelectorAll("button,[role='button']")) {
    if (!/^[+＋]$/.test(compact(plus.textContent))) continue;
    const stepper = plus.parentElement;
    if (!stepper || readQuantity(stepper) <= 0 || isHidden(plus, root)) continue;
    let row: Element | null = stepper;
    while (row && row !== root) {
      const prices = priceCandidates(row);
      const names = leaves(row).filter((leaf) => {
        const value = compact(leaf.textContent);
        return value.length >= 2 && !/^[¥￥\d+＋−－-]/.test(value) &&
          !/^(店铺宝贝|商品属性|数量|价格|支持信用卡支付|如实描述|配送服务|订单备注)/.test(value);
      });
      if (prices.length && names.length) break;
      row = row.parentElement;
    }
    if (row && row !== root && !rows.some((existing) => existing === row || existing.contains(row!) || row!.contains(existing))) rows.push(row);
  }
  return rows;
}

function isHidden(element: Element, root: Element): boolean {
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")) return true;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === "none" || style?.visibility === "hidden") return true;
  }
  return false;
}

function rowName(row: Element): { name: string; url: string; model: string } {
  const anchors = [...row.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((anchor) => compact(anchor.textContent).length >= 2);
  const candidate = anchors.find((anchor) => /item\.|detail\.|item\.taobao|detail\.tmall/.test(anchor.href)) || anchors[0];
  const candidates = leaves(row).filter((leaf) => {
    const value = compact(leaf.textContent);
    return value.length >= 2 && !/^[¥￥\d+＋−－-]/.test(value) &&
      !/^(支持信用卡支付|如实描述|配送服务|订单备注|退货宝|免费|运费险|快递)/.test(value);
  });
  const name = (candidate?.textContent || candidates.sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0))[0]?.textContent || "").trim();
  const model = [...row.querySelectorAll("[class*='sku'],[class*='Sku'],[class*='prop'],[class*='Prop']")]
    .map((element) => (element.textContent || "").trim()).find((value) => value && value !== name) || "未标注";
  return { name, url: candidate?.href || "", model };
}

function priceCandidates(row: Element): number[] {
  const prices = leaves(row).flatMap((leaf) => {
    const value = (leaf.textContent || "").trim();
    // A row can show "优惠后 ¥99" beside a struck-through "¥119".
    // Keep both until the merchandise subtotal determines which is charged.
    if (!/[¥￥]\s*[\d,]+(?:\.\d{1,2})?/.test(value) || /运费|运费险|配送|返现/.test(value)) return [];
    const cents = money(value);
    return cents === null ? [] : [cents];
  });
  return [...new Set(prices)];
}

function choosePrices(rows: Element[], quantities: number[], merchandise: number | null): number[] | null {
  const candidates = rows.map(priceCandidates);
  if (candidates.some((list) => !list.length) || merchandise === null) return null;
  // Count solutions, not just the first match: two valid allocations need
  // manual confirmation rather than an arbitrary price choice.
  let states = new Map<number, { count: number; prices: number[] }>([[0, { count: 1, prices: [] }]]);
  for (const [index, list] of candidates.entries()) {
    const next = new Map<number, { count: number; prices: number[] }>();
    for (const [subtotal, state] of states) for (const price of list) {
      const sum = subtotal + price * quantities[index]!;
      if (sum > merchandise) continue;
      const previous = next.get(sum);
      next.set(sum, { count: Math.min(2, (previous?.count || 0) + state.count),
        prices: previous?.prices || [...state.prices, price] });
    }
    if (next.size > 20000) return null;
    states = next;
  }
  const result = states.get(merchandise);
  return result?.count === 1 ? result.prices : null;
}

function reconcileDuplicateRows(rows: Element[], expectedQuantity: number | null, merchandise: number | null): Element[] | null {
  if (expectedQuantity === null || merchandise === null) return null;
  const groups = new Map<string, Element[]>();
  for (const row of rows) {
    const title = rowName(row);
    const key = [compact(title.name), compact(title.model), readQuantity(row), priceCandidates(row).join(",")].join("|");
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  if (![...groups.values()].some((group) => group.length > 1)) return rows;
  const values = [...groups.values()];
  let attempts = 0;
  const result: { solution: Element[] | null; ambiguous: boolean } = { solution: null, ambiguous: false };
  const search = (index: number, chosen: Element[], quantity: number): void => {
    if (++attempts > 4096 || result.ambiguous) return;
    if (index === values.length) {
      if (quantity !== expectedQuantity || !choosePrices(chosen, chosen.map(readQuantity), merchandise)) return;
      if (result.solution) result.ambiguous = true;
      else result.solution = chosen;
      return;
    }
    const group = values[index]!;
    for (let keep = 1; keep <= group.length; keep++) {
      const nextQuantity = quantity + keep * readQuantity(group[0]!);
      if (nextQuantity <= expectedQuantity) search(index + 1, [...chosen, ...group.slice(0, keep)], nextQuantity);
    }
  };
  search(0, [], 0);
  return attempts > 4096 || result.ambiguous || !result.solution?.length ? null : result.solution.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
}

function allocateDiscount(items: CartItem[], cents: number): void {
  const bases = items.map((item) => item.quantity * (item.unitPriceCents || 0));
  const total = bases.reduce((sum, value) => sum + value, 0);
  if (!total) return;
  const shares = bases.map((base) => Math.floor(cents * base / total));
  const ranking = bases.map((base, index) => ({ index, remainder: cents * base % total }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0, remainder = cents - shares.reduce((sum, value) => sum + value, 0); i < remainder; i++) shares[ranking[i]!.index]!++;
  items.forEach((item, index) => { item.discountCents = shares[index]!; item.discountSource = "checkout"; });
}

export function parseCheckoutDocument(document: Document, cartItems: CartItem[] = []): CheckoutRead {
  const warnings: string[] = [];
  const root = orderRoot(document);
  let rows = root ? productRows(root) : [];
  if (!root) warnings.push("未找到确认订单信息区域，请等待页面加载完成后重新读取");
  if (!rows.length) warnings.push("确认订单页商品明细未能读取");
  const summary = leaves(document).find((element) => /^付款详情(?:共\d+件商品)?$/.test(compact(element.textContent)));
  let summaryRoot: Element | Document = document;
  if (summary) {
    for (let node = summary.parentElement; node && node !== document.body; node = node.parentElement) {
      if (labeledAmount(node, /^商品总价$/) !== null && labeledAmount(node, /^运费$/) !== null &&
          (labeledAmount(node, /^合计[:：]?$/) !== null || labeledAmount(node, /^应付金额$/) !== null)) { summaryRoot = node; break; }
    }
  }
  const merchandise = labeledAmount(summaryRoot, /^商品总价$/);
  const freight = labeledAmount(summaryRoot, /^运费$/);
  const payable = labeledAmount(summaryRoot, /^合计[:：]?$/) ?? labeledAmount(summaryRoot, /^应付金额$/);
  const expectedQuantityText = [...leaves(summaryRoot), ...leaves(document)].map((leaf) => compact(leaf.textContent))
    .map((value) => value.match(/^共(\d+)件商品$/)?.[1]).find(Boolean);
  const expectedQuantity = expectedQuantityText ? Number(expectedQuantityText) : null;
  const reconciledRows = reconcileDuplicateRows(rows, expectedQuantity, merchandise);
  if (reconciledRows) rows = reconciledRows;
  else if (rows.length && expectedQuantity !== null && rows.reduce((sum, row) => sum + readQuantity(row), 0) > expectedQuantity)
    warnings.push("页面出现重复商品行，无法唯一判定应保留哪一行");
  const items = rows.map((row, index): CartItem => {
    const title = rowName(row);
    const candidates = priceCandidates(row);
    const price = candidates.length === 1 ? candidates[0]! : null;
    const quantity = readQuantity(row);
    if (!title.name || quantity <= 0 || !candidates.length) warnings.push(`第${index + 1}项名称、单价或数量未能确认`);
    return { id: `checkout-${index}`, name: title.name, model: title.model, quantity, unitPriceCents: price,
      freightCents: null, freightConfirmed: false, discountCents: null, priceSource: "checkout",
      url: title.url, source: "dom", warnings: [] };
  });
  const selectedPrices = choosePrices(rows, items.map((item) => item.quantity), merchandise);
  if (selectedPrices) items.forEach((item, index) => {
    item.unitPriceCents = selectedPrices[index]!;
    if (priceCandidates(rows[index]!).length > 1)
      item.warnings.push("页面显示多个价格，已按商品总价核定单价；请人工复核");
  });
  else if (rows.length && merchandise !== null) warnings.push("页面存在多个单价，无法唯一核对商品总价");
  if (expectedQuantity === null) warnings.push("付款详情中的商品件数未识别");
  else if (items.reduce((sum, item) => sum + item.quantity, 0) !== expectedQuantity) warnings.push("商品件数与付款详情不一致");
  if (merchandise === null || items.reduce((sum, item) => sum + item.quantity * (item.unitPriceCents || 0), 0) !== merchandise)
    warnings.push("商品明细金额与付款详情的商品总价不一致");
  if (freight === null) warnings.push("付款详情运费未识别");
  if (payable === null) warnings.push("付款详情应付总额未识别");
  const shipping = root ? leaves(root).filter((leaf) => /^配送服务$/.test(compact(leaf.textContent))) : [];
  if (freight !== null && (shipping.length <= 1 || freight === 0)) {
    items.forEach((item, index) => { item.freightCents = index === 0 ? freight : 0; item.freightConfirmed = true; item.freightSource = "checkout"; });
  } else if (freight !== null) {
    const charges = shipping.map(shippingAmount);
    const groups = shipping.map((label, shop) => rows.flatMap((row, index) => {
      const afterPrevious = shop === 0 || Boolean(shipping[shop - 1]!.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
      const beforeCurrent = Boolean(row.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING);
      return afterPrevious && beforeCurrent ? [index] : [];
    }));
    if (charges.some((charge) => charge === null) || charges.reduce<number>((sum, charge) => sum + (charge || 0), 0) !== freight ||
        groups.flat().length !== items.length) warnings.push("多店铺运费无法逐店归属，请人工核对");
    else groups.forEach((group, shop) => group.forEach((index, position) => {
      const item = items[index]!; item.freightCents = position ? 0 : charges[shop]!; item.freightConfirmed = true; item.freightSource = "checkout";
    }));
  }
  if (merchandise !== null && freight !== null && payable !== null) {
    const discount = merchandise + freight - payable;
    const shown = [labeledAmount(summaryRoot, /^店铺优惠$/), labeledAmount(summaryRoot, /^平台优惠$/), labeledAmount(summaryRoot, /^红包$/)];
    const shownTotal = shown.reduce<number>((sum, value) => sum + (value || 0), 0);
    if (discount < 0 || discount > merchandise || shownTotal !== discount) warnings.push("优惠与应付总额不一致，请人工核对");
    else allocateDiscount(items, discount);
  }
  if (cartItems.length) {
    const normalized = (item: CartItem) => compact(item.name).toLowerCase();
    if (cartItems.length !== items.length || cartItems.some((item, index) =>
      !(normalized(item).includes(normalized(items[index]!)) || normalized(items[index]!).includes(normalized(item))) || item.quantity !== items[index]!.quantity))
      warnings.push("确认订单商品与此前购物车记录不同，请以当前页面逐项核对");
  }
  if (payable !== null && items.reduce((sum, item) => sum + item.quantity * (item.unitPriceCents || 0) + (item.freightCents || 0) - (item.discountCents || 0), 0) !== payable)
    warnings.push("明细合计与应付金额不一致");
  return { items, payableCents: payable, matched: warnings.length === 0, warnings };
}
