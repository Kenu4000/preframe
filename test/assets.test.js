import test from "node:test";
import assert from "node:assert/strict";
import { KanonAssetCatalog } from "../src/kanon/assets.js";
import { createAssetReference } from "../src/kanon/model.js";

test("asset catalog resolves only the matching logical reference", () => {
  const catalog = new KanonAssetCatalog({
    schemaVersion: 1,
    assets: [
      { kind: "background", logicalId: "bg.school", originalId: 10, runtimeStorage: "assets/bg/school.png" }
    ]
  });
  assert.equal(
    catalog.resolve(createAssetReference({ kind: "background", logicalId: "bg.school", originalId: 10 })),
    "assets/bg/school.png"
  );
  assert.throws(
    () => catalog.resolve(createAssetReference({ kind: "background", logicalId: "bg.school", originalId: 11 })),
    /original asset id mismatch/
  );
});

test("asset catalog rejects path traversal", () => {
  assert.throws(
    () =>
      new KanonAssetCatalog({
        schemaVersion: 1,
        assets: [
          { kind: "voice", logicalId: "voice.bad", originalId: 1, runtimeStorage: "../private/voice.wav" }
        ]
      }),
    /escapes the runtime root|unsafe runtimeStorage/
  );
});

