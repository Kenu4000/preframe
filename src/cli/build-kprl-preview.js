import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KprlDisassemblyDecoder } from "../kanon/kprl-decoder.js";
import { KanonParser } from "../kanon/parser.js";
import { KanonAssetCatalog } from "../kanon/assets.js";
import { reduceScenarioLinearly } from "../kanon/state.js";
import { renderScenarioTrace } from "../kanon/trace.js";
import { collectScenarioAssetReferences, createDiagnosticPreviewScenario } from "../kanon/preview.js";
import { copyResolvedAssets, resolveLocalAssetReferences } from "../kanon/local-asset-resolver.js";
import { KagEmitter } from "../runtime/kag-emitter.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const privateRoot = path.join(repositoryRoot, "private");
const cacheRoot = path.join(repositoryRoot, "cache");

function hasFlag(name) {
  return process.argv.includes(name);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requireInside(root, candidate, label) {
  const resolved = path.resolve(repositoryRoot, candidate);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside ${path.relative(repositoryRoot, root)}/`);
  }
  return { resolved, relative: relative.split(path.sep).join("/") };
}

async function findSingleScenarioPair() {
  const scenarioRoot = path.join(privateRoot, "kanon_original", "scenario");
  const entries = (await readdir(scenarioRoot, { withFileTypes: true })).filter((entry) => entry.isFile());
  const byStem = new Map();
  for (const entry of entries) {
    const extension = path.extname(entry.name).toLowerCase();
    if (extension !== ".org" && extension !== ".utf") continue;
    const stem = entry.name.slice(0, -extension.length).toLowerCase();
    const pair = byStem.get(stem) ?? {};
    pair[extension.slice(1)] = path.join(scenarioRoot, entry.name);
    byStem.set(stem, pair);
  }
  const complete = [...byStem.values()].filter((pair) => pair.org && pair.utf);
  if (complete.length !== 1) {
    throw new Error(`--auto requires exactly one .org/.utf pair in private/kanon_original/scenario (found ${complete.length})`);
  }
  return complete[0];
}

async function assertFile(file, label) {
  const information = await stat(file).catch(() => null);
  if (!information?.isFile()) throw new Error(`${label} not found: ${path.relative(repositoryRoot, file)}`);
}

let orgOption = readOption("--org");
let resourceOption = readOption("--resource");
if (hasFlag("--auto")) {
  const pair = await findSingleScenarioPair();
  orgOption = pair.org;
  resourceOption = pair.utf;
}
if (!orgOption || !resourceOption) {
  throw new Error(
    "usage: node src/cli/build-kprl-preview.js --auto [--deploy] [--launch] or --org private/.../SCENE.org --resource private/.../SCENE.utf"
  );
}

const orgPath = requireInside(privateRoot, orgOption, "--org");
const resourcePath = requireInside(privateRoot, resourceOption, "--resource");
const [disassembly, resources] = await Promise.all([readFile(orgPath.resolved), readFile(resourcePath.resolved)]);
const decoded = new KprlDisassemblyDecoder().decode(
  { disassembly, resources },
  { sourceFile: orgPath.relative, resourceFile: resourcePath.relative }
);
const parsedScenario = new KanonParser().parse(decoded);

const references = collectScenarioAssetReferences(parsedScenario);
const originalRoot = path.join(privateRoot, "kanon_original");
const assetResolution = await resolveLocalAssetReferences(originalRoot, references);
const availableAssetLogicalIds = new Set(assetResolution.resolved.map((asset) => asset.reference.logicalId));
const preview = createDiagnosticPreviewScenario(parsedScenario, { availableAssetLogicalIds });

for (const unresolved of assetResolution.unresolved) {
  preview.skipped.push({
    reason: `asset-${unresolved.reason}`,
    logicalId: unresolved.reference.logicalId,
    originalId: unresolved.reference.originalId,
    candidateCount: unresolved.candidateCount ?? 0
  });
}

const outputPath = requireInside(cacheRoot, `cache/kanon/preview/${parsedScenario.id}`, "preview output");
const dataRoot = path.join(outputPath.resolved, "data");
const scenarioStorage = `scenario/${parsedScenario.id}.ks`;
await rm(outputPath.resolved, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(dataRoot, "scenario"), { recursive: true }),
  mkdir(path.join(outputPath.resolved, "trace"), { recursive: true }),
  mkdir(path.join(outputPath.resolved, "state"), { recursive: true })
]);
await copyResolvedAssets(assetResolution.resolved, dataRoot);

const manifest = {
  schemaVersion: 1,
  assets: assetResolution.resolved.map((asset) => asset.manifestEntry)
};
const catalog = new KanonAssetCatalog(manifest);
const emitter = new KagEmitter(catalog, { includeRuntimeTrace: true });
const scenarioScript = `${emitter.emitScenario(preview.scenario)}@s\r\n`;
const report = {
  mode: "diagnostic-preview",
  faithfulBuild: false,
  source: { org: orgPath.relative, resource: resourcePath.relative },
  originalCommandCount: parsedScenario.commands.length,
  emittedCommandCount: preview.scenario.commands.length,
  skipped: preview.skipped,
  approximations: preview.approximations,
  assets: {
    referenced: references.length,
    copied: assetResolution.resolved.length,
    unresolved: assetResolution.unresolved.length
  }
};

await Promise.all([
  writeFile(path.join(dataRoot, "first.ks"), emitter.emitFirstScript(scenarioStorage), "utf8"),
  writeFile(path.join(dataRoot, ...scenarioStorage.split("/")), scenarioScript, "utf8"),
  writeFile(path.join(outputPath.resolved, "assets.generated.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputPath.resolved, "preview-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputPath.resolved, "trace", `${parsedScenario.id}.trace.log`), renderScenarioTrace(preview.scenario), "utf8"),
  writeFile(
    path.join(outputPath.resolved, "state", `${parsedScenario.id}.final-state.json`),
    `${JSON.stringify(reduceScenarioLinearly(preview.scenario), null, 2)}\n`,
    "utf8"
  )
]);

const runtimeRoot = path.join(repositoryRoot, "runtime", "local", "kirikiri");
const runtimeData = path.join(runtimeRoot, "data");
if (hasFlag("--deploy") || hasFlag("--launch")) {
  await assertFile(path.join(runtimeData, "startup.tjs"), "KAG startup script");
  await mkdir(runtimeData, { recursive: true });
  await cp(dataRoot, runtimeData, { recursive: true, force: true });
}

if (hasFlag("--launch")) {
  if (process.platform !== "win32") throw new Error("--launch is supported only on Windows");
  const executable = path.join(runtimeRoot, "tvpwin64.exe");
  await assertFile(executable, "KiriKiri executable");
  spawn(executable, [], { cwd: runtimeRoot, detached: true, stdio: "ignore" }).unref();
}

console.log(`Built real-data diagnostic preview: ${path.relative(repositoryRoot, outputPath.resolved)}`);
console.log(
  `Commands: ${report.emittedCommandCount}/${report.originalCommandCount} emitted, ${report.skipped.length} skipped, ${report.approximations.length} approximated`
);
console.log(`Assets: ${report.assets.copied}/${report.assets.referenced} copied`);
if (hasFlag("--deploy")) console.log(`Deployed to: ${path.relative(repositoryRoot, runtimeData)}`);
if (hasFlag("--launch")) console.log("KiriKiri launched");
