import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonDecodedRecordDecoder } from "../src/kanon/decoder.js";
import { KanonParser } from "../src/kanon/parser.js";
import { KanonAssetCatalog } from "../src/kanon/assets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadDummy() {
  const [records, assets] = await Promise.all([
    readFile(path.join(root, "examples/dummy/decoded-records.json"), "utf8"),
    readFile(path.join(root, "examples/dummy/assets.json"), "utf8")
  ]);
  const decoded = new JsonDecodedRecordDecoder().decode(records, { synthetic: true });
  return {
    scenario: new KanonParser().parse(decoded),
    assets: new KanonAssetCatalog(JSON.parse(assets))
  };
}

