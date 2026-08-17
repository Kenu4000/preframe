import test from "node:test";
import assert from "node:assert/strict";
import { KprlDisassemblyDecoder } from "../src/kanon/kprl-decoder.js";
import { KanonParser } from "../src/kanon/parser.js";

function syntheticPair() {
  const disassembly = [
    "{-# cp utf8 #- Disassembled with Kprl 1.45 -}",
    "",
    "#file 'SCENE0001.TXT'",
    "#resource 'SCENE0001.utf'",
    "#kidoku_type 2",
    "",
    "#entrypoint 000 // S00",
    "intF[12] = 1",
    "bgmLoop('BGM01')",
    "msgHide",
    "grpOpenBg('FGNY02A', 0)",
    "#res<0001>",
    "pause",
    "bgmFadeOut(1200)",
    "wait(250)",
    "mystery(7, 'X')"
  ].join("\r\n");
  const resources = [
    "// Synthetic resources",
    "#character 'Guide'",
    "<0001> \\{Guide}Synthetic line"
  ].join("\r\n");
  return { disassembly, resources };
}

test("Kprl decoder joins numbered resources without discarding source provenance", () => {
  const input = syntheticPair();
  const decoded = new KprlDisassemblyDecoder().decode(input, {
    sourceFile: "SCENE0001.org",
    resourceFile: "SCENE0001.utf"
  });
  const scenario = new KanonParser().parse(decoded);

  assert.equal(decoded.scenario.id, "SCENE0001");
  assert.equal(decoded.scenario.entryLabel, "S00");
  assert.deepEqual(decoded.scenario.disassembler, { name: "Kprl", version: "1.45" });
  assert.equal(decoded.scenario.kidokuType, 2);
  assert.deepEqual(decoded.scenario.characters, ["Guide"]);
  assert.deepEqual(
    scenario.commands.map((command) => command.kind),
    [
      "label",
      "variable.set",
      "bgm.play",
      "kanon.message.hide",
      "kanon.background.open",
      "text",
      "kanon.message.pause",
      "kanon.bgm.fadeOut",
      "wait",
      "unknown"
    ]
  );

  const assignment = scenario.commands[1];
  assert.equal(assignment.payload.bank, "intF");
  assert.equal(assignment.payload.index, 12);
  assert.equal(assignment.payload.value, 1);

  const text = scenario.commands[5];
  assert.equal(text.payload.speaker, "Guide");
  assert.equal(text.payload.speakerPresentation, "inline-prefix");
  assert.equal(text.payload.text, "Synthetic line");
  assert.equal(text.payload.resourceId, "0001");
  assert.equal(text.payload.resourceSource.file, "SCENE0001.utf");
  assert.equal(text.payload.requiresTextLayoutVerification, true);
  assert.equal(text.payload.usesTextWindow, true);
  assert.equal(text.payload.advanceMode, "kanon.pause");

  const bgm = scenario.commands[2];
  assert.equal(bgm.payload.asset.logicalId, "kanon.bgm.BGM01");
  assert.equal(bgm.payload.loop, true);
  assert.deepEqual(bgm.source.rawArguments, [{ type: "string", value: "BGM01", raw: "'BGM01'" }]);

  const background = scenario.commands[4];
  assert.equal(background.payload.asset.logicalId, "kanon.background.FGNY02A");
  assert.equal(background.payload.effectCode, 0);
  assert.equal(background.payload.transitionMethod, "crossfade");
  assert.equal(background.payload.durationMs, 500);
  assert.equal(background.payload.verifiedBehavior, true);

  const messageHide = scenario.commands[3];
  assert.equal(messageHide.payload.transitionMethod, "crossfade");
  assert.equal(messageHide.payload.durationMs, 200);
  assert.equal(messageHide.payload.target, "message0");

  const pause = scenario.commands[6];
  assert.equal(pause.payload.mode, "txtwindow");
  assert.equal(pause.payload.clearTextAfterClick, true);

  const fadeOut = scenario.commands[7];
  assert.equal(fadeOut.payload.rawDuration, 1200);
  assert.equal(fadeOut.payload.durationUnit, "ms");
  assert.equal(fadeOut.payload.durationUnitVerified, true);
  assert.equal(fadeOut.payload.stopsAfterFade, true);

  const wait = scenario.commands[8];
  assert.equal(wait.payload.durationMs, 250);
  assert.equal(wait.payload.skippable, false);
  assert.equal(wait.payload.durationUnitVerified, true);

  const expectedOffset = Buffer.byteLength(input.disassembly.slice(0, input.disassembly.indexOf("bgmLoop")), "utf8");
  assert.equal(bgm.source.offset, expectedOffset);
  assert.equal(bgm.source.opcode, "bgmLoop");
  assert.equal(bgm.source.provenance, "kprl-disassembly");
  assert.equal(bgm.source.line, 9);
});

