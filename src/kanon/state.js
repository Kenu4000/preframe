import { KanonModelError } from "./model.js";

export function createInitialKanonState(scenarioId) {
  return {
    scenario: { id: scenarioId, commandIndex: -1, label: null, nextLabel: null, nextId: null, ended: false },
    variables: {},
    flags: {},
    visual: { background: null, sprites: {} },
    audio: { bgm: null, se: {}, voice: {} },
    transition: { last: null },
    timing: { lastWaitMs: 0, elapsedRequestedMs: 0 },
    ui: { messageVisible: true, lastMessage: null, awaitingChoice: false, choices: [] },
    flow: { phase: "scenario", openingCallTarget: null }
  };
}

export class KanonStateMachine {
  constructor(scenarioId) {
    this.state = createInitialKanonState(scenarioId);
  }

  apply(command, commandIndex) {
    if (!Number.isSafeInteger(commandIndex) || commandIndex < 0) {
      throw new KanonModelError("commandIndex must be a non-negative integer");
    }
    const state = this.state;
    state.scenario.commandIndex = commandIndex;

    switch (command.kind) {
      case "label":
        state.scenario.label = command.payload.name;
        state.scenario.nextLabel = null;
        break;
      case "text":
        state.ui.lastMessage = {
          speaker: command.payload.speaker ?? null,
          text: command.payload.text,
          pageBreak: Boolean(command.payload.pageBreak)
        };
        state.ui.messageVisible = true;
        state.ui.awaitingChoice = false;
        state.ui.choices = [];
        break;
      case "background.show":
        state.visual.background = structuredClone(command.payload.asset);
        break;
      case "sprite.show":
        state.visual.sprites[command.payload.slot] = {
          asset: structuredClone(command.payload.asset),
          position: command.payload.position ?? null,
          x: command.payload.x ?? null,
          y: command.payload.y ?? null,
          layer: command.payload.layer,
          opacity: command.payload.opacity ?? 255,
          visible: true
        };
        break;
      case "sprite.hide":
        if (state.visual.sprites[command.payload.slot]) {
          state.visual.sprites[command.payload.slot].visible = false;
        }
        break;
      case "bgm.play":
        state.audio.bgm = {
          asset: structuredClone(command.payload.asset),
          loop: command.payload.loop !== false,
          status: "playing",
          stopTrigger: command.payload.stopTrigger ?? null,
          fadeOut: null
        };
        break;
      case "bgm.stop":
        state.audio.bgm = null;
        break;
      case "se.play":
        state.audio.se[String(command.payload.channel ?? 0)] = {
          asset: structuredClone(command.payload.asset),
          loop: Boolean(command.payload.loop)
        };
        break;
      case "se.stop":
        delete state.audio.se[String(command.payload.channel ?? 0)];
        break;
      case "voice.play":
        state.audio.voice[String(command.payload.channel ?? 1)] = {
          asset: structuredClone(command.payload.asset)
        };
        break;
      case "voice.stop":
        delete state.audio.voice[String(command.payload.channel ?? 1)];
        break;
      case "wait":
        state.timing.lastWaitMs = command.payload.durationMs;
        state.timing.elapsedRequestedMs += command.payload.durationMs;
        break;
      case "transition":
        state.transition.last = {
          method: command.payload.method,
          durationMs: command.payload.durationMs,
          wait: command.payload.wait !== false
        };
        state.timing.elapsedRequestedMs += command.payload.durationMs;
        break;
      case "kanon.background.open":
        state.visual.background = structuredClone(command.payload.asset);
        state.transition.last = {
          method: command.payload.transitionMethod ?? null,
          durationMs: command.payload.durationMs ?? null,
          wait: true,
          kanonEffectCode: command.payload.effectCode,
          verifiedBehavior: Boolean(command.payload.verifiedBehavior)
        };
        if (command.payload.verifiedBehavior) {
          state.timing.elapsedRequestedMs += command.payload.durationMs;
        }
        break;
      case "kanon.bgm.fadeOut":
        if (state.audio.bgm) {
          state.audio.bgm.status = "fading-out";
          state.audio.bgm.fadeOut = {
            rawDuration: command.payload.rawDuration,
            durationUnit: command.payload.durationUnit,
            durationUnitVerified: Boolean(command.payload.durationUnitVerified),
            stopsAfterFade: command.payload.stopsAfterFade === true
          };
        }
        break;
      case "kanon.message.hide":
        state.ui.messageVisible = false;
        state.transition.last = {
          method: command.payload.transitionMethod,
          durationMs: command.payload.durationMs,
          wait: true,
          target: "message0",
          verifiedBehavior: Boolean(command.payload.verifiedBehavior)
        };
        state.timing.elapsedRequestedMs += command.payload.durationMs;
        break;
      case "kanon.message.pause":
        state.ui.lastMessage = null;
        state.ui.awaitingChoice = false;
        state.ui.choices = [];
        break;
      case "kanon.opening.start":
        state.flow.phase = "opening";
        state.flow.openingCallTarget = command.payload.callTarget;
        break;
      case "kanon.scenario.jump":
        state.scenario.nextId = command.payload.targetScenarioId;
        state.scenario.nextLabel = null;
        break;
      case "variable.set":
        state.variables[command.payload.name] = structuredClone(command.payload.value);
        break;
      case "flag.set":
        state.flags[command.payload.name] = Boolean(command.payload.value);
        break;
      case "jump":
        state.scenario.nextLabel = command.payload.target;
        break;
      case "choice":
        state.ui.awaitingChoice = true;
        state.ui.choices = structuredClone(command.payload.options);
        break;
      case "end":
        state.scenario.ended = true;
        break;
      case "unknown":
        break;
      default:
        throw new KanonModelError(`state machine does not support command kind ${command.kind}`);
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone(this.state);
  }
}

export function reduceScenarioLinearly(scenario) {
  const machine = new KanonStateMachine(scenario.id);
  scenario.commands.forEach((command, index) => machine.apply(command, index));
  return machine.snapshot();
}
