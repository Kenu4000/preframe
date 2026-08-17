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
  const scenario = new KanonScenario({
    id: "preview",
    entryLabel: "start",
    commands: [
      command("label", 0, "#entrypoint", { name: "start" }),
      command("unknown", 1, "title", { proposedKind: "kanon.kprl.title", decodedPayload: {} }),
      command("text", 2, "#res", {
        text: "Synthetic line",
        speakerExpression: "\\m{A}",
        requiresTextLayoutVerification: true,
        usesTextWindow: true,
        advanceMode: "kanon.pause"
      }),
      command("bgm.play", 3, "bgmLoop", { asset: bgm, loop: true }),
      command("kanon.opening.start", 4, "farcall", { callTarget: 8502, verifiedBehavior: true })
    ]
  });

  assert.deepEqual(collectScenarioAssetReferences(scenario), [bgm]);
  const preview = createDiagnosticPreviewScenario(scenario, { availableAssetLogicalIds: new Set() });

  assert.deepEqual(preview.scenario.commands.map((item) => item.kind), ["label", "text"]);
  assert.equal(preview.scenario.commands[1].payload.requiresTextLayoutVerification, false);
  assert.equal("speakerExpression" in preview.scenario.commands[1].payload, false);
  assert.deepEqual(preview.skipped.map((item) => item.reason), [
    "unresolved-command",
    "local-asset-not-resolved",
    "opening-playback-not-implemented"
  ]);
  assert.deepEqual(preview.approximations.map((item) => item.reason), [
    "speaker-expression-omitted",
    "provisional-text-window-layout"
  ]);
});
