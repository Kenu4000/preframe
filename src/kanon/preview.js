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
    if (assetCommandKinds.has(command.kind) && command.payload.asset) {
      references.set(command.payload.asset.logicalId, command.payload.asset);
      continue;
    }
    const candidateAssets =
      command.kind === "unknown"
        ? command.payload.decodedPayload?.candidateAssets ??
          (command.payload.decodedPayload?.candidateAsset ? [command.payload.decodedPayload.candidateAsset] : [])
        : [];
    for (const candidateAsset of candidateAssets) {
      references.set(candidateAsset.logicalId, candidateAsset);
    }
  }
  return [...references.values()];
}

export function createDiagnosticPreviewScenario(
  scenario,
  { availableAssetLogicalIds = null, availableScenarioIds = null } = {}
) {
  const commands = [];
  const skipped = [];
  const approximations = [];
  const bufferedBackgrounds = new Map();
  const stagedSprites = new Map();

  const isAvailable = (asset) => !availableAssetLogicalIds || availableAssetLogicalIds.has(asset.logicalId);
  const recordMissingAsset = (diagnostic, command, asset) => {
    skipped.push({
      ...diagnostic,
      reason: "local-asset-not-resolved",
      proposedKind: command.payload.proposedKind,
      logicalId: asset.logicalId,
      originalId: asset.originalId
    });
  };
  const emitBackground = (command, asset, extraPayload = {}) => {
    commands.push(
      createKanonCommand({
        kind: "background.show",
        source: command.source,
        payload: { asset, diagnosticPreview: true, ...extraPayload }
      })
    );
  };

  for (const [index, command] of scenario.commands.entries()) {
    const diagnostic = {
      index,
      file: command.source.file,
      line: command.source.line,
      offset: command.source.offset,
      opcode: command.source.opcode
    };

    if (command.kind === "unknown") {
      const decodedPayload = command.payload.decodedPayload ?? {};
      const proposedKind = command.payload.proposedKind;
      const candidateAsset = decodedPayload.candidateAsset;

      if (proposedKind === "kanon.kprl.missingResourceText") {
        skipped.push({
          ...diagnostic,
          reason: "missing-resource-text",
          resourceId: decodedPayload.resourceId
        });
        continue;
      }

      if (proposedKind === "kanon.kprl.grpOpenBg" && candidateAsset) {
        if (!isAvailable(candidateAsset)) {
          recordMissingAsset(diagnostic, command, candidateAsset);
          continue;
        }
        emitBackground(command, candidateAsset, { ignoredEffectCode: decodedPayload.effectCode ?? null });
        approximations.push({
          ...diagnostic,
          reason: "unverified-background-effect-ignored",
          proposedKind,
          originalId: candidateAsset.originalId,
          effectCode: decodedPayload.effectCode ?? null
        });
        continue;
      }

      if (proposedKind === "kanon.kprl.recOpenBg" && candidateAsset) {
        if (!isAvailable(candidateAsset)) {
          recordMissingAsset(diagnostic, command, candidateAsset);
          continue;
        }
        emitBackground(command, candidateAsset, { ignoredRawArguments: command.source.rawArguments.length - 1 });
        approximations.push({
          ...diagnostic,
          reason: "unverified-background-region-and-effect-ignored",
          originalId: candidateAsset.originalId
        });
        continue;
      }

      if (proposedKind === "kanon.kprl.wavPlay" && candidateAsset) {
        if (!isAvailable(candidateAsset)) {
          recordMissingAsset(diagnostic, command, candidateAsset);
          continue;
        }
        commands.push(
          createKanonCommand({
            kind: "se.play",
            source: command.source,
            payload: { asset: candidateAsset, channel: 0, loop: false, diagnosticPreview: true }
          })
        );
        approximations.push({ ...diagnostic, reason: "wav-play-treated-as-one-shot-se" });
        continue;
      }

      if (proposedKind === "kanon.kprl.wavStop") {
        commands.push(
          createKanonCommand({
            kind: "se.stop",
            source: command.source,
            payload: { channel: 0, diagnosticPreview: true }
          })
        );
        approximations.push({ ...diagnostic, reason: "wav-stop-treated-as-se-channel-stop" });
        continue;
      }

      if (proposedKind === "kanon.kprl.grpBuffer" && candidateAsset) {
        const bufferNumber = command.source.rawArguments[1]?.value;
        if (!isAvailable(candidateAsset)) {
          recordMissingAsset(diagnostic, command, candidateAsset);
          continue;
        }
        if (Number.isSafeInteger(bufferNumber)) bufferedBackgrounds.set(bufferNumber, candidateAsset);
        approximations.push({
          ...diagnostic,
          reason: "background-buffer-staged-for-grp-multi",
          bufferNumber,
          originalId: candidateAsset.originalId
        });
        continue;
      }

      if (proposedKind === "kanon.kprl.objBgClear") {
        const objectId = command.source.rawArguments[0]?.value;
        if (Number.isSafeInteger(objectId)) stagedSprites.delete(objectId);
        approximations.push({ ...diagnostic, reason: "object-layer-cleared", objectId });
        continue;
      }

      if (proposedKind === "kanon.kprl.OBJWAIPERASE") {
        approximations.push({ ...diagnostic, reason: "unverified-object-wipe-effect-ignored" });
        continue;
      }

      if (proposedKind === "kanon.kprl.objBgOfFile" && candidateAsset) {
        const objectId = command.source.rawArguments[0]?.value;
        if (!isAvailable(candidateAsset)) {
          recordMissingAsset(diagnostic, command, candidateAsset);
          continue;
        }
        if (Number.isSafeInteger(objectId)) {
          stagedSprites.set(objectId, { asset: candidateAsset, x: 0, y: 0 });
        }
        approximations.push({
          ...diagnostic,
          reason: "object-sprite-staged-for-grp-multi",
          objectId,
          originalId: candidateAsset.originalId
        });
        continue;
      }

      if (proposedKind === "kanon.kprl.objBgMove") {
        const [objectId, x, y] = command.source.rawArguments.map((argument) => argument.value);
        const staged = stagedSprites.get(objectId);
        if (staged && Number.isFinite(x) && Number.isFinite(y)) {
          staged.x = x;
          staged.y = y;
        }
        approximations.push({ ...diagnostic, reason: "object-sprite-position-staged", objectId, x, y });
        continue;
      }

      if (proposedKind === "kanon.kprl.grpMulti") {
        const firstArgument = command.source.rawArguments[0];
        if (firstArgument?.type === "string" && candidateAsset) {
          if (!isAvailable(candidateAsset)) {
            recordMissingAsset(diagnostic, command, candidateAsset);
            continue;
          }
          emitBackground(command, candidateAsset);
          approximations.push({
            ...diagnostic,
            reason: "unverified-multi-background-reduced-to-primary-image",
            originalId: candidateAsset.originalId
          });
          continue;
        }
        if (firstArgument?.type === "integer") {
          const bufferNumber = firstArgument.value;
          const background = bufferedBackgrounds.get(bufferNumber);
          if (background) emitBackground(command, background, { sourceBuffer: bufferNumber });
          for (const [objectId, sprite] of stagedSprites) {
            commands.push(
              createKanonCommand({
                kind: "sprite.show",
                source: command.source,
                payload: {
                  asset: sprite.asset,
                  slot: `obj-${objectId}`,
                  x: sprite.x,
                  y: sprite.y,
                  layer: 1,
                  opacity: 255,
                  originalObjectId: objectId,
                  diagnosticPreview: true
                }
              })
            );
          }
          approximations.push({
            ...diagnostic,
            reason: "buffered-composite-shown-with-unverified-effect-ignored",
            bufferNumber,
            spriteCount: stagedSprites.size
          });
          continue;
        }
      }

      skipped.push({
        ...diagnostic,
        reason: "unresolved-command",
        proposedKind: proposedKind ?? null
      });
      continue;
    }

    if (command.kind === "kanon.opening.start") {
      skipped.push({ ...diagnostic, reason: "opening-playback-not-implemented" });
      continue;
    }

    if (command.kind === "kanon.scenario.jump") {
      if (!availableScenarioIds || !availableScenarioIds.has(command.payload.targetScenarioId)) {
        skipped.push({
          ...diagnostic,
          reason: "target-scenario-not-built",
          targetSceneNumber: command.payload.targetSceneNumber,
          targetScenarioId: command.payload.targetScenarioId
        });
        continue;
      }
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
