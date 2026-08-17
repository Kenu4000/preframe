import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveLocalAssetReferences } from "../src/kanon/local-asset-resolver.js";

test("local preview asset resolver matches ids case-insensitively without guessing collisions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "preframe-preview-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(path.join(root, "images", "a"), { recursive: true }),
    mkdir(path.join(root, "images", "b"), { recursive: true }),
    mkdir(path.join(root, "bgm"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(root, "images", "a", "FGNY02A.BMP"), "synthetic-a"),
    writeFile(path.join(root, "images", "b", "FGNY02A.bmp"), "synthetic-b"),
    writeFile(path.join(root, "bgm", "BGM16.WAV"), "synthetic-bgm")
  ]);

  const references = [
    { kind: "background", logicalId: "kanon.background.a/FGNY02A", originalId: "a/fgny02a" },
    { kind: "background", logicalId: "kanon.background.FGNY02A", originalId: "FGNY02A" },
    { kind: "bgm", logicalId: "kanon.bgm.BGM16", originalId: "bgm16" }
  ];
  const result = await resolveLocalAssetReferences(root, references);

  assert.equal(result.resolved.length, 2);
  assert.equal(result.resolved[0].reference.logicalId, "kanon.background.a/FGNY02A");
  assert.equal(result.resolved[1].reference.logicalId, "kanon.bgm.BGM16");
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].reason, "ambiguous");
  assert.equal(result.unresolved[0].candidateCount, 2);
});
