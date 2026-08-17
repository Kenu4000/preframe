import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KanonAssetCatalog } from "../kanon/assets.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const allowedStatus = new Set(["open", "investigating", "fixed", "accepted"]);
const requiredDifferenceFields = [
  "id",
  "title",
  "status",
  "severity",
  "scope",
  "originalBehavior",
  "portBehavior",
  "evidence",
  "verification"
];

const [differencesText, assetsText, gitignore] = await Promise.all([
  readFile(path.join(repositoryRoot, "fidelity/known-differences.json"), "utf8"),
  readFile(path.join(repositoryRoot, "examples/dummy/assets.json"), "utf8"),
  readFile(path.join(repositoryRoot, ".gitignore"), "utf8")
]);

const ledger = JSON.parse(differencesText);
if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.differences)) {
  throw new Error("fidelity ledger must use schemaVersion 1 and contain differences");
}
const ids = new Set();
for (const difference of ledger.differences) {
  for (const field of requiredDifferenceFields) {
    if (typeof difference[field] !== "string" || difference[field].length === 0) {
      throw new Error(`fidelity difference is missing ${field}: ${difference.id ?? "(no id)"}`);
    }
  }
  if (!/^KF-\d{4}$/.test(difference.id)) {
    throw new Error(`invalid fidelity id: ${difference.id}`);
  }
  if (ids.has(difference.id)) {
    throw new Error(`duplicate fidelity id: ${difference.id}`);
  }
  if (!allowedStatus.has(difference.status)) {
    throw new Error(`invalid fidelity status for ${difference.id}: ${difference.status}`);
  }
  ids.add(difference.id);
}

new KanonAssetCatalog(JSON.parse(assetsText));

for (const requiredIgnore of ["private/**", "upload/**", "cache/**", "runtime/local/**"]) {
  if (!gitignore.includes(requiredIgnore)) {
    throw new Error(`.gitignore must contain ${requiredIgnore}`);
  }
}

console.log(`Static checks passed (${ledger.differences.length} fidelity differences)`);
