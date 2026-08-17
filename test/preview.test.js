import test from "node:test";
import assert from "node:assert/strict";
import {
  KanonScenario,
  createAssetReference,
  createKanonCommand,
  createSourceLocation
} from "../src/kanon/model.js";
import { collectScenarioAssetReferences, createDiagnosticPreviewScenario } from "../src/kanon/preview.js";
import { KagEmitter } from "../src/runtime/kag-emitter.js";
import { KanonAssetCatalog } from "../src/kanon/assets.js";

function command(kind, offset, opcode, payload = {}, rawArguments = []) {
  return createKanonCommand({
    kind,
    source: createSourceLocation({ file: "SYNTHETIC.org", offset, opcode, rawArguments, synthetic: true }),
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

test("diagnostic preview shows the cut SEEN0070 buffered background and absolute-position sprite", () => {
  const background = createAssetReference({
    kind: "background",
    logicalId: "kanon.background.BG003a",
    originalId: "BG003a"
  });
  const sprite = createAssetReference({
    kind: "sprite",
    logicalId: "kanon.sprite.SDT0107",
    originalId: "SDT0107"
  });
  const scenario = new KanonScenario({
    id: "SEEN0070",
    entryLabel: "start",
    commands: [
      command("label", 0, "#entrypoint", { name: "start" }),
      command("unknown", 1, "grpBuffer", {
        proposedKind: "kanon.kprl.grpBuffer",
        decodedPayload: { candidateAsset: background, candidateAssets: [background] }
      }, [
        { type: "expression", value: "strS[1000]" },
        { type: "integer", value: 2 }
      ]),
      command("unknown", 2, "objBgOfFile", {
        proposedKind: "kanon.kprl.objBgOfFile",
        decodedPayload: { candidateAsset: sprite, candidateAssets: [sprite] }
      }, [
        { type: "integer", value: 84 },
        { type: "expression", value: "strS[1004]" },
        { type: "integer", value: 1 }
      ]),
      command("unknown", 3, "objBgMove", { proposedKind: "kanon.kprl.objBgMove", decodedPayload: {} }, [
        { type: "integer", value: 84 },
        { type: "integer", value: 8 },
        { type: "integer", value: 8 }
      ]),
      command("unknown", 4, "grpMulti", { proposedKind: "kanon.kprl.grpMulti", decodedPayload: {} }, [
        { type: "integer", value: 2 },
        { type: "integer", value: 0 }
      ])
    ]
  });

  const preview = createDiagnosticPreviewScenario(scenario, {
    availableAssetLogicalIds: new Set([background.logicalId, sprite.logicalId])
  });
  assert.deepEqual(preview.scenario.commands.map((item) => item.kind), ["label", "background.show", "sprite.show"]);
  const shownSprite = preview.scenario.commands[2];
  assert.equal(shownSprite.payload.asset.originalId, "SDT0107");
  assert.equal(shownSprite.payload.x, 8);
  assert.equal(shownSprite.payload.y, 8);
  assert.equal(shownSprite.payload.originalObjectId, 84);

  const assets = new KanonAssetCatalog({
    schemaVersion: 1,
    assets: [
      { ...background, runtimeStorage: "assets/background/BG003a.bmp" },
      { ...sprite, runtimeStorage: "assets/sprite/SDT0107.bmp" }
    ]
  });
  const kag = new KagEmitter(assets).emitScenario(preview.scenario);
  assert.match(kag, /storage="assets\/sprite\/SDT0107\.bmp" layer=1 page=fore left=8 top=8/);
});

test("diagnostic preview keeps a cross-scenario jump when its target is built", () => {
  const scenario = new KanonScenario({
    id: "SEEN0050",
    entryLabel: "start",
    commands: [
      command("label", 0, "#entrypoint", { name: "start" }),
      command("kanon.scenario.jump", 1, "jump", {
        targetSceneNumber: 70,
        targetScenarioId: "SEEN0070",
        verifiedBehavior: true
      })
    ]
  });
  const preview = createDiagnosticPreviewScenario(scenario, {
    availableScenarioIds: new Set(["SEEN0050", "SEEN0070"])
  });
  assert.deepEqual(preview.scenario.commands.map((item) => item.kind), ["label", "kanon.scenario.jump"]);
  assert.equal(preview.skipped.length, 0);
});
