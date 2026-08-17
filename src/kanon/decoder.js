import { KanonModelError } from "./model.js";

export class KanonDecoder {
  decode(_input, _context = {}) {
    throw new Error("KanonDecoder.decode must be implemented by a format-specific decoder");
  }
}

export class JsonDecodedRecordDecoder extends KanonDecoder {
  decode(input, context = {}) {
    let document;
    if (typeof input === "string") {
      document = JSON.parse(input);
    } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
      document = JSON.parse(Buffer.from(input).toString("utf8"));
    } else {
      document = structuredClone(input);
    }

    if (document?.schemaVersion !== 1) {
      throw new KanonModelError("decoded record schemaVersion must be 1");
    }
    if (!document.scenario || typeof document.scenario.id !== "string") {
      throw new KanonModelError("decoded record document must contain scenario metadata");
    }
    if (!Array.isArray(document.records)) {
      throw new KanonModelError("decoded record document must contain a records array");
    }

    const sourceFile = context.sourceFile ?? document.sourceFile;
    if (typeof sourceFile !== "string" || sourceFile.length === 0) {
      throw new KanonModelError("sourceFile is required for decoded records");
    }

    const records = document.records.map((record, index) => {
      if (!Number.isSafeInteger(record?.offset) || record.offset < 0) {
        throw new KanonModelError(`record ${index} has an invalid offset`);
      }
      if (!(typeof record.opcode === "string" || Number.isSafeInteger(record.opcode))) {
        throw new KanonModelError(`record ${index} has an invalid opcode`);
      }
      if (!Array.isArray(record.rawArguments)) {
        throw new KanonModelError(`record ${index} has no rawArguments array`);
      }

      return {
        offset: record.offset,
        opcode: record.opcode,
        rawArguments: structuredClone(record.rawArguments),
        decodedKind: typeof record.decodedKind === "string" ? record.decodedKind : null,
        payload: record.payload && typeof record.payload === "object" ? structuredClone(record.payload) : {},
        sourceFile,
        synthetic: Boolean(context.synthetic ?? document.synthetic ?? false),
        provenance: typeof record.provenance === "string" ? record.provenance : null,
        line: Number.isSafeInteger(record.line) ? record.line : null
      };
    });

    return {
      scenario: structuredClone(document.scenario),
      sourceFile,
      records
    };
  }
}
