import fs from "node:fs";
import sharp from "sharp";
import { planViews } from "../../src/layout/split.js";
import { layoutArchitecture } from "../../src/layout/grid.js";
import { renderArchitectureSvg } from "../../src/layout/svg.js";
import { runArchitectureQa } from "../../src/layout/qa.js";
const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).input;
const only = process.argv[3];
fs.mkdirSync("/tmp/r", { recursive: true });
const name = process.argv[2].split("/").pop()!.replace(".json", "");
for (const v of planViews(spec, spec.split ?? "auto", 25)) {
  if (only && v.info.key !== only) continue;
  const l = layoutArchitecture(v.input);
  const svg = renderArchitectureSvg(l, "dark");
  const out = `/tmp/r/${name}${v.info.key ? "." + v.info.key : ""}.png`;
  await sharp(Buffer.from(svg), { density: 72 * (1600 / l.width) }).png().toFile(out);
  const qa = runArchitectureQa(l).filter((i) => i.severity !== "info");
  console.log(out, l.width, l.height, (l.width / l.height).toFixed(2), qa.map((i) => i.severity[0] + ":" + i.code).join(" "));
}
