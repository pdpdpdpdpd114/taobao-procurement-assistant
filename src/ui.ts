import { parseCartDocument } from "./cart-parser";
import { parseCheckoutDocument } from "./checkout-parser";
import { isoDateWithOffset } from "./date";
import { createDiagnosticReport } from "./diagnostics";
import { applicationFilename, downloadBlob, generateDocxBlob } from "./docx";
import { applicationTotalCents, formatCents, lineTotalCents, parseMoneyToCents } from "./money";
import { clearAllLocalData, createLocalDataBackup, loadLocalData, restoreLocalDataBackup, saveCartSelection, saveDraft, saveProfile, saveTeamConfig } from "./storage";
import { ASSISTANT_STYLES } from "./styles";
import type { ApplicationDraft, CartItem, NetworkCandidate, ParseDiagnostics, PersonalProfile, TeamConfig } from "./types";
import { parseTeamConfig, validateDraft } from "./validation";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char] || char);
}

function defaultDraft(items: CartItem[]): ApplicationDraft {
  return {
    department: "",
    applicant: "",
    purchaser: "",
    leader: "",
    captain: "",
    teacher: "",
    purchaseDate: isoDateWithOffset(0),
    arrivalDate: isoDateWithOffset(7),
    // Optional by policy: never prefill a date that the applicant has not set.
    invoiceDate: "",
    inventory: "",
    custodian: "",
    purpose: "",
    finishedProduct: "",
    annualBudgetCents: null,
    currentSpentCents: null,
    remainingBudgetCents: null,
    items
  };
}

function profileFromDraft(draft: ApplicationDraft): PersonalProfile {
  return {
    department: draft.department,
    applicant: draft.applicant,
    purchaser: draft.purchaser,
    leader: draft.leader,
    captain: draft.captain,
    teacher: draft.teacher
  };
}

function mergeDefaults(base: ApplicationDraft, stored: Awaited<ReturnType<typeof loadLocalData>>): ApplicationDraft {
  const draft = stored.draft || ({} as Partial<ApplicationDraft>);
  const profile = stored.profile || ({} as Partial<PersonalProfile>);
  const team = stored.team || ({} as Partial<TeamConfig>);
  return {
    ...base,
    ...draft,
    department: draft.department || profile.department || team.department || "",
    applicant: draft.applicant || profile.applicant || "",
    purchaser: draft.purchaser || profile.purchaser || "",
    leader: draft.leader || profile.leader || team.leader || "",
    captain: draft.captain || profile.captain || team.captain || "",
    teacher: draft.teacher || profile.teacher || team.teacher || "",
    annualBudgetCents: draft.annualBudgetCents ?? team.annualBudgetCents ?? null,
    items: base.items.length ? base.items : (stored.draft?.items || [])
  };
}

function downloadJson(value: unknown, filename: string): void {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" }), filename);
}

export class ProcurementAssistant {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly networkItems: NetworkCandidate[];
  private draft: ApplicationDraft = defaultDraft([]);
  private teamConfig?: TeamConfig;
  private diagnostics: ParseDiagnostics = {
    checkedInputs: 0, candidateContainers: 0, domItems: 0, networkItems: 0, mergedItems: 0, warnings: []
  };
  private open = false;
  private readonly checkoutPage = location.hostname === "buy.taobao.com";
  private cartUpdateTimer?: ReturnType<typeof setTimeout>;
  private draftSaveTimer?: ReturnType<typeof setTimeout>;
  private cartReadSignature = "";
  private lastParsedCartItems: CartItem[] = [];

  constructor(networkItems: NetworkCandidate[]) {
    this.networkItems = networkItems;
    this.host = document.createElement("div");
    this.host.id = "taobao-procurement-assistant-host";
    this.shadow = this.host.attachShadow({ mode: "open" });
  }

