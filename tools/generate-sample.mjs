import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

const root = process.cwd();
const template = await readFile(join(root, "src/assets/purchase-template.docx"));
const zip = new PizZip(template);
const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
  nullGetter: () => ""
});

const itemCountArg = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
const itemCount = Math.max(1, Number(itemCountArg || 9));
const longTitle = process.argv.includes("--long-title");
const checkoutCase = process.argv.includes("--checkout-case");
const allItems = checkoutCase ? [
  { name: "玻璃鼠标垫（优惠-81.49元）", model: "黑色", quantity: "7", unitPrice: "119.00", freight: "6.00", total: "757.51" },
  { name: "相机后背（优惠-48.92元）", model: "标准", quantity: "2", unitPrice: "250.00", freight: "0.00", total: "451.08" },
  { name: "胶卷（优惠-9.59元）", model: "彩色", quantity: "2", unitPrice: "49.00", freight: "0.00", total: "88.41" }
] : Array.from({ length: itemCount }, (_, index) => ({
  name: index === 0 && longTitle ? "惊喜盲盒 NuPhy 299 特价捡漏有线无线三模机械磁轴键盘"
    : index === 0 ? "双绞屏蔽线" : `测试物品${index + 1}`,
  model: index === 0 && longTitle ? "全新惊喜盲盒，键盘盲盒，适配多种轴体规格"
    : index === 0 ? "2×0.5mm²" : `型号-${String(index + 1).padStart(2, "0")}`,
  quantity: index === 0 ? "1" : "2",
  unitPrice: index === 0 ? "162.80" : "10.00",
  freight: index === 0 ? "0.00" : "1.00",
  total: index === 0 ? "162.80" : "21.00"
}));
const appendixItems = allItems.slice(8);
const total = allItems.reduce((sum, item) => sum + Number(item.total), 0);
doc.render({
  department: "电控",
  applicant: "示例申请人",
  purchaser: "示例采购人",
  leader: "示例组长",
  captain: "示例队长",
  teacher: "示例老师",
  amount: total.toFixed(2),
  purchaseDate: "2026.08.19",
  arrivalDate: "2026.08.26",
  inventory: "库存不足",
  custodian: "示例保管人",
  invoiceDate: "",
  annualBudget: "20000.00",
  currentSpent: "10804.04",
  remainingBudget: "9195.96",
  purpose: "车辆电气系统调试",
  finishedProduct: "整车低压线束",
  fillDate: "2026.08.19",
  mainItems: allItems.slice(0, 8),
  hasAppendix: appendixItems.length ? [{
    department: "电控",
    applicant: "示例申请人",
    purchaseDate: "2026.08.19",
    appendixItems,
    appendixSubtotal: appendixItems.reduce((sum, item) => sum + Number(item.total), 0).toFixed(2)
  }] : []
});

const output = process.argv[3] ? resolve(process.argv[3]) : join(root, "release", "采购申请表示例.docx");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`示例文件：${output}`);
