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
      return `SPRITE_SHOW ${payload.asset.logicalId} slot=${payload.slot} ${
        payload.position === undefined ? `x=${payload.x} y=${payload.y}` : `pos=${payload.position}`
      } layer=${payload.layer}`;
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
    case "kanon.background.open":
      return `KANON_GRP_OPEN_BG ${payload.asset.logicalId} effect=${payload.effectCode} verified=${Boolean(payload.verifiedBehavior)}`;
    case "kanon.bgm.fadeOut":
      return `KANON_BGM_FADE_OUT rawDuration=${payload.rawDuration} unit=${payload.durationUnit} verified=${Boolean(payload.durationUnitVerified)}`;
    case "kanon.message.hide":
      return `KANON_MSG_HIDE ${payload.durationMs}ms method=${payload.transitionMethod}`;
    case "kanon.message.pause":
      return "KANON_PAUSE clear=true";
    case "kanon.opening.start":
      return `KANON_OPENING_START target=${payload.callTarget}`;
    case "kanon.scenario.jump":
      return `KANON_SCENARIO_JUMP number=${payload.targetSceneNumber} target=${payload.targetScenarioId}`;
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
