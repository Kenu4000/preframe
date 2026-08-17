import { KanonDecoder } from "./decoder.js";
import { KanonModelError } from "./model.js";

function asUtf8Text(value, name) {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  throw new KanonModelError(`${name} must be UTF-8 text or bytes`);
}

function linesWithByteOffsets(text) {
  const lines = [];
  let characterOffset = 0;
  let byteOffset = 0;
  let lineNumber = 1;

  while (characterOffset < text.length) {
    const newline = text.indexOf("\n", characterOffset);
    const end = newline === -1 ? text.length : newline;
    const rawLine = text.slice(characterOffset, end);
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const consumed = text.slice(characterOffset, newline === -1 ? text.length : newline + 1);

    lines.push({ line, lineNumber, byteOffset });
    byteOffset += Buffer.byteLength(consumed, "utf8");
    characterOffset = newline === -1 ? text.length : newline + 1;
    lineNumber += 1;
  }

  return lines;
}

function splitCodeAndComment(line) {
  let quoted = false;
  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index];
    if (character === "'" && line[index - 1] !== "\\") {
      quoted = !quoted;
    }
    if (!quoted && character === "/" && line[index + 1] === "/") {
      return { code: line.slice(0, index).trim(), comment: line.slice(index + 2).trim() };
    }
  }
  return { code: line.trim(), comment: "" };
}

function splitArguments(source) {
  if (source.trim().length === 0) {
    return [];
  }

  const tokens = [];
  let quoted = false;
  let roundDepth = 0;
  let squareDepth = 0;
  let braceDepth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'" && source[index - 1] !== "\\") {
      quoted = !quoted;
    } else if (!quoted && character === "(") {
      roundDepth += 1;
    } else if (!quoted && character === ")") {
      roundDepth -= 1;
    } else if (!quoted && character === "[") {
      squareDepth += 1;
    } else if (!quoted && character === "]") {
      squareDepth -= 1;
    } else if (!quoted && character === "{") {
      braceDepth += 1;
    } else if (!quoted && character === "}") {
      braceDepth -= 1;
    } else if (!quoted && roundDepth === 0 && squareDepth === 0 && braceDepth === 0 && character === ",") {
      tokens.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted) {
    throw new KanonModelError(`unterminated quoted Kprl argument: ${source}`);
  }
  tokens.push(source.slice(start).trim());
  return tokens;
}

