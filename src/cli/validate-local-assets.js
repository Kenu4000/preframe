import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLocalAssets } from "../kanon/local-assets.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalRoot = path.resolve(repositoryRoot, process.argv[2] ?? "private/kanon_original");
const result = await validateLocalAssets(originalRoot);

console.log(`scenario: ${result.scenario.count} files`);
for (const asset of result.assets) {
  const note = asset.manualInstructionsRequired ? " (manual Voice instructions not checked yet)" : "";
  const headerNote = asset.validateHeader === false ? " (extension only; header not verified)" : "";
  console.log(`${asset.key}: ${asset.count} ${asset.format.toUpperCase()} files${note}${headerNote}`);
  if (asset.requiredChildDirectories) {
    console.log(`voice character directories: ${asset.childDirectoryCount}/${asset.requiredChildDirectories.length}`);
  }
}

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Local Kanon asset validation passed");
}
