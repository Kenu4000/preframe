import test from "node:test";
import assert from "node:assert/strict";
import { reduceScenarioLinearly } from "../src/kanon/state.js";
import { renderScenarioTrace } from "../src/kanon/trace.js";
import { loadDummy } from "../test-support/helpers.js";

test("state reducer exposes the expected final Kanon state", async () => {
  const { scenario } = await loadDummy();
  const state = reduceScenarioLinearly(scenario);
  assert.equal(state.scenario.id, "dummy");
  assert.equal(state.scenario.label, "start");
  assert.equal(state.scenario.ended, true);
  assert.equal(state.visual.background.logicalId, "bg.dummy.room");
  assert.equal(state.visual.sprites.main.position, "center");
  assert.equal(state.audio.bgm.asset.logicalId, "bgm.dummy");
  assert.equal(state.flags.dummy_seen, true);
  assert.equal(state.transition.last.durationMs, 350);
  assert.equal(state.timing.elapsedRequestedMs, 600);
});

test("trace redacts scenario text by default and can include it explicitly", async () => {
  const { scenario } = await loadDummy();
  const redacted = renderScenarioTrace(scenario);
  const full = renderScenarioTrace(scenario, { includeText: true });
  assert.match(redacted, /TEXT speaker=.* length=21/);
  assert.doesNotMatch(redacted, /これは原作データ/);
  assert.match(full, /これは原作データを含まない合成シーンです/);
  assert.match(redacted, /DUMMY_CONTROL\.DATA:0x00000060/);
});
