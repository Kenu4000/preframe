import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonDecodedRecordDecoder } from "../kanon/decoder.js";
import { KanonParser } from "../kanon/parser.js";
import { KanonAssetCatalog } from "../kanon/assets.js";
import { reduceScenarioLinearly } from "../kanon/state.js";
import { renderScenarioTrace } from "../kanon/trace.js";
import { KagEmitter } from "../runtime/kag-emitter.js";
import { writeDummyAssets } from "../runtime/dummy-assets.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = path.join(repositoryRoot, "cache/kanon/kag-data");

const [recordJson, assetJson] = await Promise.all([
  readFile(path.join(repositoryRoot, "examples/dummy/decoded-records.json"), "utf8"),
  readFile(path.join(repositoryRoot, "examples/dummy/assets.json"), "utf8")
]);

const decoder = new JsonDecodedRecordDecoder();
const decoded = decoder.decode(recordJson, { synthetic: true });
const scenario = new KanonParser().parse(decoded);
const assets = new KanonAssetCatalog(JSON.parse(assetJson));
const emitter = new KagEmitter(assets, { includeRuntimeTrace: true });

await Promise.all([
  mkdir(path.join(outputRoot, "scenario"), { recursive: true }),
  mkdir(path.join(outputRoot, "trace"), { recursive: true }),
  mkdir(path.join(outputRoot, "state"), { recursive: true }),
  writeDummyAssets(outputRoot)
]);

await Promise.all([
  writeFile(path.join(outputRoot, "first.ks"), emitter.emitFirstScript("scenario/dummy.ks"), "utf8"),
  writeFile(path.join(outputRoot, "scenario/dummy.ks"), emitter.emitScenario(scenario), "utf8"),
  writeFile(path.join(outputRoot, "trace/dummy.trace.log"), renderScenarioTrace(scenario), "utf8"),
  writeFile(
    path.join(outputRoot, "state/dummy.final-state.json"),
    `${JSON.stringify(reduceScenarioLinearly(scenario), null, 2)}\n`,
    "utf8"
  )
]);

console.log(`Built synthetic KAG scene: ${path.relative(repositoryRoot, outputRoot)}`);

