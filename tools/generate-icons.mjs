import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(process.cwd(), "src", "icons");
await mkdir(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = new PNG({ width: size, height: size });
  const radius = size * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = Math.max(radius - x, 0, x - (size - radius));
      const dy = Math.max(radius - y, 0, y - (size - radius));
      const inside = dx * dx + dy * dy <= radius * radius;
      png.data[i] = inside ? 230 : 0;
      png.data[i + 1] = inside ? 76 : 0;
      png.data[i + 2] = inside ? 35 : 0;
      png.data[i + 3] = inside ? 255 : 0;
    }
  }
  const line = Math.max(1, Math.round(size / 14));
  const draw = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * size + x) * 4;
      png.data[i] = 255; png.data[i + 1] = 255; png.data[i + 2] = 255; png.data[i + 3] = 255;
    }
  };
  draw(Math.round(size * .25), Math.round(size * .28), Math.round(size * .75), Math.round(size * .28) + line);
  draw(Math.round(size * .25), Math.round(size * .48), Math.round(size * .75), Math.round(size * .48) + line);
  draw(Math.round(size * .25), Math.round(size * .68), Math.round(size * .62), Math.round(size * .68) + line);
  await writeFile(join(outDir, `icon-${size}.png`), PNG.sync.write(png));
}
