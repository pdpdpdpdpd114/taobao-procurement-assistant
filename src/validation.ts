import { applicationTotalCents } from "./money";
import type { ApplicationDraft, TeamConfig } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_FIELDS: Array<[keyof ApplicationDraft, string]> = [
  ["department", "部门"],
  ["applicant", "申请人"],
  ["purchaser", "采购人"],
  ["leader", "组长"],
  ["captain", "队长/副队长"],
  ["teacher", "总负责老师"],
  ["purchaseDate", "采购时间"]
];

export function validateDraft(draft: ApplicationDraft): ValidationResult {
  const errors: string[] = [];
  for (const [key, label] of REQUIRED_FIELDS) {
    if (typeof draft[key] !== "string" || !String(draft[key]).trim()) {
      errors.push(`请填写${label}`);
    }
  }
  if (!draft.items.length) errors.push("没有可导出的采购商品");

  draft.items.forEach((item, index) => {
    const prefix = `第${index + 1}项`;
    if (!item.name.trim()) errors.push(`${prefix}缺少物品名称`);
    if (!item.model.trim()) errors.push(`${prefix}缺少型号/规格`);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) errors.push(`${prefix}数量必须是正整数`);
    if (item.unitPriceCents === null || item.unitPriceCents < 0) errors.push(`${prefix}单价无效`);
    if (!item.freightConfirmed || item.freightCents === null || item.freightCents < 0) {
      errors.push(`${prefix}运费尚未确认；无运费时请明确填写0`);
    }
    if (item.discountCents === null || (item.discountCents ?? 0) < 0) errors.push(`${prefix}优惠尚未确认`);
    if (item.unitPriceCents !== null && item.discountCents !== null &&
        (item.discountCents || 0) > item.quantity * item.unitPriceCents + (item.freightCents || 0)) {
      errors.push(`${prefix}优惠超过商品和运费金额`);
    }
  });

  const budgetFields = [draft.annualBudgetCents, draft.currentSpentCents, draft.remainingBudgetCents];
  const hasBudget = budgetFields.some((value) => value !== null);
  if (hasBudget && budgetFields.some((value) => value === null || value < 0)) {
    errors.push("如填写预算，年度预算、目前金额和剩余金额必须同时填写有效的非负金额");
  } else if (hasBudget && draft.annualBudgetCents! - draft.currentSpentCents! !== draft.remainingBudgetCents) {
    errors.push("预算关系不成立：年度预算－目前金额必须等于剩余金额");
  }

  const total = applicationTotalCents(draft.items);
  if (total === null) errors.push("申请总金额无法计算");
  if (!draft.checkout?.matched || draft.checkout.payableCents === null || draft.checkout.payableCents < 0) errors.push("请先在确认订单页核对商品及应付金额");
  else if (total !== null && total !== draft.checkout.payableCents) errors.push("采购金额与确认订单页应付金额不一致，请核对优惠和运费");
  return { valid: errors.length === 0, errors };
}

export function parseTeamConfig(value: unknown): TeamConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Partial<TeamConfig>;
  const valid = config.schemaVersion === 1 &&
    typeof config.teamName === "string" &&
    typeof config.department === "string" &&
    typeof config.leader === "string" &&
    typeof config.captain === "string" &&
    typeof config.teacher === "string" &&
    (config.annualBudgetCents === null || (Number.isInteger(config.annualBudgetCents) && config.annualBudgetCents! >= 0)) &&
    typeof config.templateVersion === "string";
  if (!valid) return null;
  const departments = Array.isArray(config.departments)
    ? config.departments.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [config.department!].filter(Boolean);
  const people = Array.isArray(config.people)
    ? config.people.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [config.leader, config.captain, config.teacher].filter((item): item is string => Boolean(item));
  return {
    schemaVersion: 1,
    configVersion: typeof config.configVersion === "string" ? config.configVersion : "1.0.0",
    teamName: config.teamName!,
    departments: [...new Set(departments)],
    people: [...new Set(people)],
    department: config.department!,
    leader: config.leader!,
    captain: config.captain!,
    teacher: config.teacher!,
    annualBudgetCents: config.annualBudgetCents ?? null,
    budgetPolicy: typeof config.budgetPolicy === "string"
      ? config.budgetPolicy
      : "年度预算－目前金额＝剩余金额；本次申请金额不自动并入目前金额",
    templateVersion: config.templateVersion!
  };
}

export function validateTeamConfig(value: unknown): value is TeamConfig {
  return parseTeamConfig(value) !== null;
}
