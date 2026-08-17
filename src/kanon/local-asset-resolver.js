import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const kindDefinitions = Object.freeze({
  background: { directory: "images", extensions: [".bmp"] },
  sprite: { directory: "images", extensions: [".bmp"] },
  cg: { directory: "images", extensions: [".bmp"] },
  bgm: { directory: "bgm", extensions: [".wav"] },
  se: { directory: "se", extensions: [".wav"] },
  voice: { directory: "voice", extensions: [".wav"] }
});

async function collectFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function lookupKeys(root, file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const extension = path.extname(relative);
  const withoutExtension = relative.slice(0, -extension.length);
  return [withoutExtension.toLowerCase(), path.basename(withoutExtension).toLowerCase()];
}

function originalIdKeys(originalId) {
  const normalized = String(originalId).replaceAll("\\", "/");
  const extension = path.posix.extname(normalized);
  const withoutExtension = extension ? normalized.slice(0, -extension.length) : normalized;
  return [withoutExtension.toLowerCase(), path.posix.basename(withoutExtension).toLowerCase()];
}

function safeRuntimeName(originalId, index, extension) {
  const candidate = String(originalId).replace(/[^A-Za-z0-9_.-]+/gu, "_").replace(/^\.+/u, "");
  const base = candidate.length > 0 ? candidate : `asset-${index}`;
  return `${String(index).padStart(4, "0")}-${base}${extension.toLowerCase()}`;
}

async function buildIndex(root, extensions) {
  const index = new Map();
  for (const file of await collectFiles(root)) {
    if (!extensions.includes(path.extname(file).toLowerCase())) continue;
    for (const key of lookupKeys(root, file)) {
      const candidates = index.get(key) ?? [];
      if (!candidates.includes(file)) candidates.push(file);
      index.set(key, candidates);
    }
  }
  return index;
}

export async function resolveLocalAssetReferences(originalRoot, references) {
  const indexes = new Map();
  const resolved = [];
  const unresolved = [];

  for (const [position, reference] of references.entries()) {
    const definition = kindDefinitions[reference.kind];
    if (!definition) {
      unresolved.push({ reference, reason: "unsupported-asset-kind" });
      continue;
    }

    if (!indexes.has(reference.kind)) {
      const root = path.join(originalRoot, definition.directory);
      indexes.set(reference.kind, { root, index: await buildIndex(root, definition.extensions) });
    }
    const indexed = indexes.get(reference.kind);
    const [exactKey, basenameKey] = originalIdKeys(reference.originalId);
    const exactCandidates = indexed.index.get(exactKey) ?? [];
    const candidates = new Set(exactCandidates.length > 0 ? exactCandidates : indexed.index.get(basenameKey) ?? []);

    if (candidates.size !== 1) {
      unresolved.push({
        reference,
        reason: candidates.size === 0 ? "not-found" : "ambiguous",
        candidateCount: candidates.size
      });
      continue;
    }

    const sourcePath = [...candidates][0];
    const extension = path.extname(sourcePath);
    const runtimeStorage = `assets/${reference.kind}/${safeRuntimeName(reference.originalId, position, extension)}`;
    resolved.push({
      reference,
      sourcePath,
      runtimeStorage,
      manifestEntry: {
        kind: reference.kind,
        logicalId: reference.logicalId,
        originalId: reference.originalId,
        runtimeStorage
      }
    });
  }

  return { resolved, unresolved };
}

export async function copyResolvedAssets(resolved, dataRoot) {
  for (const asset of resolved) {
    const destination = path.join(dataRoot, ...asset.runtimeStorage.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(asset.sourcePath, destination);
  }
}
