import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { displayDate } from "./date";
import { applicationTotalCents, formatCents, lineTotalCents } from "./money";
import type { ApplicationDraft, CartItem } from "./types";

interface TemplateItem {
  name: string;
  model: string;
  quantity: string;
  unitPrice: string;
  freight: string;
  total: string;
}

function toTemplateItem(item: CartItem): TemplateItem {
  return {
    name: item.discountCents ? `${item.name}（优惠-${formatCents(item.discountCents)}元）` : item.name,
    model: item.model,
    quantity: String(item.quantity),
    unitPrice: formatCents(item.unitPriceCents),
    freight: formatCents(item.freightCents),
    total: formatCents(lineTotalCents(item))
  };
}

export function buildTemplateData(draft: ApplicationDraft) {
  const mainItems = draft.items.slice(0, 8).map(toTemplateItem);
  const appendixSource = draft.items.slice(8);
  const appendixItems = appendixSource.map(toTemplateItem);
  const appendixSubtotal = appendixSource.reduce((sum, item) => sum + (lineTotalCents(item) || 0), 0);
  return {
    department: draft.department,
    applicant: draft.applicant,
    purchaser: draft.purchaser,
    leader: draft.leader,
    captain: draft.captain,
    teacher: draft.teacher,
    amount: formatCents(applicationTotalCents(draft.items)),
    purchaseDate: displayDate(draft.purchaseDate),
    arrivalDate: displayDate(draft.arrivalDate),
    invoiceDate: displayDate(draft.invoiceDate),
    inventory: draft.inventory,
    custodian: draft.custodian,
    annualBudget: formatCents(draft.annualBudgetCents),
    currentSpent: formatCents(draft.currentSpentCents),
    remainingBudget: formatCents(draft.remainingBudgetCents),
    purpose: draft.purpose,
    finishedProduct: draft.finishedProduct,
    fillDate: displayDate(draft.purchaseDate),
    mainItems,
    hasAppendix: appendixItems.length ? [{
      department: draft.department,
      applicant: draft.applicant,
      purchaseDate: displayDate(draft.purchaseDate),
      appendixItems,
      appendixSubtotal: formatCents(appendixSubtotal)
    }] : []
  };
}

export async function generateDocxBlob(draft: ApplicationDraft): Promise<Blob> {
  const response = await fetch(chrome.runtime.getURL("assets/purchase-template.docx"));
  if (!response.ok) throw new Error(`模板加载失败：${response.status}`);
  const bytes = await response.arrayBuffer();
  const doc = new Docxtemplater(new PizZip(bytes), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => ""
  });
  doc.render(buildTemplateData(draft));
  return doc.getZip().generate({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "").slice(0, 40) || "未填写";
}

export function applicationFilename(draft: ApplicationDraft): string {
  return `${draft.purchaseDate}-${safeFilenamePart(draft.department)}-${safeFilenamePart(draft.applicant)}-采购申请.docx`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.documentElement.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
