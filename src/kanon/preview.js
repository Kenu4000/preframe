import { KanonScenario, createKanonCommand } from "./model.js";

const assetCommandKinds = new Set([
  "background.show",
  "sprite.show",
  "bgm.play",
  "se.play",
  "voice.play",
  "kanon.background.open"
]);

export function collectScenarioAssetReferences(scenario) {
  const references = new Map();
  for (const command of scenario.commands) {
    if (!assetCommandKinds.has(command.kind) || !command.payload.asset) continue;
    references.set(command.payload.asset.logicalId, command.payload.asset);
  }
  return [...references.values()];
}

export function createDiagnosticPreviewScenario(scenario, { availableAssetLogicalIds = null } = {}) {
  const commands = [];
  const skipped = [];
  const approximations = [];

  for (const [index, command] of scenario.commands.entries()) {
    const diagnostic = {
      index,
      file: command.source.file,
      line: command.source.line,
      offset: command.source.offset,
      opcode: command.source.opcode
    };

    if (command.kind === "unknown") {
      skipped.push({
        ...diagnostic,
        reason: "unresolved-command",
        proposedKind: command.payload.proposedKind ?? null
      });
      continue;
    }

    if (command.kind === "kanon.opening.start") {
      skipped.push({ ...diagnostic, reason: "opening-playback-not-implemented" });
      continue;
    }

    if (
      availableAssetLogicalIds &&
      assetCommandKinds.has(command.kind) &&
      !availableAssetLogicalIds.has(command.payload.asset.logicalId)
    ) {
      skipped.push({
        ...diagnostic,
        reason: "local-asset-not-resolved",
        logicalId: command.payload.asset.logicalId,
        originalId: command.payload.asset.originalId
      });
      continue;
    }

    if (command.kind === "text" && (command.payload.requiresTextLayoutVerification || command.payload.speakerExpression)) {
      const payload = structuredClone(command.payload);
      payload.requiresTextLayoutVerification = false;
      if (payload.speakerExpression) {
        approximations.push({
          ...diagnostic,
          reason: "speaker-expression-omitted",
          expression: payload.speakerExpression
        });
        delete payload.speakerExpression;
      }
      approximations.push({ ...diagnostic, reason: "provisional-text-window-layout" });
      commands.push(createKanonCommand({ kind: command.kind, source: command.source, payload }));
      continue;
    }

    commands.push(command);
  }

  return {
    scenario: new KanonScenario({
      id: scenario.id,
      entryLabel: scenario.entryLabel,
      commands
    }),
    skipped,
    approximations
  };
}