  async mount(): Promise<void> {
    if (document.getElementById(this.host.id)) return;
    document.documentElement.appendChild(this.host);
    const stored = await loadLocalData();
    this.teamConfig = stored.team;
    if (this.checkoutPage) {
      const checkout = parseCheckoutDocument(document);
      this.diagnostics = { checkedInputs: 0, candidateContainers: checkout.items.length,
        domItems: checkout.items.length, networkItems: 0, mergedItems: checkout.items.length,
        warnings: checkout.warnings };
      this.draft = mergeDefaults(defaultDraft(checkout.items), stored);
      this.draft.checkout = {
        payableCents: checkout.payableCents, observedAt: new Date().toISOString(),
        matched: checkout.matched,
        warnings: checkout.warnings
      };
    } else {
      const parsed = parseCartDocument(document, this.networkItems);
      this.diagnostics = parsed.diagnostics;
      this.draft = mergeDefaults(defaultDraft(parsed.items), stored);
      this.draft.items = this.restoreSavedCartItems(parsed.items, stored.draft?.items || []);
      this.draft.checkout = undefined;
      await this.rememberCart(parsed.items);
      this.observeCartChanges();
    }
    this.render();
  }

  private async rememberCart(items: CartItem[]): Promise<void> {
    if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
    await Promise.all([
      saveCartSelection({ schemaVersion: 1, capturedAt: new Date().toISOString(), items }),
      saveDraft(this.draft)
    ]);
    this.cartReadSignature = this.cartSignature(items);
    this.lastParsedCartItems = items.map((item) => ({ ...item, warnings: [...item.warnings] }));
  }

  private cartSignature(items: CartItem[]): string {
    return JSON.stringify(items.map(({ id, name, model, quantity, unitPriceCents }) =>
      [id, name, model, quantity, unitPriceCents]));
  }

  private scheduleDraftSave(): void {
    if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = setTimeout(() => { void saveDraft(this.draft); }, 300);
  }

  private mergeCartRead(items: CartItem[]): CartItem[] {
    const merged = items.map((source) => {
      const previous = this.lastParsedCartItems.find((item) => item.id === source.id);
      const edited = this.draft.items.find((item) => item.id === source.id);
      if (!previous || !edited) return source;
      return {
        ...source,
        name: edited.name !== previous.name ? edited.name : source.name,
        model: edited.model !== previous.model ? edited.model : source.model,
        unitPriceCents: edited.priceSource === "manual" ? edited.unitPriceCents : source.unitPriceCents,
        priceSource: edited.priceSource === "manual" ? "manual" : source.priceSource,
        freightCents: edited.freightSource === "manual" ? edited.freightCents : source.freightCents,
        freightConfirmed: edited.freightSource === "manual" ? edited.freightConfirmed : source.freightConfirmed,
        freightSource: edited.freightSource === "manual" ? "manual" : source.freightSource,
        discountCents: edited.discountSource === "manual" ? edited.discountCents : source.discountCents,
        discountSource: edited.discountSource === "manual" ? "manual" : source.discountSource
      };
    });
    return [...merged, ...this.draft.items.filter((item) => item.source === "manual")];
  }

  private restoreSavedCartItems(items: CartItem[], saved: CartItem[]): CartItem[] {
    const merged = items.map((source) => {
      const edited = saved.find((item) => item.id === source.id);
      if (!edited) return source;
      return {
        ...source, name: edited.name || source.name, model: edited.model || source.model,
        unitPriceCents: edited.priceSource === "manual" ? edited.unitPriceCents : source.unitPriceCents,
        priceSource: edited.priceSource === "manual" ? "manual" as const : source.priceSource,
        freightCents: edited.freightSource === "manual" ? edited.freightCents : source.freightCents,
        freightConfirmed: edited.freightSource === "manual" ? edited.freightConfirmed : source.freightConfirmed,
        freightSource: edited.freightSource === "manual" ? "manual" as const : source.freightSource,
        discountCents: edited.discountSource === "manual" ? edited.discountCents : source.discountCents,
        discountSource: edited.discountSource === "manual" ? "manual" as const : source.discountSource
      };
    });
    return [...merged, ...saved.filter((item) => item.source === "manual")];
  }

