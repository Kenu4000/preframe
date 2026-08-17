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

test("KAG emitter configures the provisional Kanon txtwindow instead of the KAG default window", async () => {
  const { scenario, assets } = await loadDummy();
  const output = new KagEmitter(assets).emitScenario(scenario);
  assert.match(
    output,
    /@position layer=message0 page=fore left=6 top=352 width=628 height=64 frame="" color=0x00084c opacity=190/
  );
  assert.match(output, /marginl=12 margint=8 marginr=12 marginb=8/);
  assert.match(output, /@font face="ＭＳ ゴシック,MS Gothic" size=16 color=0xffffff/);
  assert.doesNotMatch(output, /@layopt layer=message0 page=fore visible=true\r?\n\[current/);
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

test("KAG emitter refuses Kprl text until its layout is verified", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "kprl-text", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 10,
        opcode: "#res",
        rawArguments: [{ type: "resourceRef", value: "0001" }],
        decodedKind: "text",
        payload: { text: "Synthetic line", requiresTextLayoutVerification: true }
      }
    ]
  });
  const scenario = new KanonParser().parse(decoded);
  const emitter = new KagEmitter(new KanonAssetCatalog({ schemaVersion: 1, assets: [] }));
  assert.throws(
    () => emitter.emitScenario(scenario),
    /Kprl text layout or speaker expression must be verified/
  );
});

test("KAG emitter keeps a Kprl inline speaker and dialogue on the same line", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "inline-speaker", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 10,
        opcode: "#res",
        rawArguments: [{ type: "resourceRef", value: "0017" }],
        decodedKind: "text",
        payload: {
          speaker: "女の子",
          speakerPresentation: "inline-prefix",
          text: "「……」",
          requiresTextLayoutVerification: false,
          usesTextWindow: true,
          advanceMode: "kanon.pause"
        }
      }
    ]
  });
  const output = new KagEmitter(new KanonAssetCatalog({ schemaVersion: 1, assets: [] })).emitScenario(
    new KanonParser().parse(decoded)
  );
  assert.match(output, /\[current layer=message0 page=fore\]女の子「……」/u);
  assert.doesNotMatch(output, /女の子.*\[r\].*「……」/u);
});

test("KAG emitter reproduces the verified opening background and txtwindow controls", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "verified-opening", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 10,
        opcode: "bgmLoop",
        rawArguments: [{ type: "string", value: "BGM16" }],
        decodedKind: "bgm.play",
        payload: {
          asset: { kind: "bgm", logicalId: "kanon.bgm.BGM16", originalId: "BGM16" },
          loop: true
        }
      },
      {
        offset: 20,
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
        offset: 30,
        opcode: "grpOpenBg",
        rawArguments: [{ type: "string", value: "BG053" }, { type: "integer", value: 0 }],
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
        offset: 40,
        opcode: "pause",
        rawArguments: [],
        decodedKind: "kanon.message.pause",
        payload: { mode: "txtwindow", clearTextAfterClick: true }
      }
    ]
  });
  const assets = new KanonAssetCatalog({
    schemaVersion: 1,
    assets: [
      {
        kind: "bgm",
        logicalId: "kanon.bgm.BGM16",
        originalId: "BGM16",
        runtimeStorage: "assets/bgm/BGM16.ogg"
      },
      {
        kind: "background",
        logicalId: "kanon.background.FGNY02A",
        originalId: "FGNY02A",
        runtimeStorage: "assets/background/FGNY02A.png"
      }
    ]
  });
  const output = new KagEmitter(assets).emitScenario(new KanonParser().parse(decoded));

  const bgm = output.indexOf('@playbgm storage="assets/bgm/BGM16.ogg" loop=true');
  const hideBacklay = output.indexOf("@backlay layer=message0", bgm);
  const hideTransition = output.indexOf("@trans method=crossfade time=200 layer=message0", hideBacklay);
  const hide = output.indexOf("@layopt layer=message0 page=fore visible=false opacity=255", hideTransition);
  const backlay = output.indexOf("@backlay layer=base", hide);
  const background = output.indexOf('@image storage="assets/background/FGNY02A.png" layer=base page=back', backlay);
  const transition = output.indexOf("@trans method=crossfade time=500 layer=base children=false", background);
  const pause = output.indexOf("[p][cm]", transition);
  assert.ok(bgm >= 0 && hideBacklay > bgm && hideTransition > hideBacklay && hide > hideTransition);
  assert.ok(backlay > hide && background > backlay);
  assert.ok(transition > background && pause > transition);
});

test("KAG emitter refuses bgmFadeOut until the Kprl duration unit is verified", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "SYNTHETIC.org",
    scenario: { id: "bgm-fade", entryLabel: "start" },
    records: [
      { offset: 0, opcode: "#entrypoint", rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 1,
        opcode: "bgmFadeOut",
        rawArguments: [{ type: "integer", value: 1200 }],
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
  const emitter = new KagEmitter(new KanonAssetCatalog({ schemaVersion: 1, assets: [] }));
  assert.throws(
    () => emitter.emitScenario(new KanonParser().parse(decoded)),
    /bgmFadeOut duration unit is not verified/
  );
});

test("KAG emitter reproduces the verified two-second white fade and hold", () => {
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
      }
    ]
  });
  const assets = new KanonAssetCatalog({
    schemaVersion: 1,
    assets: [
      {
        kind: "background",
        logicalId: "kanon.background.SIRO",
        originalId: "SIRO",
        runtimeStorage: "assets/background/SIRO.bmp"
      }
    ]
  });
  const output = new KagEmitter(assets).emitScenario(new KanonParser().parse(decoded));
  assert.match(output, /@trans method=crossfade time=2000 layer=base children=false/);
  assert.match(output, /@wait time=2000 canskip=false/);
});
