import fs from "node:fs";
import sharp from "sharp";
import { ARCHITECTURE_SPECS } from "../../src/showcase/architecture.js";
import { compileCloud } from "../../src/compilers/cloud.js";
fs.mkdirSync("/tmp/r", { recursive: true });
for (const [name, make] of Object.entries(ARCHITECTURE_SPECS)) {
  if (process.argv[2] && !name.includes(process.argv[2])) continue;
  const t0 = Date.now();
  const r = compileCloud((make as any)());
  for (const v of r.views) {
    const out = `/tmp/r/ex-${name.replace(/\//g, "_")}${v.info.key ? "." + v.info.key : ""}.png`;
    await sharp(Buffer.from(v.source), { density: 72 * (1600 / v.arch.width) }).png().toFile(out);
    console.log(out, v.arch.width, v.arch.height, (v.arch.width / v.arch.height).toFixed(2), Date.now() - t0, "ms", v.qa.filter((i) => i.severity !== "info").map((i) => i.code).join(" "));
  }
}
