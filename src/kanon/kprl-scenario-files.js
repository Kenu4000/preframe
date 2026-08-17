import path from "node:path";

export function groupKprlScenarioFileNames(fileNames) {
  const byStem = new Map();

  for (const fileName of fileNames) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension !== ".org" && extension !== ".utf") continue;

    const stem = fileName.slice(0, -extension.length);
    const key = stem.toLowerCase();
    const scenario = byStem.get(key) ?? { stem };
    scenario[extension.slice(1)] = fileName;
    byStem.set(key, scenario);
  }

  return {
    scenarios: [...byStem.values()]
      .filter((scenario) => scenario.org)
      .sort((left, right) => left.stem.localeCompare(right.stem, "en")),
    resourceOnly: [...byStem.values()]
      .filter((scenario) => !scenario.org && scenario.utf)
      .sort((left, right) => left.stem.localeCompare(right.stem, "en"))
  };
}
