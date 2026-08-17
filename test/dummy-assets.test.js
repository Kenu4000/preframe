import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeDummyAssets } from "../src/runtime/dummy-assets.js";

test("dummy background matches the KAG3 default 640x480 base layer", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "preframe-dummy-assets-"));
  try {
    await writeDummyAssets(outputRoot);
    const png = await readFile(path.join(outputRoot, "assets/background/dummy-room.png"));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 640);
    assert.equal(png.readUInt32BE(20), 480);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
