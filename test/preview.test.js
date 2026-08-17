import test from "node:test";
import assert from "node:assert/strict";
import {
  KanonScenario,
  createAssetReference,
  createKanonCommand,
  createSourceLocation
} from "../src/kanon/model.js";
import { collectScenarioAssetReferences, createDiagnosticPreviewScenario } from "../src/kanon/preview.js";

function command(kind, offset, opcode, payload = {}) {
  return createKanonCommand({
    kind,
    source: createSourceLocation({ file: "SYNTHETIC.org", offset, opcode, rawArguments: [], synthetic: true }),
    payload
  });
}

test("diagnostic preview keeps supported real-data commands and records every omission", () => {
  const bgm = createAssetReference({ kind: "bgm", logicalId: "kanon.bgm.BGM16", originalId: "BGM16" });
  const background = createAssetReference({
    kind: "background",
    logicalId: "kanon.background.BG053",
    originalId: "BG053"
  });
  const scenario = new KanonScenario({
    id: "preview",
    entryLabel: "start",
    commands: [
      command("label", 0, "#entrypoint", { name: "start" }),
      command("unknown", 1, "title", { proposedKind: "kanon.kprl.title", decodedPayload: {} }),
      command("unknown", 2, "grpOpenBg", {
        proposedKind: "kanon.kprl.grpOpenBg",
        decodedPayload: { candidateAsset: background, effectCode: 0 }
      }),
      command("text", 3, "#res", {
        text: "Synthetic line",
        speakerExpression: "\\m{A}",
        requiresTextLayoutVerification: true,
        usesTextWindow: true,
        advanceMode: "kanon.pause"
      }),
      command("bgm.play", 4, "bgmLoop", { asset: bgm, loop: true }),
      command("kanon.opening.start", 5, "farcall", { callTarget: 8502, verifiedBehavior: true }),
      command("kanon.scenario.jump", 6, "jump", {
        targetSceneNumber: 70,
        targetScenarioId: "SEEN0070",
        verifiedBehavior: true
      })
    ]
  });

  assert.deepEqual(collectScenarioAssetReferences(scenario), [background, bgm]);
  const preview = createDiagnosticPreviewScenario(scenario, {
    availableAssetLogicalIds: new Set([background.logicalId])
  });

  assert.deepEqual(preview.scenario.commands.map((item) => item.kind), ["label", "background.show", "text"]);
  assert.equal(preview.scenario.commands[1].payload.asset.logicalId, background.logicalId);
  assert.equal(preview.scenario.commands[1].payload.ignoredEffectCode, 0);
  assert.equal(preview.scenario.commands[2].payload.requiresTextLayoutVerification, false);
  assert.equal("speakerExpression" in preview.scenario.commands[2].payload, false);
  assert.deepEqual(preview.skipped.map((item) => item.reason), [
    "unresolved-command",
    "local-asset-not-resolved",
    "opening-playback-not-implemented",
    "target-scenario-not-built"
  ]);
  assert.equal(preview.skipped[3].targetScenarioId, "SEEN0070");
  assert.deepEqual(preview.approximations.map((item) => item.reason), [
    "unverified-background-effect-ignored",
    "speaker-expression-omitted",
    "provisional-text-window-layout"
  ]);
});
