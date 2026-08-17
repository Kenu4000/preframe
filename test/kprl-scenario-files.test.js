import test from "node:test";
import assert from "node:assert/strict";
import { groupKprlScenarioFileNames } from "../src/kanon/kprl-scenario-files.js";

test("Kprl scenario discovery accepts control-only .org files", () => {
  const grouped = groupKprlScenarioFileNames([
    "SEEN8501.org",
    "SEEN0050.utf",
    "SEEN0050.org",
    "notes.txt"
  ]);

  assert.deepEqual(grouped.scenarios, [
    { stem: "SEEN0050", org: "SEEN0050.org", utf: "SEEN0050.utf" },
    { stem: "SEEN8501", org: "SEEN8501.org" }
  ]);
  assert.deepEqual(grouped.resourceOnly, []);
});

test("Kprl scenario discovery reports .utf files without control data", () => {
  const grouped = groupKprlScenarioFileNames(["SEEN0050.org", "SEEN9900.utf"]);

  assert.deepEqual(grouped.scenarios, [{ stem: "SEEN0050", org: "SEEN0050.org" }]);
  assert.deepEqual(grouped.resourceOnly, [{ stem: "SEEN9900", utf: "SEEN9900.utf" }]);
});
