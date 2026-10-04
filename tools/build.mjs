import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "assets"), { recursive: true });
await mkdir(join(dist, "icons"), { recursive: true });

await Promise.all([
  build({
    entryPoints: [join(root, "src/content.ts")],
    bundle: true,
    outfile: join(dist, "content.js"),
    format: "iife",
    platform: "browser",
    target: "chrome120",
    minify: false,
    legalComments: "eof"
  }),
  build({
    entryPoints: [join(root, "src/main-world.ts")],
    bundle: true,
    outfile: join(dist, "main-world.js"),
    format: "iife",
    platform: "browser",
    target: "chrome120",
    minify: false,
    legalComments: "none"
  })
]);

await copyFile(join(root, "manifest.json"), join(dist, "manifest.json"));
await copyFile(join(root, "src/popup.html"), join(dist, "popup.html"));
await copyFile(join(root, "src/assets/purchase-template.docx"), join(dist, "assets/purchase-template.docx"));
await copyFile(join(root, "THIRD_PARTY_NOTICES.md"), join(dist, "THIRD_PARTY_NOTICES.md"));
for (const size of [16, 32, 48, 128]) {
  await copyFile(join(root, `src/icons/icon-${size}.png`), join(dist, `icons/icon-${size}.png`));
}

const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
await writeFile(join(dist, "build-info.json"), JSON.stringify({
  version: manifest.version,
  builtAt: new Date().toISOString(),
  localOnly: true
}, null, 2));

console.log(`构建完成：${dist}`);
