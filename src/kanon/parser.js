import {
  KANON_COMMAND_KINDS,
  KanonModelError,
  KanonScenario,
  createAssetReference,
  createKanonCommand,
  createSourceLocation
} from "./model.js";

const supportedKinds = new Set(KANON_COMMAND_KINDS.filter((kind) => kind !== "unknown"));
const assetPayloadKinds = new Set([
  "background.show",
  "sprite.show",
  "bgm.play",
  "se.play",
  "voice.play",
  "kanon.background.open"
]);

export class KanonParser {
  parse(decoded) {
    if (!decoded?.scenario || !Array.isArray(decoded.records)) {
      throw new KanonModelError("KanonParser.parse requires decoded scenario records");
    }

    const commands = decoded.records.map((record) => this.#parseRecord(record));
    return new KanonScenario({
      id: decoded.scenario.id,
      entryLabel: decoded.scenario.entryLabel,
      commands
    });
  }

  #parseRecord(record) {
    const source = createSourceLocation({
      file: record.sourceFile,
      offset: record.offset,
      opcode: record.opcode,
      rawArguments: record.rawArguments,
      synthetic: record.synthetic,
      provenance: record.provenance ?? null,
      line: record.line ?? null
    });

    if (!record.decodedKind || !supportedKinds.has(record.decodedKind)) {
      return createKanonCommand({
        kind: "unknown",
        source,
        payload: {
          proposedKind: record.decodedKind,
          decodedPayload: structuredClone(record.payload ?? {})
        }
      });
    }

    const payload = structuredClone(record.payload ?? {});
    if (assetPayloadKinds.has(record.decodedKind)) {
      payload.asset = createAssetReference(payload.asset ?? {});
    }

    this.#validateKnownPayload(record.decodedKind, payload);
    return createKanonCommand({ kind: record.decodedKind, source, payload });
  }

  #validateKnownPayload(kind, payload) {
    const requireString = (name) => {
      if (typeof payload[name] !== "string" || payload[name].length === 0) {
        throw new KanonModelError(`${kind}.${name} must be a non-empty string`);
      }
    };
    const requireNonNegative = (name) => {
      if (!Number.isFinite(payload[name]) || payload[name] < 0) {
        throw new KanonModelError(`${kind}.${name} must be a non-negative number`);
      }
    };

    switch (kind) {
      case "label":
      case "jump":
        requireString(kind === "label" ? "name" : "target");
        break;
      case "text":
        requireString("text");
        break;
      case "sprite.show":
        requireString("slot");
        requireString("position");
        requireNonNegative("layer");
        break;
      case "sprite.hide":
        requireString("slot");
        requireNonNegative("layer");
        break;
      case "wait":
      case "transition":
        requireNonNegative("durationMs");
        break;
      case "kanon.background.open":
        if (!Number.isSafeInteger(payload.effectCode) || payload.effectCode < 0) {
          throw new KanonModelError("kanon.background.open.effectCode must be a non-negative integer");
        }
        if (payload.verifiedBehavior) {
          requireNonNegative("durationMs");
          requireString("transitionMethod");
        }
        break;
      case "variable.set":
      case "flag.set":
        requireString("name");
        break;
      case "choice":
        if (!Array.isArray(payload.options) || payload.options.length === 0) {
          throw new KanonModelError("choice.options must be a non-empty array");
        }
        for (const option of payload.options) {
          if (typeof option?.text !== "string" || typeof option?.target !== "string") {
            throw new KanonModelError("every choice option requires text and target strings");
          }
        }
        break;
      default:
        break;
    }
  }
}