  private observeCartChanges(): void {
    const schedule = () => {
      if (this.cartUpdateTimer) clearTimeout(this.cartUpdateTimer);
      this.cartUpdateTimer = setTimeout(() => {
        const parsed = parseCartDocument(document, this.networkItems);
        const cartLoaded = parsed.items.length > 0 || Boolean(document.querySelector(
          "a[href*='item.taobao.com'],a[href*='detail.tmall.com']"));
        if (cartLoaded && parsed.diagnostics.candidateContainers === parsed.diagnostics.domItems &&
            this.cartSignature(parsed.items) !== this.cartReadSignature) {
          this.diagnostics = parsed.diagnostics;
          this.draft.items = this.mergeCartRead(parsed.items);
          this.draft.checkout = undefined;
          void this.rememberCart(parsed.items);
          if (this.open) {
            this.render();
            this.setStatus("购物车商品变化已自动保存到本机草稿。", "success");
          }
        }
      }, 300);
    };
    const observer = new MutationObserver((records) => {
      if (records.every((record) => this.host.contains(record.target))) return;
      schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["checked", "aria-checked", "value", "class"] });
    document.body.addEventListener("change", schedule, true);
    document.body.addEventListener("input", schedule, true);
    document.body.addEventListener("click", schedule, true);
  }

  private setStatus(message: string, type: "info" | "success" | "error" = "info"): void {
    const status = this.shadow.querySelector<HTMLElement>(".status");
    if (!status) return;
    status.className = `status show ${type}`;
    status.textContent = message;
  }

  private field(label: string, key: keyof ApplicationDraft, type = "text"): string {
    const peopleFields: Array<keyof ApplicationDraft> = ["applicant", "purchaser", "leader", "captain", "teacher", "custodian"];
    const list = key === "department" ? "team-departments" : peopleFields.includes(key) ? "team-people" : "";
    return `<label>${escapeHtml(label)}<input type="${type}" ${list ? `list="${list}"` : ""} data-field="${String(key)}" value="${escapeHtml(this.draft[key])}"></label>`;
  }

  private moneyField(label: string, key: "annualBudgetCents" | "currentSpentCents" | "remainingBudgetCents"): string {
    return `<label>${escapeHtml(label)}<input inputmode="decimal" data-money-field="${key}" value="${formatCents(this.draft[key])}" placeholder="0.00"></label>`;
  }

  private itemRows(): string {
    return this.draft.items.map((item, index) => `
      <tr>
        <td><input class="name" data-item-index="${index}" data-item-key="name" value="${escapeHtml(item.name)}"><div class="warning">${escapeHtml(item.warnings.join("；"))}</div></td>
        <td><input class="model" data-item-index="${index}" data-item-key="model" value="${escapeHtml(item.model)}"></td>
        <td><input type="number" min="1" step="1" data-item-index="${index}" data-item-key="quantity" value="${item.quantity}"></td>
        <td><input inputmode="decimal" data-item-index="${index}" data-item-key="unitPriceCents" value="${formatCents(item.unitPriceCents)}"></td>
        <td><input inputmode="decimal" data-item-index="${index}" data-item-key="freightCents" value="${formatCents(item.freightCents)}" placeholder="必须确认"></td>
        <td><input inputmode="decimal" data-item-index="${index}" data-item-key="discountCents" value="${formatCents(item.discountCents)}" placeholder="待确认"></td>
        <td><span data-line-total="${index}">${formatCents(lineTotalCents(item)) || "待确认"}</span></td>
        <td><button class="button small danger" data-remove-item="${index}">删除</button></td>
      </tr>`).join("");
  }

