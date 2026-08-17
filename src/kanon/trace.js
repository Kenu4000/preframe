function traceValue(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

export function commandTraceSummary(command, { includeText = false } = {}) {
  const payload = command.payload;
  switch (command.kind) {
    case "label":
      return `LABEL ${payload.name}`;
    case "text":
      return includeText
        ? `TEXT speaker=${traceValue(payload.speaker ?? null)} text=${traceValue(payload.text)}`
        : `TEXT speaker=${traceValue(payload.speaker ?? null)} length=${[...payload.text].length}`;
    case "background.show":
      return `BACKGROUND ${payload.asset.logicalId}`;
    case "sprite.show":
      return `SPRITE_SHOW ${payload.asset.logicalId} slot=${payload.slot} pos=${payload.position} layer=${payload.layer}`;
    case "sprite.hide":
      return `SPRITE_HIDE slot=${payload.slot} layer=${payload.layer}`;
    case "bgm.play":
      return `BGM_PLAY ${payload.asset.logicalId} loop=${payload.loop !== false}`;
    case "bgm.stop":
      return "BGM_STOP";
    case "se.play":
      return `SE_PLAY ${payload.asset.logicalId} channel=${payload.channel ?? 0}`;
    case "se.stop":
      return `SE_STOP channel=${payload.channel ?? 0}`;
    case "voice.play":
      return `VOICE_PLAY ${payload.asset.logicalId} channel=${payload.channel ?? 1}`;
    case "voice.stop":
      return `VOICE_STOP channel=${payload.channel ?? 1}`;
    case "flag.set":
      return `FLAG_SET ${payload.name}=${traceValue(Boolean(payload.value))}`;
    case "variable.set":
      return `VARIABLE_SET ${payload.name}=${traceValue(payload.value)}`;
    case "wait":
      return `WAIT ${payload.durationMs}ms skippable=${Boolean(payload.skippable)}`;
    case "transition":
      return `TRANSITION ${payload.method} ${payload.durationMs}ms wait=${payload.wait !== false}`;
    case "jump":
      return `JUMP ${payload.target}`;
    case "choice":
      return `CHOICE count=${payload.options.length}`;
    case "end":
      return "END";
    case "unknown":
      return `UNKNOWN proposed=${traceValue(payload.proposedKind ?? null)}`;
    default:
      return command.kind.toUpperCase();
  }
}

export function renderScenarioTrace(scenario, options = {}) {
  const lines = [`SCENE ${scenario.id}`];
  scenario.commands.forEach((command, index) => {
    const source = command.source;
    const location = `${source.file}:0x${source.offset.toString(16).padStart(8, "0")}`;
    lines.push(
      `${String(index).padStart(5, "0")} ${commandTraceSummary(command, options)} @ ${location} opcode=${source.opcode}`
    );
  });
  return `${lines.join("\n")}\n`;
}

