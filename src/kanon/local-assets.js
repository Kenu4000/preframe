import { open, readdir } from "node:fs/promises";
import path from "node:path";

const ignoredNames = new Set(["desktop.ini", "thumbs.db", ".ds_store"]);

async function collectFiles(root) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredNames.has(entry.name.toLowerCase())) continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function readHeader(file, length) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function validateFileHeader(file, kind) {
  if (kind === "bmp") {
    const header = await readHeader(file, 2);
    return header.length === 2 && header.toString("ascii") === "BM";
  }
  if (kind === "wav") {
    const header = await readHeader(file, 12);
    return (
      header.length === 12 &&
      header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WAVE"
    );
  }
  throw new Error(`no verified header validator for ${kind}`);
}

async function findInvalidHeaders(files, kind, concurrency = 32) {
  const invalid = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      if (!(await validateFileHeader(files[index], kind))) invalid.push({ index, file: files[index] });
    }
  }
  const workerCount = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return invalid.sort((left, right) => left.index - right.index).map((entry) => entry.file);
}

async function validateAssetDirectory(originalRoot, definition) {
  const root = path.join(originalRoot, definition.directory);
  let files;
  let childDirectories = [];
  try {
    if (definition.requiredChildDirectories) {
      childDirectories = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    }
    files = await collectFiles(root);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ...definition,
        count: 0,
        childDirectoryCount: 0,
        errors: [`missing directory: ${definition.directory}`]
      };
    }
    throw error;
  }

  const errors = [];
  if (definition.requiredChildDirectories) {
    const actual = new Set(childDirectories.map((name) => name.toUpperCase()));
    for (const required of definition.requiredChildDirectories) {
      if (!actual.has(required.toUpperCase())) errors.push(`missing voice character directory: voice/${required}`);
    }
  }
  const expectedExtension = `.${definition.format}`;
  const candidates = [];
  for (const file of files) {
    const relative = path.relative(originalRoot, file);
    if (path.extname(file).toLowerCase() !== expectedExtension) {
      errors.push(`unexpected file type: ${relative}`);
      continue;
    }
    candidates.push(file);
  }

  if (definition.validateHeader !== false) {
    for (const file of await findInvalidHeaders(candidates, definition.format)) {
      errors.push(`invalid ${definition.format.toUpperCase()} header: ${path.relative(originalRoot, file)}`);
    }
  }

  if (candidates.length === 0) errors.push(`no ${definition.format.toUpperCase()} files: ${definition.directory}`);
  return { ...definition, count: candidates.length, childDirectoryCount: childDirectories.length, errors };
}

export async function validateLocalAssets(originalRoot) {
  const definitions = [
    { key: "images", directory: "images", format: "bmp" },
    { key: "bgm", directory: "bgm", format: "wav" },
    { key: "se", directory: "se", format: "wav" },
    {
      key: "voice",
      directory: "voice",
      format: "wav",
      manualInstructionsRequired: true,
      requiredChildDirectories: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B"]
    }
  ];

  let scenarioCount = 0;
  const scenarioErrors = [];
  try {
    scenarioCount = (await collectFiles(path.join(originalRoot, "scenario"))).length;
    if (scenarioCount === 0) scenarioErrors.push("no files: scenario");
  } catch (error) {
    if (error?.code === "ENOENT") scenarioErrors.push("missing directory: scenario");
    else throw error;
  }

  const assets = [];
  for (const definition of definitions) {
    assets.push(await validateAssetDirectory(originalRoot, definition));
  }
  const errors = [...scenarioErrors, ...assets.flatMap((asset) => asset.errors)];
  return {
    originalRoot,
    scenario: { count: scenarioCount, errors: scenarioErrors },
    assets,
    errors,
    ok: errors.length === 0
  };
}
