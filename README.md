# FSEC 车队淘宝采购助手

这是一个面向 FSEC 车队内部成员的 Edge / Chrome 浏览器插件。它可直接在提交订单前的淘宝确认订单页读取商品名称、单价、数量、运费、优惠和应付金额，在本地生成 Word 采购申请表；购物车页是可选的预览入口，读取后会自动保存本机草稿。

## 隐私与运行方式

- 不使用 Token、API Key、AI 接口或后台服务器。
- 不读取或保存淘宝密码、Cookie。
- 不包含统计、埋点或自动错误上传。
- 个人档案、团队配置和草稿只保存在浏览器本地。
- 插件仅在淘宝购物车 `https://cart.taobao.com/*` 和确认订单 `https://buy.taobao.com/auction/order/confirm_order.htm` 运行；不在支付页面运行。

## 本地安装（测试版）

1. 解压发布包。
2. Edge 打开 `edge://extensions`，Chrome 打开 `chrome://extensions`。
3. 开启“开发人员模式”。
4. 点击“加载解压缩的扩展”，选择解压后的 `extension` 文件夹。
5. 登录淘宝并打开确认订单页，点击页面右侧“核对采购申请”。

正式团队版应发布到 Edge Add-ons 的 Hidden 渠道；成员通过专属链接安装，无需开发人员模式，并可自动更新。

## 使用流程

1. 在淘宝购物车勾选需要采购的商品，然后正常进入确认订单页；无需先打开插件。
2. 点击“生成采购申请”，核对商品条目及每条购买数量。数量读不到时会显示 0 并要求确认，不会代填 1。
3. 在“确认订单”页点击“核对采购申请”。插件直接读取当前商品、数量、单价、店铺运费、优惠和应付总额；无法自动核对时逐项填写并明确点击人工核对。
4. 填写人员、用途、预算和日期；核对所有商品及应付金额后下载 `.docx`。

购物车价格不等于确认订单页最终结算价格。Word 保留原六列，优惠写在商品名称备注中；店铺运费记入该店第一项。插件不会点击“立即支付”或读取支付凭据。

## 开发

使用 Node.js 24 和 pnpm 11.19.0。在工程根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` 会依次运行类型检查、自动测试、插件构建、示例生成和发布打包。仓库已提交 `src/assets/purchase-template.docx`，默认构建不需要 Python 或个人电脑上的原始表格。

构建结果位于 `dist/`，可直接在浏览器中“加载解压缩的扩展”。`release/taobao-procurement-assistant-0.2.4.zip` 是团队离线包（含插件、配置、示例和说明）；`release/taobao-procurement-assistant-0.2.4-store.zip` 是商店上传包。安装和人工验收说明见 `docs/安装与使用.md` 与 `docs/验收记录.md`。

### 可选：从原始表格重建模板

仅当需要更换原始采购表时使用。安装 Python 3.10+ 和 `python-docx`，然后指定原始六列采购表：

```powershell
python -m pip install python-docx==1.2.0
pnpm build:template --source "原始采购申请表.docx"
pnpm verify
```

工具优先使用 `CODEX_BUNDLED_PYTHON` 指定的解释器，否则查找系统 `python` / `py -3`（Windows）或 `python3` / `python`（其他系统）。不传 `--source` 时只检查并复用仓库模板。更换模板后请重新检查 Word 的每一页布局；原始表格内容与实际采购记录应留在本地。
