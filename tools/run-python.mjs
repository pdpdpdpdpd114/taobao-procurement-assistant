import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = process.argv[2];

if (!script) {
  throw new Error("缺少 Python 脚本路径");
}

const candidates = process.env.CODEX_BUNDLED_PYTHON
  ? [{ command: process.env.CODEX_BUNDLED_PYTHON, args: [] }]
  : process.platform === "win32"
    ? [{ command: "python", args: [] }, { command: "py", args: ["-3"] }]
    : [{ command: "python3", args: [] }, { command: "python", args: [] }];
const interpreter = candidates.find(({ command, args }) => {
  const probe = spawnSync(command, [...args, "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], {
    stdio: "ignore",
    windowsHide: true
  });
  return !probe.error && probe.status === 0;
});

if (!interpreter) {
  throw new Error("未找到 Python 3.10+；请安装 Python，或将 CODEX_BUNDLED_PYTHON 设置为 Python 可执行文件路径。");
}

const result = spawnSync(interpreter.command, [...interpreter.args, resolve(script), ...process.argv.slice(3)], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, PYTHONIOENCODING: "utf-8" }
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