  private render(): void {
    const departmentOptions = (this.teamConfig?.departments || []).map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
    const peopleOptions = (this.teamConfig?.people || []).map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
    this.shadow.innerHTML = `<style>${ASSISTANT_STYLES}</style>
      <datalist id="team-departments">${departmentOptions}</datalist><datalist id="team-people">${peopleOptions}</datalist>
      <button class="launcher" type="button">${this.checkoutPage ? "核对采购申请" : "生成采购申请"}</button>
      <div class="backdrop ${this.open ? "open" : ""}">
        <section class="drawer" role="dialog" aria-label="采购申请生成工具">
          <header class="topbar"><div><h1>车队淘宝采购助手</h1><small>本地运行 · 无Token · 不上传数据</small></div><button class="icon-button close" aria-label="关闭">×</button></header>
          <main class="content">
            <p class="notice">${this.checkoutPage ? "金额以确认订单页为准；请核对每项数量、运费、优惠和右侧应付总额。插件不会提交订单。" : "购物车商品读取后自动保存在本机草稿；请正常进入确认订单页，插件会在那里独立读取最终金额并导出。"}</p>
            <div class="status"></div>
            <section class="card">
              <div class="card-head"><h2>1. 商品明细（${this.draft.items.length}项）</h2><button class="button small reload">重新读取</button><button class="button small add-item">手动添加</button></div>
              <div class="table-wrap"><table><thead><tr><th>物品</th><th>型号</th><th>数量</th><th>单价</th><th>运费</th><th>优惠</th><th>总价</th><th></th></tr></thead><tbody>${this.itemRows()}</tbody></table></div>
              <div class="summary"><span>申请总金额</span><strong data-grand-total>${formatCents(applicationTotalCents(this.draft.items)) || "待确认"}</strong></div>
              ${this.checkoutPage ? `<div class="grid"><label>确认订单应付金额<input inputmode="decimal" class="payable" value="${formatCents(this.draft.checkout?.payableCents)}" placeholder="按页面填写"></label></div><p class="muted">${escapeHtml(this.draft.checkout?.warnings.join("；") || "已核对确认订单页商品、运费与应付金额")}</p><button class="button confirm-checkout">我已逐项核对当前页面</button>` : `<p class="muted">购物车读取：DOM ${this.diagnostics.domItems}项，页面数据兜底 ${this.diagnostics.networkItems}项。${escapeHtml(this.diagnostics.warnings.join("；"))}</p>`}
            </section>
            <section class="card">
              <div class="card-head"><h2>2. 人员信息</h2><button class="button small save-profile">保存为个人档案</button></div>
              <div class="grid">${this.field("部门", "department")}${this.field("申请人", "applicant")}${this.field("采购人", "purchaser")}${this.field("组长", "leader")}${this.field("队长/副队长", "captain")}${this.field("总负责老师", "teacher")}</div>
            </section>
            <section class="card">
              <h2>3. 采购信息</h2><div class="grid">${this.field("采购时间", "purchaseDate", "date")}${this.field("到货时间（选填）", "arrivalDate", "date")}${this.field("发票上交时间（选填）", "invoiceDate", "date")}${this.field("库存情况（选填）", "inventory")}${this.field("使用/保管人（选填）", "custodian")}</div>
              <div class="grid two" style="margin-top:10px"><label>用途（选填）<textarea data-field="purpose">${escapeHtml(this.draft.purpose)}</textarea></label><label>制作成品（选填）<textarea data-field="finishedProduct">${escapeHtml(this.draft.finishedProduct)}</textarea></label></div>
            </section>
            <section class="card"><h2>4. 预算信息（选填）</h2><div class="grid">${this.moneyField("年度预算（选填）", "annualBudgetCents")}${this.moneyField("目前金额（选填）", "currentSpentCents")}${this.moneyField("剩余金额（选填）", "remainingBudgetCents")}</div><p class="muted">三项均留空可直接导出；如填写任一项，系统会校验“年度预算－目前金额＝剩余金额”，不会擅自把本次采购并入预算。</p></section>
            <section class="card"><div class="card-head"><h2>5. 团队配置与隐私</h2></div><button class="button export-config">导出团队配置</button> <button class="button import-config">导入团队配置</button> <button class="button backup-data">备份本地数据</button> <button class="button restore-data">恢复本地数据</button> <button class="button diagnostic">导出脱敏诊断</button> <button class="button danger clear-data">清除本地数据</button><input class="config-file" type="file" accept="application/json,.json" hidden><input class="backup-file" type="file" accept="application/json,.json" hidden><p class="muted">配置和草稿只保存在当前浏览器本地。</p></section>
          </main>
          <footer class="actions"><button class="button save-draft">保存草稿</button><button class="button close">关闭</button><button class="button primary export-docx" ${this.checkoutPage ? "" : "disabled"}>${this.checkoutPage ? "校验并下载Word" : "请到确认订单页导出"}</button></footer>
        </section>
      </div>`;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.shadow.querySelector(".launcher")?.addEventListener("click", async () => {
      if (!this.checkoutPage && !this.draft.items.length) {
        const parsed = parseCartDocument(document, this.networkItems);
        this.diagnostics = parsed.diagnostics;
        this.draft.items = parsed.items;
        await this.rememberCart(parsed.items);
      }
      this.open = true;
      this.render();
    });
    this.shadow.querySelectorAll(".close").forEach((element) => element.addEventListener("click", () => { this.open = false; this.render(); }));
    this.shadow.querySelector(".backdrop")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) { this.open = false; this.render(); }
    });

    this.shadow.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.field as keyof ApplicationDraft;
        if (typeof this.draft[key] === "string") (this.draft as unknown as Record<string, unknown>)[key] = input.value;
        this.scheduleDraftSave();
      });
    });
    this.shadow.querySelectorAll<HTMLInputElement>("[data-money-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.moneyField as "annualBudgetCents" | "currentSpentCents" | "remainingBudgetCents";
        this.draft[key] = parseMoneyToCents(input.value);
        this.scheduleDraftSave();
      });
    });
    this.shadow.querySelectorAll<HTMLInputElement>("[data-item-index]").forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.itemIndex);
        const item = this.draft.items[index];
        if (!item) return;
        const key = input.dataset.itemKey;
        if (key === "name" || key === "model") item[key] = input.value;
        if (key === "quantity") item.quantity = /^\d+$/.test(input.value) ? Number(input.value) : 0;
        if (key === "unitPriceCents") { item.unitPriceCents = parseMoneyToCents(input.value); item.priceSource = "manual"; }
        if (key === "freightCents") {
          item.freightCents = parseMoneyToCents(input.value);
          item.freightConfirmed = input.value.trim() !== "" && item.freightCents !== null;
          item.freightSource = "manual";
        }
        if (key === "discountCents") { item.discountCents = parseMoneyToCents(input.value); item.discountSource = "manual"; }
        if (this.draft.checkout) this.draft.checkout.matched = false;
        this.updateTotals();
        this.scheduleDraftSave();
      });
    });
    this.shadow.querySelector<HTMLInputElement>(".payable")?.addEventListener("input", (event) => {
      if (!this.draft.checkout) return;
      this.draft.checkout.payableCents = parseMoneyToCents((event.target as HTMLInputElement).value);
      this.draft.checkout.matched = false;
      this.scheduleDraftSave();
    });
    this.shadow.querySelector(".confirm-checkout")?.addEventListener("click", () => {
      if (!this.draft.checkout) return;
      const total = applicationTotalCents(this.draft.items);
      const payable = this.draft.checkout.payableCents;
      if (payable === null || total === null || total !== payable || this.draft.items.some((item) => !item.freightConfirmed || item.discountCents === null || !item.quantity)) {
        this.setStatus("请逐项核对数量、单价、运费和优惠，并使明细合计等于页面应付金额。", "error");
        return;
      }
      this.draft.checkout.matched = true;
      this.draft.checkout.warnings = [];
      this.scheduleDraftSave();
      this.setStatus("已记录人工核对；导出前请再次确认淘宝页面金额没有变化。", "success");
    });
    this.shadow.querySelectorAll("[data-remove-item]").forEach((button) => button.addEventListener("click", () => {
      this.draft.items.splice(Number((button as HTMLElement).dataset.removeItem), 1);
      this.scheduleDraftSave();
      this.render();
    }));

    this.shadow.querySelector(".add-item")?.addEventListener("click", () => {
      this.draft.items.push({ id: crypto.randomUUID(), name: "", model: "", quantity: 0, unitPriceCents: null, freightCents: null, discountCents: null, freightConfirmed: false, url: "", source: "manual", warnings: ["手动添加"] });
      this.scheduleDraftSave();
      this.render();
    });
    this.shadow.querySelector(".reload")?.addEventListener("click", async () => {
      if (this.checkoutPage) {
        const checkout = parseCheckoutDocument(document);
        this.diagnostics = { checkedInputs: 0, candidateContainers: checkout.items.length,
          domItems: checkout.items.length, networkItems: 0, mergedItems: checkout.items.length,
          warnings: checkout.warnings };
        this.draft.items = checkout.items;
        this.draft.checkout = { payableCents: checkout.payableCents, observedAt: new Date().toISOString(), matched: checkout.matched, warnings: checkout.warnings };
        this.scheduleDraftSave();
        this.render();
        this.setStatus(checkout.matched ? "已重新核对确认订单页。" : "部分金额或商品未能自动确认，请逐项核对。", checkout.matched ? "success" : "error");
        return;
      }
      const parsed = parseCartDocument(document, this.networkItems);
      this.diagnostics = parsed.diagnostics;
      this.draft.items = this.mergeCartRead(parsed.items);
      this.draft.checkout = undefined;
      await this.rememberCart(parsed.items);
      this.render();
      this.setStatus(`已重新读取${parsed.items.length}项商品，请重新核对所有价格和运费。`, "info");
    });
    this.shadow.querySelector(".save-profile")?.addEventListener("click", async () => {
      await saveProfile(profileFromDraft(this.draft)); this.setStatus("个人档案已保存在本机。", "success");
    });
    this.shadow.querySelector(".save-draft")?.addEventListener("click", async () => {
      await saveDraft(this.draft); this.setStatus("草稿已保存在本机。", "success");
    });
    this.shadow.querySelector(".export-config")?.addEventListener("click", () => {
      const currentPeople = [this.draft.applicant, this.draft.purchaser, this.draft.leader, this.draft.captain, this.draft.teacher, this.draft.custodian].filter(Boolean);
      const config: TeamConfig = {
        schemaVersion: 1,
        configVersion: this.teamConfig?.configVersion || "1.0.0",
        teamName: this.teamConfig?.teamName || "方程式赛车队",
        departments: [...new Set([...(this.teamConfig?.departments || []), this.draft.department].filter(Boolean))],
        people: [...new Set([...(this.teamConfig?.people || []), ...currentPeople])],
        department: this.draft.department,
        leader: this.draft.leader,
        captain: this.draft.captain,
        teacher: this.draft.teacher,
        annualBudgetCents: this.draft.annualBudgetCents,
        budgetPolicy: this.teamConfig?.budgetPolicy || "年度预算－目前金额＝剩余金额；本次申请金额不自动并入目前金额",
        templateVersion: "1.0.0"
      };
      downloadJson(config, "车队采购助手-团队配置.json");
    });
    const fileInput = this.shadow.querySelector<HTMLInputElement>(".config-file");
    this.shadow.querySelector(".import-config")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const config = parseTeamConfig(JSON.parse(await file.text()));
        if (!config) throw new Error("配置格式或版本不正确");
        await saveTeamConfig(config);
        this.teamConfig = config;
        this.draft.department = config.department;
        this.draft.leader = config.leader;
        this.draft.captain = config.captain;
        this.draft.teacher = config.teacher;
        this.draft.annualBudgetCents = config.annualBudgetCents;
        this.render();
        this.setStatus("团队配置已导入并保存在本机。", "success");
      } catch (error) { this.setStatus(error instanceof Error ? error.message : "团队配置导入失败", "error"); }
    });
    this.shadow.querySelector(".backup-data")?.addEventListener("click", async () => {
      downloadJson(await createLocalDataBackup(), `采购助手-本地备份-${new Date().toISOString().slice(0, 10)}.json`);
      this.setStatus("个人档案、团队配置和草稿已导出为本地备份。", "success");
    });
    const backupInput = this.shadow.querySelector<HTMLInputElement>(".backup-file");
    this.shadow.querySelector(".restore-data")?.addEventListener("click", () => backupInput?.click());
    backupInput?.addEventListener("change", async () => {
      const file = backupInput.files?.[0];
      if (!file) return;
      try {
        await restoreLocalDataBackup(JSON.parse(await file.text()));
        const stored = await loadLocalData();
        this.teamConfig = stored.team;
        this.draft = mergeDefaults(defaultDraft([]), stored);
        this.render();
        this.setStatus("本地数据已恢复。", "success");
      } catch (error) { this.setStatus(error instanceof Error ? error.message : "本地数据恢复失败", "error"); }
    });
    this.shadow.querySelector(".diagnostic")?.addEventListener("click", () => {
      downloadJson(createDiagnosticReport(this.diagnostics, this.draft.items), `采购助手-脱敏诊断-${new Date().toISOString().slice(0, 10)}.json`);
    });
    this.shadow.querySelector(".clear-data")?.addEventListener("click", async () => {
      if (!confirm("确定清除当前浏览器内保存的个人档案、团队配置和草稿吗？")) return;
      if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
      await clearAllLocalData();
      this.teamConfig = undefined;
      const parsed = parseCartDocument(document, this.networkItems);
      this.diagnostics = parsed.diagnostics;
      this.draft = defaultDraft(parsed.items);
      this.render();
      this.setStatus("本地数据和当前填写内容已清除。", "success");
    });
    this.shadow.querySelector(".export-docx")?.addEventListener("click", () => void this.exportDocx());
  }

  private updateTotals(): void {
    this.draft.items.forEach((item, index) => {
      const cell = this.shadow.querySelector<HTMLElement>(`[data-line-total='${index}']`);
      if (cell) cell.textContent = formatCents(lineTotalCents(item)) || "待确认";
    });
    const grand = this.shadow.querySelector<HTMLElement>("[data-grand-total]");
    if (grand) grand.textContent = formatCents(applicationTotalCents(this.draft.items)) || "待确认";
  }

  private async exportDocx(): Promise<void> {
    if (!this.checkoutPage) { this.setStatus("请进入确认订单页后再导出。", "error"); return; }
    const current = parseCheckoutDocument(document);
    if (current.payableCents === null || !current.items.length || current.warnings.some((warning) => /商品件数|确认订单页商品明细未能读取/.test(warning))) {
      this.setStatus("当前确认订单页商品或应付金额未能完整读取，请等待加载后点击“重新读取”。", "error"); return;
    }
    if (current.payableCents !== null && current.payableCents !== this.draft.checkout?.payableCents) {
      this.setStatus("确认订单页应付金额已变化，请点击“重新读取”并再次核对。", "error"); return;
    }
    if (current.items.length !== this.draft.items.length || current.items.some((item, index) =>
      item.quantity !== this.draft.items[index]?.quantity ||
      (item.unitPriceCents !== null && item.unitPriceCents !== this.draft.items[index]?.unitPriceCents &&
       this.draft.items[index]?.priceSource !== "manual"))) {
      this.setStatus("确认订单页商品单价或数量已变化，请点击“重新读取”并再次核对。", "error"); return;
    }
    const result = validateDraft(this.draft);
    const integrityErrors: string[] = [];
    if (this.diagnostics.candidateContainers > this.diagnostics.domItems) {
      integrityErrors.push("部分已选商品无法读取名称或链接，请重新读取或导出诊断信息");
    }
    const errors = [...result.errors, ...integrityErrors];
    if (errors.length) {
      this.setStatus(`请先修正以下问题：\n${errors.map((error) => `• ${error}`).join("\n")}`, "error");
      return;
    }
    const button = this.shadow.querySelector<HTMLButtonElement>(".export-docx");
    if (button) { button.disabled = true; button.textContent = "正在生成…"; }
    try {
      await Promise.all([saveProfile(profileFromDraft(this.draft)), saveDraft(this.draft)]);
      const blob = await generateDocxBlob(this.draft);
      downloadBlob(blob, applicationFilename(this.draft));
      this.setStatus("采购申请表已在本机生成并开始下载。", "success");
    } catch (error) {
      this.setStatus(`Word生成失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "校验并下载Word"; }
    }
  }
}
