import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPng(width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const offset = row + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createWave({ durationMs, frequency, volume = 0.08, sampleRate = 22050 }) {
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const fade = Math.min(1, sample / 100, (sampleCount - sample) / 100);
    const value = Math.sin((sample / sampleRate) * frequency * Math.PI * 2) * volume * fade;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + sample * 2);
  }
  return buffer;
}

export async function writeDummyAssets(outputRoot) {
  const paths = {
    background: path.join(outputRoot, "assets/background/dummy-room.png"),
    sprite: path.join(outputRoot, "assets/sprite/dummy-character.png"),
    bgm: path.join(outputRoot, "assets/bgm/dummy-bgm.wav"),
    se: path.join(outputRoot, "assets/se/dummy-se.wav"),
    voice: path.join(outputRoot, "assets/voice/dummy-voice.wav")
  };
  await Promise.all(Object.values(paths).map((file) => mkdir(path.dirname(file), { recursive: true })));

  const background = createPng(640, 480, (x, y) => {
    const shade = Math.round(35 + (y / 480) * 45);
    const grid = x % 80 < 2 || y % 80 < 2 ? 30 : 0;
    return [shade + grid, 70 + grid, 105 + grid, 255];
  });
  const sprite = createPng(240, 480, (x, y) => {
    const cx = x - 120;
    const head = cx * cx + (y - 100) * (y - 100) < 72 * 72;
    const body = y >= 155 && Math.abs(cx) < 90 - (y - 155) * 0.08;
    if (!head && !body) return [0, 0, 0, 0];
    return head ? [245, 208, 185, 255] : [180, 80, 130, 255];
  });

  await Promise.all([
    writeFile(paths.background, background),
    writeFile(paths.sprite, sprite),
    writeFile(paths.bgm, createWave({ durationMs: 1200, frequency: 220, volume: 0.025 })),
    writeFile(paths.se, createWave({ durationMs: 120, frequency: 660, volume: 0.08 })),
    writeFile(paths.voice, createWave({ durationMs: 320, frequency: 330, volume: 0.05 }))
  ]);
}
