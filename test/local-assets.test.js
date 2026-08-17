import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateLocalAssets } from "../src/kanon/local-assets.js";

function bmpFixture() {
  const buffer = Buffer.alloc(54);
  buffer.write("BM", 0, "ascii");
  return buffer;
}

function wavFixture() {
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36, 4);
  buffer.write("WAVE", 8, "ascii");
  return buffer;
}

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "preframe-assets-"));
  const voiceDirectories = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B"].map(
    (id) => `voice/${id}`
  );
  await Promise.all(
    ["scenario", "images", "bgm", "se", ...voiceDirectories].map((directory) =>
      mkdir(path.join(root, directory), { recursive: true })
    )
  );
  await Promise.all([
    writeFile(path.join(root, "scenario/sample.org"), "synthetic"),
    writeFile(path.join(root, "images/BG000.BMP"), bmpFixture()),
    writeFile(path.join(root, "bgm/BGM000.WAV"), wavFixture()),
    writeFile(path.join(root, "se/SE000.wav"), wavFixture()),
    writeFile(path.join(root, "voice/0/V000.wav"), wavFixture())
  ]);
  return root;
}

test("local asset validation accepts the Kanon private layout", async (t) => {
  const root = await createFixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await validateLocalAssets(root);
  assert.equal(result.ok, true);
  assert.deepEqual(
    Object.fromEntries(result.assets.map((asset) => [asset.key, asset.count])),
    { images: 1, bgm: 1, se: 1, voice: 1 }
  );
  assert.equal(result.assets.find((asset) => asset.key === "voice").manualInstructionsRequired, true);
  assert.equal(result.assets.find((asset) => asset.key === "voice").childDirectoryCount, 12);
});

test("local asset validation rejects a WAV extension with a non-WAV header", async (t) => {
  const root = await createFixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "se/SE000.wav"), "not a wave");
  const result = await validateLocalAssets(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /invalid WAV header: se[\\/]SE000\.wav/);
});

test("local asset validation rejects a BGM WAV with a non-WAV header", async (t) => {
  const root = await createFixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "bgm/BGM000.WAV"), "not a wave");
  const result = await validateLocalAssets(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /invalid WAV header: bgm[\\/]BGM000\.WAV/);
});

test("local asset validation requires Voice character directories 0 through B", async (t) => {
  const root = await createFixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await rm(path.join(root, "voice/B"), { recursive: true, force: true });
  const result = await validateLocalAssets(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing voice character directory: voice\/B/);
});
