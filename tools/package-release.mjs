import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import PizZip from "pizzip";

const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const releaseDir = join(root, "release");
await mkdir(releaseDir, { recursive: true });
const dist = join(root, "dist");

async function addDirectory(zip, directory, baseDirectory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) await addDirectory(zip, fullPath, baseDirectory, prefix);
    else {
      const archivePath = `${prefix}${relative(baseDirectory, fullPath).replaceAll("\\", "/")}`;
      zip.file(archivePath, await readFile(fullPath));
    }
  }
}

async function writeZip(zipPath, zip) {
  await rm(zipPath, { force: true });
  await writeFile(zipPath, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`发布包：${zipPath}`);
}

const storeZip = new PizZip();
await addDirectory(storeZip, dist, dist);
await writeZip(
  join(releaseDir, `taobao-procurement-assistant-${manifest.version}-store.zip`),
  storeZip,
);

const teamZip = new PizZip();
await addDirectory(teamZip, dist, dist, "extension/");
for (const [source, destination] of [
  ["README.md", "README.md"],
  ["PRIVACY.md", "docs/隐私说明.md"],
  ["CHANGELOG.md", "docs/更新记录.md"],
  ["THIRD_PARTY_NOTICES.md", "docs/第三方组件说明.md"],
  ["docs/安装与使用.md", "docs/安装与使用.md"],
  ["docs/验收记录.md", "docs/验收记录.md"],
  ["docs/team-config.example.json", "config/team-config.example.json"],
  ["release/采购申请表示例.docx", "examples/采购申请表示例.docx"],
]) {
  teamZip.file(destination, await readFile(join(root, source)));
}
await writeZip(
  join(releaseDir, `taobao-procurement-assistant-${manifest.version}.zip`),
  teamZip,
);
