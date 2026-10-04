import type { ParseDiagnostics } from "./types";

export interface DiagnosticReport {
  extensionVersion: string;
  generatedAt: string;
  page: string;
  parse: ParseDiagnostics;
  visibleProductLinks: number;
  visibleCheckboxes: number;
  fieldCompleteness: Array<{
    nameLength: number;
    modelLength: number;
    hasPrice: boolean;
    hasFreight: boolean;
    source: string;
    warningCount: number;
  }>;
}

export function createDiagnosticReport(parse: ParseDiagnostics, items: Array<{
  name: string;
  model: string;
  unitPriceCents: number | null;
  freightCents: number | null;
  source: string;
  warnings: string[];
}>): DiagnosticReport {
  return {
    extensionVersion: chrome.runtime.getManifest().version,
    generatedAt: new Date().toISOString(),
    page: location.origin + location.pathname,
    parse,
    visibleProductLinks: document.querySelectorAll("a[href*='item.taobao.com'], a[href*='detail.tmall.com']").length,
    visibleCheckboxes: document.querySelectorAll("input[type='checkbox'], [role='checkbox']").length,
    fieldCompleteness: items.map((item) => ({
      nameLength: item.name.length,
      modelLength: item.model.length,
      hasPrice: item.unitPriceCents !== null,
      hasFreight: item.freightCents !== null,
      source: item.source,
      warningCount: item.warnings.length
    }))
  };
}