test("Kprl decoder retains unresolved speaker macros and unknown mnemonics", () => {
  const disassembly = [
    "#file 'SCENE0002.TXT'",
    "#resource 'SCENE0002.utf'",
    "#entrypoint 000 // S00",
    "#res<0001>",
    "grpOpenBg('UNVERIFIED', 99)",
    "unseenCommand(3)"
  ].join("\n");
  const resources = "<0001> \\{\\m{A}}Synthetic macro line\n";
  const scenario = new KanonParser().parse(
    new KprlDisassemblyDecoder().decode(
      { disassembly, resources },
      { sourceFile: "SCENE0002.org", resourceFile: "SCENE0002.utf" }
    )
  );

  assert.equal(scenario.commands[1].payload.speaker, undefined);
  assert.equal(scenario.commands[1].payload.speakerExpression, "\\m{A}");
  assert.equal(scenario.commands[2].kind, "unknown");
  assert.equal(scenario.commands[2].payload.proposedKind, "kanon.kprl.grpOpenBg");
  assert.equal(scenario.commands[2].payload.decodedPayload.effectCode, 99);
  assert.equal(scenario.commands[3].kind, "unknown");
  assert.equal(scenario.commands[3].payload.proposedKind, "kanon.kprl.unseenCommand");
  assert.deepEqual(scenario.commands[3].source.rawArguments, [{ type: "integer", value: 3, raw: "3" }]);
});

test("Kprl decoder preserves the verified SIRO effect and opening call", () => {
  const disassembly = [
    "#file 'SCENE0050.TXT'",
    "#resource 'SCENE0050.utf'",
    "#entrypoint 000 // S00",
    "grpOpenBg('SIRO', 26)",
    "wait(2000)",
    "farcall(8502)"
  ].join("\n");
  const scenario = new KanonParser().parse(
    new KprlDisassemblyDecoder().decode(
      { disassembly, resources: "// no text resources\n" },
      { sourceFile: "SCENE0050.org", resourceFile: "SCENE0050.utf" }
    )
  );
  const background = scenario.commands[1];
  assert.equal(background.kind, "kanon.background.open");
  assert.equal(background.payload.asset.originalId, "SIRO");
  assert.equal(background.payload.effectCode, 26);
  assert.equal(background.payload.transitionMethod, "crossfade");
  assert.equal(background.payload.durationMs, 2000);
  assert.equal(background.payload.targetAppearance, "white");
  assert.equal(scenario.commands[2].kind, "wait");
  assert.equal(scenario.commands[2].payload.durationMs, 2000);
  assert.equal(scenario.commands[3].kind, "kanon.opening.start");
  assert.equal(scenario.commands[3].payload.callTarget, 8502);
});

test("Kprl decoder fails when a referenced resource is absent", () => {
  const disassembly = [
    "#file 'SCENE0003.TXT'",
    "#resource 'SCENE0003.utf'",
    "#entrypoint 000 // S00",
    "#res<9999>"
  ].join("\n");

  assert.throws(
    () =>
      new KprlDisassemblyDecoder().decode(
        { disassembly, resources: "<0001> Synthetic line\n" },
        { sourceFile: "SCENE0003.org", resourceFile: "SCENE0003.utf" }
      ),
    /resource 9999.*is missing/
  );
});
