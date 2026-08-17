import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KprlDisassemblyDecoder } from "../kanon/kprl-decoder.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const privateRoot = path.join(repositoryRoot, "private");
const cacheRoot = path.join(repositoryRoot, "cache");

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

const orgOption = readOption("--org");
const resourceOption = readOption("--resource");
if (!orgOption || !resourceOption) {
  throw new Error(
    "usage: npm run import:kprl -- --org private/.../SCENE.org --resource private/.../SCENE.utf [--out cache/.../SCENE.decoded.json]"
  );
}

const orgPath = requireInside(privateRoot, orgOption, "--org");
const resourcePath = requireInside(privateRoot, resourceOption, "--resource");
const [disassembly, resources] = await Promise.all([
  readFile(orgPath.resolved),
  readFile(resourcePath.resolved)
]);

const decoded = new KprlDisassemblyDecoder().decode(
  { disassembly, resources },
  { sourceFile: orgPath.relative, resourceFile: resourcePath.relative }
);
const outputOption = readOption("--out") ?? `cache/kanon/imported/${decoded.scenario.id}.decoded.json`;
const outputPath = requireInside(cacheRoot, outputOption, "--out");

await mkdir(path.dirname(outputPath.resolved), { recursive: true });
await writeFile(outputPath.resolved, `${JSON.stringify(decoded, null, 2)}\n`, "utf8");

const unknownCount = decoded.records.filter((record) => record.decodedKind?.startsWith("kanon.kprl.")).length;
console.log(
  `Imported ${decoded.scenario.id}: ${decoded.records.length} records (${unknownCount} unresolved) -> ${path.relative(repositoryRoot, outputPath.resolved)}`
);
