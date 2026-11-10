/** Dev: render examples/types/<kind>-<size>.json straight through the compilers → /tmp/k/*.png (1600px wide) + QA. */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { KIND_COMPILERS } from "../../src/compilers/kinds/registry.js";
const dir = path.resolve("examples/types");
const out = process.env.OUT ?? "/tmp/k";
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(dir).sort()) {
  if (process.argv[2] && !f.startsWith(process.argv[2])) continue;
  const spec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const k = KIND_COMPILERS[spec.tool];
  if (!k) continue;
  const t0 = Date.now();
  const r = k.compile(k.schema.parse(spec.input));
  for (const v of r.views) {
    const name = f.replace(/\.json$/, "") + (v.info?.key ? "." + v.info.key : "");
    fs.writeFileSync(`${out}/${name}.svg`, v.source);
    await sharp(Buffer.from(v.source), { density: 72 * (1600 / v.width) }).png().toFile(`${out}/${name}.png`);
    const qa = v.qa.filter((i: any) => i.severity !== "info");
    console.log(name, v.width, v.height, (v.width / v.height).toFixed(2), Date.now() - t0, "ms", qa.map((i: any) => `${i.severity[0]}:${i.code}${i.severity !== "info" ? "(" + i.message + ")" : ""}`).join(" "));
  }
}
