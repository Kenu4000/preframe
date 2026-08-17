export const KANON_COMMAND_KINDS = Object.freeze([
  "label",
  "text",
  "background.show",
  "sprite.show",
  "sprite.hide",
  "bgm.play",
  "bgm.stop",
  "se.play",
  "se.stop",
  "voice.play",
  "voice.stop",
  "wait",
  "transition",
  "kanon.background.open",
  "kanon.bgm.fadeOut",
  "kanon.message.hide",
  "kanon.message.pause",
  "kanon.opening.start",
  "kanon.scenario.jump",
  "variable.set",
  "flag.set",
  "jump",
  "choice",
  "end",
  "unknown"
]);

const commandKindSet = new Set(KANON_COMMAND_KINDS);
const assetKindSet = new Set(["background", "sprite", "cg", "bgm", "se", "voice"]);

export class KanonModelError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = "KanonModelError";
    this.details = details;
  }
}

export function createSourceLocation({
  file,
  offset,
  opcode,
  rawArguments = [],
  synthetic = false,
  provenance = null,
  line = null
}) {
  if (typeof file !== "string" || file.length === 0) {
    throw new KanonModelError("source.file must be a non-empty string");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new KanonModelError("source.offset must be a non-negative safe integer", { offset });
  }
  if (!(typeof opcode === "string" || Number.isSafeInteger(opcode))) {
    throw new KanonModelError("source.opcode must be a string or safe integer", { opcode });
  }
  if (!Array.isArray(rawArguments)) {
    throw new KanonModelError("source.rawArguments must be an array");
  }
  if (provenance !== null && (typeof provenance !== "string" || provenance.length === 0)) {
    throw new KanonModelError("source.provenance must be null or a non-empty string");
  }
  if (line !== null && (!Number.isSafeInteger(line) || line < 1)) {
    throw new KanonModelError("source.line must be null or a positive safe integer");
  }

  return Object.freeze({
    file,
    offset,
    opcode,
    rawArguments: structuredClone(rawArguments),
    synthetic: Boolean(synthetic),
    provenance,
    line
  });
}

export function createAssetReference({ kind, logicalId, originalId }) {
  if (!assetKindSet.has(kind)) {
    throw new KanonModelError(`unsupported Kanon asset kind: ${kind}`);
  }
  if (typeof logicalId !== "string" || logicalId.length === 0) {
    throw new KanonModelError("asset.logicalId must be a non-empty string");
  }
  if (!(typeof originalId === "string" || Number.isSafeInteger(originalId))) {
    throw new KanonModelError("asset.originalId must be a string or safe integer", { originalId });
  }

  return Object.freeze({ kind, logicalId, originalId });
}

export function createKanonCommand({ kind, source, payload = {} }) {
  if (!commandKindSet.has(kind)) {
    throw new KanonModelError(`unsupported Kanon command kind: ${kind}`);
  }
  if (!source || typeof source !== "object") {
    throw new KanonModelError("command.source is required");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new KanonModelError("command.payload must be an object");
  }

  return Object.freeze({ kind, source, payload: structuredClone(payload) });
}

export class KanonScenario {
  constructor({ id, entryLabel, commands }) {
    if (typeof id !== "string" || id.length === 0) {
      throw new KanonModelError("scenario.id must be a non-empty string");
    }
    if (typeof entryLabel !== "string" || entryLabel.length === 0) {
      throw new KanonModelError("scenario.entryLabel must be a non-empty string");
    }
    if (!Array.isArray(commands)) {
      throw new KanonModelError("scenario.commands must be an array");
    }

    const labels = new Map();
    commands.forEach((command, index) => {
      if (!commandKindSet.has(command?.kind)) {
        throw new KanonModelError(`invalid command at index ${index}`);
      }
      if (command.kind === "label") {
        const name = command.payload.name;
        if (typeof name !== "string" || name.length === 0) {
          throw new KanonModelError(`label at index ${index} has no name`);
        }
        if (labels.has(name)) {
          throw new KanonModelError(`duplicate label: ${name}`);
        }
        labels.set(name, index);
      }
    });

    if (!labels.has(entryLabel)) {
      throw new KanonModelError(`entry label does not exist: ${entryLabel}`);
    }

    this.id = id;
    this.entryLabel = entryLabel;
    this.commands = Object.freeze([...commands]);
    this.labels = labels;
    Object.freeze(this);
  }
}
