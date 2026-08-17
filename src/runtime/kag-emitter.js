import { KanonModelError } from "../kanon/model.js";
import { commandTraceSummary } from "../kanon/trace.js";

const visualKinds = new Set(["background.show", "sprite.show", "sprite.hide"]);
const supportedTransitionMethods = new Set(["crossfade", "universal", "scroll"]);
const supportedPositions = new Set(["left", "left_center", "center", "right_center", "right"]);
const kanonTextWindow = Object.freeze({
  left: 6,
  top: 352,
  width: 628,
  height: 64,
  color: "0x00084c",
  opacity: 190,
  marginLeft: 12,
  marginTop: 8,
  marginRight: 12,
  marginBottom: 8,
  fontFace: "ＭＳ ゴシック,MS Gothic",
  fontSize: 16,
  fontColor: "0xffffff",
  shadowColor: "0x000000"
});

export class UnsupportedKanonCommandError extends Error {
  constructor(command, message = `KAG emitter cannot reproduce command kind: ${command.kind}`) {
    super(message);
    this.name = "UnsupportedKanonCommandError";
    this.command = command;
  }
}

function safeLabel(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) {
    throw new KanonModelError(`label cannot be represented safely in KAG: ${value}`);
  }
  return value;
}

function safeVariableName(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new KanonModelError(`variable name cannot be represented safely in KAG: ${value}`);
  }
  return value;
}