function parseArgument(token) {
  const resource = token.match(/^#res<([0-9A-Fa-f]+)>$/);
  if (resource) {
    return { type: "resourceRef", value: resource[1], raw: token };
  }
  if (/^[+-]?\d+$/.test(token)) {
    const value = Number(token);
    if (!Number.isSafeInteger(value)) {
      throw new KanonModelError(`Kprl integer is outside the safe range: ${token}`);
    }
    return { type: "integer", value, raw: token };
  }
  if (token.startsWith("'") && token.endsWith("'")) {
    return { type: "string", value: token.slice(1, -1), raw: token };
  }
  return { type: "expression", value: token, raw: token };
}

function parseArguments(source) {
  return splitArguments(source).map(parseArgument);
}

function parseMessageMarkup(value) {
  if (!value.startsWith("\\{")) {
    return { text: value };
  }

  let depth = 1;
  for (let index = 2; index < value.length; index += 1) {
    if (value[index] === "{") {
      depth += 1;
    } else if (value[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        const markup = value.slice(2, index);
        const result = { text: value.slice(index + 1), speakerMarkup: markup };
        if (/^[^\\{}]+$/u.test(markup)) {
          result.speaker = markup;
        } else {
          result.speakerExpression = markup;
        }
        return result;
      }
    }
  }

  return { text: value, malformedSpeakerMarkup: true };
}

function parseResources(resourceText, resourceFile) {
  const resources = new Map();
  const characters = [];

  for (const source of linesWithByteOffsets(resourceText)) {
    const sourceLine = source.lineNumber === 1 ? source.line.replace(/^\uFEFF/u, "") : source.line;
    const line = sourceLine.trim();
    if (line.length === 0 || line.startsWith("//")) {
      continue;
    }

    const character = line.match(/^#character\s+'(.*)'$/u);
    if (character) {
      characters.push(character[1]);
      continue;
    }

    const resource = sourceLine.match(/^<([0-9A-Fa-f]+)>[ \t]?(.*)$/u);
    if (!resource) {
      throw new KanonModelError(`unsupported Kprl resource syntax at ${resourceFile}:${source.lineNumber}`);
    }
    if (resources.has(resource[1])) {
      throw new KanonModelError(`duplicate Kprl resource id: ${resource[1]}`);
    }
    resources.set(resource[1], {
      value: resource[2],
      sourceFile: resourceFile,
      byteOffset: source.byteOffset,
      lineNumber: source.lineNumber
    });
  }

  return { resources, characters };
}

function scenarioIdFromFile(file) {
  const name = file.replaceAll("\\", "/").split("/").at(-1) ?? file;
  return name.replace(/\.[^.]+$/, "");
}

function entryLabel(number, comment) {
  const candidate = comment.split(/\s+/u)[0];
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(candidate) ? candidate : `entry_${number}`;
}

function logicalAssetReference(kind, originalId) {
  return {
    kind,
    logicalId: `kanon.${kind}.${originalId}`,
    originalId
  };
}

function verifiedGrpOpenBgBehavior(originalId, effectCode) {
  if (originalId === "FGNY02A" && effectCode === 0) {
    return {
      verifiedBehavior: true,
      transitionMethod: "crossfade",
      durationMs: 500,
      evidence: "measured-from-30fps-recording"
    };
  }
  return null;
}

function unknownRecord(source, sourceFile, mnemonic, rawArguments, payload = {}) {
  return {
    sourceFile,
    offset: source.byteOffset,
    opcode: mnemonic,
    rawArguments,
    decodedKind: `kanon.kprl.${mnemonic}`,
    payload: { mnemonic, sourceLine: source.lineNumber, ...payload },
    synthetic: false,
    provenance: "kprl-disassembly",
    line: source.lineNumber
  };
}

export class KprlDisassemblyDecoder extends KanonDecoder {
  decode(input, context = {}) {
    if (!input || typeof input !== "object") {
      throw new KanonModelError("Kprl decoder input must contain disassembly and resources");
    }

    const disassembly = asUtf8Text(input.disassembly, "Kprl disassembly");
    const resourceText = asUtf8Text(input.resources, "Kprl resources");
    const sourceFile = context.sourceFile ?? "scenario.org";
    const resourceFile = context.resourceFile ?? "scenario.utf";
    const parsedResources = parseResources(resourceText, resourceFile);
    const records = [];
    const metadata = {
      format: "kprl-disassembly",
      disassembler: null,
      originalSourceFile: null,
      declaredResourceFile: null,
      kidokuType: null,
      characters: parsedResources.characters
    };
    let firstEntryLabel = null;

    for (const source of linesWithByteOffsets(disassembly)) {
      const sourceLine = source.lineNumber === 1 ? source.line.replace(/^\uFEFF/u, "") : source.line;
      const trimmed = sourceLine.trim();
      if (trimmed.length === 0 || trimmed.startsWith("//")) {
        continue;
      }

      const disassembler = trimmed.match(/Disassembled with\s+(Kprl)\s+([0-9.]+)/iu);
      if (disassembler) {
        metadata.disassembler = { name: disassembler[1], version: disassembler[2] };
        continue;
      }

      const fileDirective = trimmed.match(/^#file\s+'(.*)'$/u);
      if (fileDirective) {
        metadata.originalSourceFile = fileDirective[1];
        continue;
      }
      const resourceDirective = trimmed.match(/^#resource\s+'(.*)'$/u);
      if (resourceDirective) {
        metadata.declaredResourceFile = resourceDirective[1];
        continue;
      }
      const kidokuDirective = trimmed.match(/^#kidoku_type\s+([+-]?\d+)$/u);
      if (kidokuDirective) {
        metadata.kidokuType = Number(kidokuDirective[1]);
        continue;
      }

      const { code, comment } = splitCodeAndComment(sourceLine);
      const entrypoint = code.match(/^#entrypoint\s+([0-9A-Fa-f]+)$/u);
      if (entrypoint) {
        const name = entryLabel(entrypoint[1], comment);
        firstEntryLabel ??= name;
        records.push({
          sourceFile,
          offset: source.byteOffset,
          opcode: "#entrypoint",
          rawArguments: [{ type: "entrypoint", value: entrypoint[1], raw: entrypoint[1] }],
          decodedKind: "label",
          payload: { name, entrypoint: entrypoint[1], sourceLine: source.lineNumber },
          synthetic: false,
          provenance: "kprl-disassembly",
          line: source.lineNumber
        });
        continue;
      }

      const resourceReference = code.match(/^#res<([0-9A-Fa-f]+)>$/u);
      if (resourceReference) {
        const id = resourceReference[1];
        const resource = parsedResources.resources.get(id);
        if (!resource) {
          throw new KanonModelError(`Kprl resource ${id} referenced at ${sourceFile}:${source.lineNumber} is missing`);
        }
        records.push({
          sourceFile,
          offset: source.byteOffset,
          opcode: "#res",
          rawArguments: [{ type: "resourceRef", value: id, raw: `#res<${id}>` }],
          decodedKind: "text",
          payload: {
            ...parseMessageMarkup(resource.value),
            resourceId: id,
            resourceSource: {
              file: resource.sourceFile,
              offset: resource.byteOffset,
              line: resource.lineNumber
            },
            usesTextWindow: true,
            advanceMode: "kanon.pause",
            requiresTextLayoutVerification: true
          },
          synthetic: false,
          provenance: "kprl-disassembly",
          line: source.lineNumber
        });
        continue;
      }

      const assignment = code.match(/^([A-Za-z_][A-Za-z0-9_]*)\[([+-]?\d+)\]\s*=\s*(.+)$/u);
      if (assignment) {
        const bank = assignment[1];
        const index = Number(assignment[2]);
        const value = parseArgument(assignment[3].trim());
        const rawArguments = [
          { type: "variableBank", value: bank, raw: bank },
          { type: "integer", value: index, raw: assignment[2] },
          value
        ];
        if (Number.isSafeInteger(index) && ["integer", "string"].includes(value.type)) {
          records.push({
            sourceFile,
            offset: source.byteOffset,
            opcode: "assign",
            rawArguments,
            decodedKind: "variable.set",
            payload: { name: `${bank}_${index}`, bank, index, value: value.value, sourceLine: source.lineNumber },
            synthetic: false,
            provenance: "kprl-disassembly",
            line: source.lineNumber
          });
        } else {
          records.push(unknownRecord(source, sourceFile, "assign", rawArguments, { bank, index }));
        }
        continue;
      }

      const call = code.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/u);
      if (call) {
        const mnemonic = call[1];
        const rawArguments = parseArguments(call[2]);

        if (mnemonic === "bgmLoop" && rawArguments.length === 1 && rawArguments[0].type === "string") {
          const originalId = rawArguments[0].value;
          records.push({
            sourceFile,
            offset: source.byteOffset,
            opcode: mnemonic,
            rawArguments,
            decodedKind: "bgm.play",
            payload: {
              asset: logicalAssetReference("bgm", originalId),
              loop: true,
              stopTrigger: "bgmFadeOut",
              sourceLine: source.lineNumber
            },
            synthetic: false,
            provenance: "kprl-disassembly",
            line: source.lineNumber
          });
          continue;
        }

        if (
          mnemonic === "bgmFadeOut" &&
          rawArguments.length === 1 &&
          rawArguments[0].type === "integer" &&
          rawArguments[0].value >= 0
        ) {
          records.push({
            sourceFile,
            offset: source.byteOffset,
            opcode: mnemonic,
            rawArguments,
            decodedKind: "kanon.bgm.fadeOut",
            payload: {
              rawDuration: rawArguments[0].value,
              durationUnit: "unverified",
              durationUnitVerified: false,
              stopsAfterFade: true,
              sourceLine: source.lineNumber
            },
            synthetic: false,
            provenance: "kprl-disassembly",
            line: source.lineNumber
          });
          continue;
        }

        if (
          mnemonic === "grpOpenBg" &&
          rawArguments.length === 2 &&
          rawArguments[0].type === "string" &&
          rawArguments[1].type === "integer"
        ) {
          const originalId = rawArguments[0].value;
          const effectCode = rawArguments[1].value;
          const behavior = verifiedGrpOpenBgBehavior(originalId, effectCode);
          if (behavior) {
            records.push({
              sourceFile,
              offset: source.byteOffset,
              opcode: mnemonic,
              rawArguments,
              decodedKind: "kanon.background.open",
              payload: {
                asset: logicalAssetReference("background", originalId),
                effectCode,
                ...behavior,
                sourceLine: source.lineNumber
              },
              synthetic: false,
              provenance: "kprl-disassembly",
              line: source.lineNumber
            });
          } else {
            records.push(
              unknownRecord(source, sourceFile, mnemonic, rawArguments, {
                candidateAsset: logicalAssetReference("background", originalId),
                effectCode
              })
            );
          }
          continue;
        }

        const payload = {};
        if (mnemonic === "title" && rawArguments[0]?.type === "resourceRef") {
          const resource = parsedResources.resources.get(rawArguments[0].value);
          if (!resource) {
            throw new KanonModelError(`Kprl title resource ${rawArguments[0].value} is missing`);
          }
          payload.resourceId = rawArguments[0].value;
          payload.resourceSource = {
            file: resource.sourceFile,
            offset: resource.byteOffset,
            line: resource.lineNumber
          };
        }
        records.push(unknownRecord(source, sourceFile, mnemonic, rawArguments, payload));
        continue;
      }

      if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(code)) {
        if (code === "msgHide" || code === "pause") {
          records.push({
            sourceFile,
            offset: source.byteOffset,
            opcode: code,
            rawArguments: [],
            decodedKind: code === "msgHide" ? "kanon.message.hide" : "kanon.message.pause",
            payload: {
              sourceLine: source.lineNumber,
              ...(code === "pause"
                ? { clearTextAfterClick: true, mode: "txtwindow" }
                : {
                    durationMs: 200,
                    transitionMethod: "crossfade",
                    target: "message0",
                    verifiedBehavior: true,
                    evidence: "measured-from-30fps-recording"
                  })
            },
            synthetic: false,
            provenance: "kprl-disassembly",
            line: source.lineNumber
          });
          continue;
        }
        records.push(unknownRecord(source, sourceFile, code, []));
        continue;
      }

      const directive = code.match(/^(#[A-Za-z_][A-Za-z0-9_]*)\b(.*)$/u);
      if (directive) {
        records.push(
          unknownRecord(source, sourceFile, directive[1], [
            { type: "text", value: directive[2].trim(), raw: directive[2].trim() }
          ])
        );
        continue;
      }

      records.push(
        unknownRecord(source, sourceFile, "unparsed", [{ type: "text", value: code, raw: code }])
      );
    }

    if (!firstEntryLabel) {
      throw new KanonModelError("Kprl disassembly has no #entrypoint directive");
    }
    if (!metadata.originalSourceFile) {
      throw new KanonModelError("Kprl disassembly has no #file directive");
    }

    return {
      schemaVersion: 1,
      sourceFile,
      scenario: {
        id: context.scenarioId ?? scenarioIdFromFile(metadata.originalSourceFile),
        entryLabel: firstEntryLabel,
        ...metadata
      },
      records
    };
  }
}
