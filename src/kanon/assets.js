import { KanonModelError } from "./model.js";

const safeStoragePattern = /^[A-Za-z0-9_./-]+$/;

export class KanonAssetCatalog {
  constructor(document) {
    if (document?.schemaVersion !== 1 || !Array.isArray(document.assets)) {
      throw new KanonModelError("asset manifest must use schemaVersion 1 and contain assets");
    }

    this.byLogicalId = new Map();
    for (const [index, entry] of document.assets.entries()) {
      if (typeof entry.logicalId !== "string" || entry.logicalId.length === 0) {
        throw new KanonModelError(`asset ${index} has no logicalId`);
      }
      if (this.byLogicalId.has(entry.logicalId)) {
        throw new KanonModelError(`duplicate logical asset id: ${entry.logicalId}`);
      }
      if (typeof entry.runtimeStorage !== "string" || !safeStoragePattern.test(entry.runtimeStorage)) {
        throw new KanonModelError(`asset ${entry.logicalId} has unsafe runtimeStorage`);
      }
      if (entry.runtimeStorage.startsWith("/") || entry.runtimeStorage.includes("../")) {
        throw new KanonModelError(`asset ${entry.logicalId} escapes the runtime root`);
      }
      this.byLogicalId.set(entry.logicalId, Object.freeze(structuredClone(entry)));
    }
  }

  resolve(reference) {
    const entry = this.byLogicalId.get(reference.logicalId);
    if (!entry) {
      throw new KanonModelError(`unmapped logical asset id: ${reference.logicalId}`);
    }
    if (entry.kind !== reference.kind) {
      throw new KanonModelError(
        `asset kind mismatch for ${reference.logicalId}: command=${reference.kind}, manifest=${entry.kind}`
      );
    }
    if (entry.originalId !== reference.originalId) {
      throw new KanonModelError(`original asset id mismatch for ${reference.logicalId}`);
    }
    return entry.runtimeStorage;
  }
}

