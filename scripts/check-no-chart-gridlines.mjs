import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;

    const text = readFileSync(full, "utf8");
    if (/\bCartesianGrid\b/.test(text) || /const\s+GRID\s*=/.test(text)) {
      offenders.push(full);
    }
  }
}

walk(ROOT);

if (offenders.length) {
  console.error("Found chart gridline usage in:");
  for (const f of offenders) console.error(` - ${f}`);
  process.exit(1);
}

console.log("OK: no CartesianGrid/GRID chart gridline usage found in src/");
