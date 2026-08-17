import test from "node:test";
import assert from "node:assert/strict";
import { reduceScenarioLinearly } from "../src/kanon/state.js";
import { renderScenarioTrace } from "../src/kanon/trace.js";
import { loadDummy } from "../test-support/helpers.js";
import { JsonDecodedRecordDecoder } from "../src/kanon/decoder.js";
import { KanonParser } from "../src/kanon/parser.js";

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

test("verified Kanon opening commands update visible state explicitly", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "verified-state", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 1,
        opcode: "bgmLoop",
        rawArguments: [],
        decodedKind: "bgm.play",
        payload: {
          asset: { kind: "bgm", logicalId: "kanon.bgm.BGM16", originalId: "BGM16" },
          loop: true,
          stopTrigger: "bgmFadeOut"
        }
      },
      {
        offset: 2,
        opcode: "msgHide",
        rawArguments: [],
        decodedKind: "kanon.message.hide",
        payload: {
          durationMs: 200,
          transitionMethod: "crossfade",
          target: "message0",
          verifiedBehavior: true
        }
      },
      {
        offset: 3,
        opcode: "grpOpenBg",
        rawArguments: [],
        decodedKind: "kanon.background.open",
        payload: {
          asset: { kind: "background", logicalId: "kanon.background.FGNY02A", originalId: "FGNY02A" },
          effectCode: 0,
          verifiedBehavior: true,
          transitionMethod: "crossfade",
          durationMs: 500
        }
      },
      {
        offset: 4,
        opcode: "#res",
        rawArguments: [],
        decodedKind: "text",
        payload: { text: "Synthetic line", usesTextWindow: true, advanceMode: "kanon.pause" }
      },
      {
        offset: 5,
        opcode: "pause",
        rawArguments: [],
        decodedKind: "kanon.message.pause",
        payload: { mode: "txtwindow", clearTextAfterClick: true }
      },
      {
        offset: 6,
        opcode: "bgmFadeOut",
        rawArguments: [],
        decodedKind: "kanon.bgm.fadeOut",
        payload: {
          rawDuration: 1200,
          durationUnit: "unverified",
          durationUnitVerified: false,
          stopsAfterFade: true
        }
      }
    ]
  });
  const state = reduceScenarioLinearly(new KanonParser().parse(decoded));
  assert.equal(state.visual.background.logicalId, "kanon.background.FGNY02A");
  assert.equal(state.transition.last.kanonEffectCode, 0);
  assert.equal(state.transition.last.durationMs, 500);
  assert.equal(state.timing.elapsedRequestedMs, 700);
  assert.equal(state.ui.messageVisible, true);
  assert.equal(state.ui.lastMessage, null);
  assert.equal(state.audio.bgm.status, "fading-out");
  assert.equal(state.audio.bgm.stopTrigger, "bgmFadeOut");
  assert.equal(state.audio.bgm.fadeOut.rawDuration, 1200);
});

test("verified white fade, hold, and opening call remain explicit in state and trace", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "opening-transition", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 1,
        opcode: "grpOpenBg",
        rawArguments: [],
        decodedKind: "kanon.background.open",
        payload: {
          asset: { kind: "background", logicalId: "kanon.background.SIRO", originalId: "SIRO" },
          effectCode: 26,
          verifiedBehavior: true,
          transitionMethod: "crossfade",
          durationMs: 2000,
          targetAppearance: "white"
        }
      },
      {
        offset: 2,
        opcode: "wait",
        rawArguments: [],
        decodedKind: "wait",
        payload: { durationMs: 2000, skippable: false, durationUnitVerified: true }
      },
      {
        offset: 3,
        opcode: "farcall",
        rawArguments: [],
        decodedKind: "kanon.opening.start",
        payload: { callTarget: 8502, verifiedBehavior: true }
      }
    ]
  });
  const scenario = new KanonParser().parse(decoded);
  const state = reduceScenarioLinearly(scenario);
  const trace = renderScenarioTrace(scenario);
  assert.equal(state.visual.background.originalId, "SIRO");
  assert.equal(state.transition.last.kanonEffectCode, 26);
  assert.equal(state.timing.elapsedRequestedMs, 4000);
  assert.equal(state.flow.phase, "opening");
  assert.equal(state.flow.openingCallTarget, 8502);
  assert.match(trace, /KANON_GRP_OPEN_BG kanon\.background\.SIRO effect=26 verified=true/);
  assert.match(trace, /WAIT 2000ms skippable=false/);
  assert.match(trace, /KANON_OPENING_START target=8502/);
});

test("cross-scenario jump exposes the next SEEN file in state and trace", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "SEEN0050", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 1,
        opcode: "jump",
        rawArguments: [{ type: "integer", value: 70 }],
        decodedKind: "kanon.scenario.jump",
        payload: { targetSceneNumber: 70, targetScenarioId: "SEEN0070", verifiedBehavior: true }
      }
    ]
  });
  const scenario = new KanonParser().parse(decoded);
  const state = reduceScenarioLinearly(scenario);
  const trace = renderScenarioTrace(scenario);
  assert.equal(state.scenario.id, "SEEN0050");
  assert.equal(state.scenario.nextId, "SEEN0070");
  assert.match(trace, /KANON_SCENARIO_JUMP number=70 target=SEEN0070/);
});
