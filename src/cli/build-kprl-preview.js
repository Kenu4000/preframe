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

async function findScenarioPairs() {
  const scenarioRoot = path.join(privateRoot, "kanon_original", "scenario");
  const entries = (await readdir(scenarioRoot, { withFileTypes: true })).filter((entry) => entry.isFile());
  const byStem = new Map();
  for (const entry of entries) {
    const extension = path.extname(entry.name).toLowerCase();
    if (extension !== ".org" && extension !== ".utf") continue;
    const stem = entry.name.slice(0, -extension.length);
    const key = stem.toLowerCase();
    const pair = byStem.get(key) ?? { stem };
    pair[extension.slice(1)] = path.join(scenarioRoot, entry.name);
    byStem.set(key, pair);
  }
  const incomplete = [...byStem.values()].filter((pair) => !pair.org || !pair.utf);
  if (incomplete.length > 0) {
    throw new Error(`--auto found incomplete .org/.utf pairs: ${incomplete.map((pair) => pair.stem).join(", ")}`);
  }
  const complete = [...byStem.values()].sort((left, right) => left.stem.localeCompare(right.stem, "en"));
  if (complete.length === 0) {
    throw new Error("--auto requires at least one .org/.utf pair in private/kanon_original/scenario");
  }
  return complete;
}

async function assertFile(file, label) {
  const information = await stat(file).catch(() => null);
  if (!information?.isFile()) throw new Error(`${label} not found: ${path.relative(repositoryRoot, file)}`);
}

let inputPairs;
if (hasFlag("--auto")) {
  inputPairs = await findScenarioPairs();
} else {
  const orgOption = readOption("--org");
  const resourceOption = readOption("--resource");
  if (!orgOption || !resourceOption) {
    throw new Error(
      "usage: node src/cli/build-kprl-preview.js --auto [--start SEEN0050] [--deploy] [--launch] or --org private/.../SCENE.org --resource private/.../SCENE.utf"
    );
  }
  inputPairs = [{ stem: path.basename(orgOption, path.extname(orgOption)), org: orgOption, utf: resourceOption }];
}

const decodedScenarios = await Promise.all(
  inputPairs.map(async (pair) => {
    const orgPath = requireInside(privateRoot, pair.org, "--org");
    const resourcePath = requireInside(privateRoot, pair.utf, "--resource");
    const [disassembly, resources] = await Promise.all([readFile(orgPath.resolved), readFile(resourcePath.resolved)]);
    const decoded = new KprlDisassemblyDecoder().decode(
      { disassembly, resources },
      {
        sourceFile: orgPath.relative,
        resourceFile: resourcePath.relative,
        allowMissingResources: true
      }
    );
    return {
      source: { org: orgPath.relative, resource: resourcePath.relative },
      scenario: new KanonParser().parse(decoded)
    };
  })
);

const scenarioIds = new Set(decodedScenarios.map((item) => item.scenario.id));
if (scenarioIds.size !== decodedScenarios.length) throw new Error("duplicate scenario ids found in --auto input");
const requestedStart = readOption("--start");
const startScenarioId = requestedStart ?? decodedScenarios[0].scenario.id;
if (!scenarioIds.has(startScenarioId)) throw new Error(`start scenario was not found: ${startScenarioId}`);

const referencesById = new Map();
for (const item of decodedScenarios) {
  for (const reference of collectScenarioAssetReferences(item.scenario)) {
    referencesById.set(reference.logicalId, reference);
  }
}
const references = [...referencesById.values()];
const originalRoot = path.join(privateRoot, "kanon_original");
const assetResolution = await resolveLocalAssetReferences(originalRoot, references);
const availableAssetLogicalIds = new Set(assetResolution.resolved.map((asset) => asset.reference.logicalId));

const previews = decodedScenarios.map((item) => ({
  ...item,
  preview: createDiagnosticPreviewScenario(item.scenario, {
    availableAssetLogicalIds,
    availableScenarioIds: scenarioIds
  })
}));

const outputPath = requireInside(cacheRoot, "cache/kanon/preview", "preview output");
const dataRoot = path.join(outputPath.resolved, "data");
await rm(outputPath.resolved, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(dataRoot, "scenario"), { recursive: true }),
  mkdir(path.join(outputPath.resolved, "reports"), { recursive: true }),
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

const sceneReports = [];
for (const item of previews) {
  const scenarioId = item.scenario.id;
  const scenarioStorage = `scenario/${scenarioId}.ks`;
  const scenarioScript = `${emitter.emitScenario(item.preview.scenario)}@s\r\n`;
  const report = {
    scenarioId,
    source: item.source,
    originalCommandCount: item.scenario.commands.length,
    emittedCommandCount: item.preview.scenario.commands.length,
    skipped: item.preview.skipped,
    approximations: item.preview.approximations
  };
  sceneReports.push(report);
  await Promise.all([
    writeFile(path.join(dataRoot, ...scenarioStorage.split("/")), scenarioScript, "utf8"),
    writeFile(path.join(outputPath.resolved, "reports", `${scenarioId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputPath.resolved, "trace", `${scenarioId}.trace.log`), renderScenarioTrace(item.preview.scenario), "utf8"),
    writeFile(
      path.join(outputPath.resolved, "state", `${scenarioId}.final-state.json`),
      `${JSON.stringify(reduceScenarioLinearly(item.preview.scenario), null, 2)}\n`,
      "utf8"
    )
  ]);
}

const report = {
  mode: "diagnostic-preview",
  faithfulBuild: false,
  startScenarioId,
  scenarioCount: previews.length,
  originalCommandCount: sceneReports.reduce((sum, item) => sum + item.originalCommandCount, 0),
  emittedCommandCount: sceneReports.reduce((sum, item) => sum + item.emittedCommandCount, 0),
  skippedCount: sceneReports.reduce((sum, item) => sum + item.skipped.length, 0),
  approximationCount: sceneReports.reduce((sum, item) => sum + item.approximations.length, 0),
  scenarios: sceneReports,
  assets: {
    referenced: references.length,
    copied: assetResolution.resolved.length,
    unresolved: assetResolution.unresolved.length,
    unresolvedDetails: assetResolution.unresolved.map((item) => ({
      logicalId: item.reference.logicalId,
      originalId: item.reference.originalId,
      reason: item.reason,
      candidateCount: item.candidateCount ?? 0
    }))
  }
};

await Promise.all([
  writeFile(path.join(dataRoot, "first.ks"), emitter.emitFirstScript(`scenario/${startScenarioId}.ks`), "utf8"),
  writeFile(path.join(outputPath.resolved, "assets.generated.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  writeFile(path.join(outputPath.resolved, "preview-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
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
console.log(`Scenarios: ${report.scenarioCount}, start=${report.startScenarioId}`);
console.log(
  `Commands: ${report.emittedCommandCount}/${report.originalCommandCount} emitted, ${report.skippedCount} skipped, ${report.approximationCount} approximated`
);
console.log(`Assets: ${report.assets.copied}/${report.assets.referenced} copied`);
if (hasFlag("--deploy")) console.log(`Deployed to: ${path.relative(repositoryRoot, runtimeData)}`);
if (hasFlag("--launch")) console.log("KiriKiri launched");
