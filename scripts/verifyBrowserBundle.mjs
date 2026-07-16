import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const assetsDirectory = new URL("../apps/web/dist/assets/", import.meta.url);
const assetNames = (await readdir(assetsDirectory)).filter((name) => name.endsWith(".js"));
if (assetNames.length === 0) throw new Error("No production JavaScript bundle was found.");

const forbiddenPatterns = [
  { label: "browser randomUUID", pattern: /\brandomUUID\b/ },
  { label: "AbortSignal.timeout", pattern: /AbortSignal\.timeout\b/ },
  { label: "AbortSignal.any", pattern: /AbortSignal\.any\b/ },
];

for (const assetName of assetNames) {
  const source = await readFile(join(assetsDirectory.pathname, assetName), "utf8");
  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(source)) {
      throw new Error(`${forbidden.label} leaked into production asset ${assetName}.`);
    }
  }
}

console.info(`Production browser bundle verified (${assetNames.length} JavaScript assets).`);
