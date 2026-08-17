import test from "node:test";
import assert from "node:assert/strict";
import { KagEmitter, UnsupportedKanonCommandError } from "../src/runtime/kag-emitter.js";
import { KanonAssetCatalog } from "../src/kanon/assets.js";
import { KanonParser } from "../src/kanon/parser.js";
import { JsonDecodedRecordDecoder } from "../src/kanon/decoder.js";
import { loadDummy } from "../test-support/helpers.js";

test("KAG emitter stages visual changes on the back page before transition", async () => {
  const { scenario, assets } = await loadDummy();
  const output = new KagEmitter(assets).emitScenario(scenario);
  const backlay = output.indexOf("@backlay");
  const background = output.indexOf('page=back', backlay);
  const transition = output.indexOf("@trans method=crossfade", background);
  const wait = output.indexOf("@wt", transition);
  assert.ok(backlay >= 0 && background > backlay && transition > background && wait > transition);
  assert.match(output, /storage="assets\/background\/dummy-room\.png"/);
  assert.match(output, /@trace .*cond=sf\.kanonTraceEnabled/);
  assert.doesNotMatch(output, /originalId/);
  assert.doesNotMatch(output, /asset-id.*100/);
});

test("KAG emitter fails closed when an unknown command exists", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "CONTROL.BIN",
    scenario: { id: "unknown", entryLabel: "start" },
    records: [
      { offset: 0, opcode: 1, rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      { offset: 1, opcode: 999, rawArguments: [], payload: {} }
    ]
  });
  const scenario = new KanonParser().parse(decoded);
  const emitter = new KagEmitter(new KanonAssetCatalog({ schemaVersion: 1, assets: [] }));
  assert.throws(() => emitter.emitScenario(scenario), UnsupportedKanonCommandError);
});
