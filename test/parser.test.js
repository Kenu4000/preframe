import test from "node:test";
import assert from "node:assert/strict";
import { JsonDecodedRecordDecoder } from "../src/kanon/decoder.js";
import { KanonParser } from "../src/kanon/parser.js";

test("parser preserves source metadata and raw arguments", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "CONTROL.BIN",
    scenario: { id: "source-test", entryLabel: "start" },
    records: [
      {
        offset: 16,
        opcode: 1,
        rawArguments: [{ type: "u16", value: 42 }],
        decodedKind: "label",
        payload: { name: "start" }
      }
    ]
  });
  const scenario = new KanonParser().parse(decoded);
  assert.equal(scenario.commands[0].source.file, "CONTROL.BIN");
  assert.equal(scenario.commands[0].source.offset, 16);
  assert.equal(scenario.commands[0].source.opcode, 1);
  assert.deepEqual(scenario.commands[0].source.rawArguments, [{ type: "u16", value: 42 }]);
});

test("unknown opcode meaning is retained instead of discarded", () => {
  const decoded = new JsonDecodedRecordDecoder().decode({
    schemaVersion: 1,
    sourceFile: "CONTROL.BIN",
    scenario: { id: "unknown-test", entryLabel: "start" },
    records: [
      { offset: 0, opcode: 1, rawArguments: [], decodedKind: "label", payload: { name: "start" } },
      {
        offset: 8,
        opcode: 65535,
        rawArguments: [{ type: "bytes", value: "01ff" }],
        decodedKind: "possibly.magic",
        payload: { observation: "screen changed" }
      }
    ]
  });
  const scenario = new KanonParser().parse(decoded);
  assert.equal(scenario.commands[1].kind, "unknown");
  assert.equal(scenario.commands[1].payload.proposedKind, "possibly.magic");
  assert.deepEqual(scenario.commands[1].source.rawArguments, [{ type: "bytes", value: "01ff" }]);
});