function tjsLiteral(value) {
  if (typeof value === "string") {
    return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\r", "\\r").replaceAll("\n", "\\n")}'`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new KanonModelError(`value cannot be represented as a TJS literal: ${typeof value}`);
}

function escapeKagText(value) {
  return String(value)
    .replaceAll("[", "[[")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\n", "[r]");
}

function runtimeTraceText(command, index) {
  const summary = commandTraceSummary(command, { includeText: false })
    .replaceAll('"', "")
    .replaceAll("'", "")
    .replace(/[^\p{L}\p{N}_.:@=/ -]/gu, "?");
  return `${String(index).padStart(5, "0")} ${summary} offset=0x${command.source.offset.toString(16)} opcode=${command.source.opcode}`;
}

export class KagEmitter {
  constructor(assetCatalog, { includeRuntimeTrace = true } = {}) {
    this.assets = assetCatalog;
    this.includeRuntimeTrace = includeRuntimeTrace;
  }

  emitScenario(scenario) {
    this.#validateTargets(scenario);
    const lines = [
      "; Generated from the Kanon-specific command model.",
      `; Scene: ${scenario.id}`,
      "; Do not edit this generated file; regenerate it from the importer.",
      ""
    ];

    const highestLayer = scenario.commands.reduce((maximum, command) => {
      if (command.kind === "sprite.show" || command.kind === "sprite.hide") {
        return Math.max(maximum, command.payload.layer);
      }
      return maximum;
    }, 0);
    lines.push(`@laycount layers=${highestLayer + 1}`);

    for (let index = 0; index < scenario.commands.length; index += 1) {
      const command = scenario.commands[index];

      if (command.kind === "kanon.background.open") {
        this.#emitRuntimeTrace(lines, command, index);
        lines.push(...this.#emitKanonBackgroundOpen(command));
        continue;
      }

      if (visualKinds.has(command.kind)) {
        let end = index;
        while (end + 1 < scenario.commands.length && visualKinds.has(scenario.commands[end + 1].kind)) {
          end += 1;
        }
        const transition = scenario.commands[end + 1];
        const staged = transition?.kind === "transition";
        if (staged) {
          lines.push("@backlay");
        }
        for (let visualIndex = index; visualIndex <= end; visualIndex += 1) {
          this.#emitRuntimeTrace(lines, scenario.commands[visualIndex], visualIndex);
          lines.push(this.#emitVisual(scenario.commands[visualIndex], staged ? "back" : "fore"));
        }
        if (staged) {
          this.#emitRuntimeTrace(lines, transition, end + 1);
          lines.push(...this.#emitTransition(transition));
          index = end + 1;
        } else {
          index = end;
        }
        continue;
      }

      this.#emitRuntimeTrace(lines, command, index);
      lines.push(...this.#emitCommand(command));
    }

    return `${lines.join("\r\n")}\r\n`;
  }

  emitFirstScript(scenarioStorage) {
    if (typeof scenarioStorage !== "string" || !/^[A-Za-z0-9_./-]+\.ks$/.test(scenarioStorage)) {
      throw new KanonModelError("scenarioStorage must be a safe relative .ks path");
    }
    return [
      "; Generated demo entry point.",
      "@eval exp=\"sf.kanonTraceEnabled=false\"",
      `@call storage=\"${scenarioStorage}\"`,
      "@s",
      ""
    ].join("\r\n");
  }

  #emitRuntimeTrace(lines, command, index) {
    if (!this.includeRuntimeTrace) {
      return;
    }
    lines.push(`@trace exp=\"${tjsLiteral(runtimeTraceText(command, index))}\" cond=sf.kanonTraceEnabled`);
  }

  #emitVisual(command, page) {
    switch (command.kind) {
      case "background.show": {
        const storage = this.assets.resolve(command.payload.asset);
        return `@image storage=\"${storage}\" layer=base page=${page}`;
      }
      case "sprite.show": {
        if (!supportedPositions.has(command.payload.position)) {
          throw new UnsupportedKanonCommandError(
            command,
            `sprite position needs a Kanon-specific mapping before KAG emission: ${command.payload.position}`
          );
        }
        const storage = this.assets.resolve(command.payload.asset);
        const opacity = command.payload.opacity ?? 255;
        if (!Number.isInteger(opacity) || opacity < 0 || opacity > 255) {
          throw new KanonModelError(`sprite opacity must be an integer from 0 to 255: ${opacity}`);
        }
        return `@image storage=\"${storage}\" layer=${command.payload.layer} page=${page} pos=${command.payload.position} opacity=${opacity} visible=true`;
      }
      case "sprite.hide":
        return `@freeimage layer=${command.payload.layer} page=${page}`;
      default:
        throw new UnsupportedKanonCommandError(command);
    }
  }

  #emitTransition(command) {
    const { method, durationMs } = command.payload;
    if (!supportedTransitionMethods.has(method)) {
      throw new UnsupportedKanonCommandError(command, `unsupported transition method: ${method}`);
    }
    const attributes = [`method=${method}`, `time=${Math.round(durationMs)}`, "layer=base", "children=true"];
    if (method === "universal") {
      if (typeof command.payload.rule !== "string" || command.payload.rule.length === 0) {
        throw new UnsupportedKanonCommandError(command, "universal transition requires a verified KAG rule storage");
      }
      attributes.push(`rule=\"${command.payload.rule}\"`);
      if (command.payload.vague !== undefined) {
        attributes.push(`vague=${Math.round(command.payload.vague)}`);
      }
    }
    if (method === "scroll") {
      const allowed = new Set(["left", "top", "right", "bottom"]);
      if (!allowed.has(command.payload.from)) {
        throw new UnsupportedKanonCommandError(command, "scroll transition requires from=left|top|right|bottom");
      }
      attributes.push(`from=${command.payload.from}`);
    }
    return [`@trans ${attributes.join(" ")}`, ...(command.payload.wait === false ? [] : ["@wt"] )];
  }

  #emitKanonBackgroundOpen(command) {
    const payload = command.payload;
    if (
      !payload.verifiedBehavior ||
      payload.transitionMethod !== "crossfade" ||
      !Number.isFinite(payload.durationMs) ||
      payload.durationMs < 0
    ) {
      throw new UnsupportedKanonCommandError(
        command,
        `unverified grpOpenBg behavior: asset=${payload.asset.originalId} effect=${payload.effectCode}`
      );
    }

    const storage = this.assets.resolve(payload.asset);
    return [
      "@backlay layer=base",
      `@image storage=\"${storage}\" layer=base page=back`,
      `@trans method=crossfade time=${payload.durationMs} layer=base children=false`,
      "@wt"
    ];
  }

  #emitKanonTextWindowSetup() {
    const profile = kanonTextWindow;
    return [
      "@current layer=message0 page=fore",
      `@position layer=message0 page=fore left=${profile.left} top=${profile.top} width=${profile.width} height=${profile.height} frame="" color=${profile.color} opacity=${profile.opacity} marginl=${profile.marginLeft} margint=${profile.marginTop} marginr=${profile.marginRight} marginb=${profile.marginBottom} vertical=false draggable=false visible=true`,
      `@font face="${profile.fontFace}" size=${profile.fontSize} color=${profile.fontColor} shadow=true shadowcolor=${profile.shadowColor} bold=false`
    ];
  }

  #emitCommand(command) {
    const payload = command.payload;
    switch (command.kind) {
      case "label":
        return [`*${safeLabel(payload.name)}`];
      case "text": {
        if (payload.requiresTextLayoutVerification || payload.speakerExpression) {
          throw new UnsupportedKanonCommandError(
            command,
            "Kprl text layout or speaker expression must be verified before KAG emission"
          );
        }
        const speaker = payload.speaker
          ? payload.speakerPresentation === "inline-prefix"
            ? escapeKagText(payload.speaker)
            : `【${escapeKagText(payload.speaker)}】[r]`
          : "";
        const waitTag = payload.advanceMode === "kanon.pause" ? "" : payload.pageBreak === false ? "[l]" : "[p]";
        return [
          ...(payload.usesTextWindow ? this.#emitKanonTextWindowSetup() : []),
          `[current layer=message0 page=fore]${speaker}${escapeKagText(payload.text)}${waitTag}`
        ];
      }
      case "bgm.play":
        return [`@playbgm storage=\"${this.assets.resolve(payload.asset)}\" loop=${payload.loop !== false}`];
      case "bgm.stop":
        return ["@stopbgm"];
      case "se.play":
        return [
          `@playse storage=\"${this.assets.resolve(payload.asset)}\" buf=${payload.channel ?? 0} loop=${Boolean(payload.loop)}`
        ];
      case "se.stop":
        return [`@stopse buf=${payload.channel ?? 0}`];
      case "voice.play":
        return [`@playse storage=\"${this.assets.resolve(payload.asset)}\" buf=${payload.channel ?? 1} loop=false`];
      case "voice.stop":
        return [`@stopse buf=${payload.channel ?? 1}`];
      case "wait":
        return [`@wait time=${Math.round(payload.durationMs)} canskip=${Boolean(payload.skippable)}`];
      case "transition":
        return this.#emitTransition(command);
      case "kanon.bgm.fadeOut":
        if (payload.durationUnit !== "ms" || payload.durationUnitVerified !== true) {
          throw new UnsupportedKanonCommandError(command, "bgmFadeOut duration unit is not verified");
        }
        return [`@fadeoutbgm time=${payload.rawDuration}`];
      case "kanon.message.hide":
        if (
          payload.verifiedBehavior !== true ||
          payload.transitionMethod !== "crossfade" ||
          payload.durationMs !== 200 ||
          payload.target !== "message0"
        ) {
          throw new UnsupportedKanonCommandError(command, "unverified msgHide behavior");
        }
        return [
          "@backlay layer=message0",
          "@layopt layer=message0 page=back opacity=0",
          "@trans method=crossfade time=200 layer=message0",
          "@wt",
          "@layopt layer=message0 page=fore visible=false opacity=255",
          "@layopt layer=message0 page=back visible=false opacity=255"
        ];
      case "kanon.message.pause":
        if (payload.mode !== "txtwindow" || payload.clearTextAfterClick !== true) {
          throw new UnsupportedKanonCommandError(command, "unverified Kanon pause behavior");
        }
        return ["[p][cm]"];
      case "kanon.opening.start":
        throw new UnsupportedKanonCommandError(
          command,
          `opening playback for farcall(${payload.callTarget}) is not implemented`
        );
      case "kanon.scenario.jump":
        return [`@jump storage="scenario/${safeLabel(payload.targetScenarioId)}.ks"`];
      case "variable.set":
        return [`@eval exp=\"f.kanon_var_${safeVariableName(payload.name)}=${tjsLiteral(payload.value)}\"`];
      case "flag.set":
        return [`@eval exp=\"f.kanon_flag_${safeVariableName(payload.name)}=${tjsLiteral(Boolean(payload.value))}\"`];
      case "jump":
        return [`@jump target=*${safeLabel(payload.target)}`];
      case "choice": {
        const result = ["@cm"];
        for (const option of payload.options) {
          result.push(`[link target=*${safeLabel(option.target)}]${escapeKagText(option.text)}[endlink][r]`);
        }
        result.push("@s");
        return result;
      }
      case "end":
        return ["@s"];
      case "unknown":
        throw new UnsupportedKanonCommandError(command);
      default:
        throw new UnsupportedKanonCommandError(command);
    }
  }

  #validateTargets(scenario) {
    for (const command of scenario.commands) {
      if (command.kind === "jump" && !scenario.labels.has(command.payload.target)) {
        throw new KanonModelError(`jump target does not exist: ${command.payload.target}`);
      }
      if (command.kind === "choice") {
        for (const option of command.payload.options) {
          if (!scenario.labels.has(option.target)) {
            throw new KanonModelError(`choice target does not exist: ${option.target}`);
          }
        }
      }
    }
  }
}
