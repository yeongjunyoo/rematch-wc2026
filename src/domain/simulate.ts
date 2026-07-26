import { advanceClock, applyGoal, applyPenaltyAttempt, stepPhase } from "./engine";
import { decisionDraw, fingerprintIntervention, worldDraw } from "./rng";
import type {
  Intervention,
  MatchEvent,
  MatchState,
  PenaltyResult,
  ScenarioDeclaration,
  TacticalDirectives,
  WorldSeed,
} from "./types";

const MAX_ABSOLUTE_MINUTE = 200;
const MAX_SHOOTOUT_ATTEMPTS = 100;

type SimulationInput = {
  readonly scenario: ScenarioDeclaration;
  readonly world: WorldSeed;
  readonly interventions: readonly Intervention[];
  readonly startState: MatchState;
};

export interface WorldTraceEntry {
  readonly namespace: string;
  readonly minute: number;
  readonly value: number;
}

export interface SimulationTrace {
  readonly state: MatchState;
  readonly timeline: readonly MatchEvent[];
  readonly worldTrace: readonly WorldTraceEntry[];
}

/** Runs a match from its handed-over state without introducing ambient randomness. */
export function simulateToTerminal(input: SimulationInput): { state: MatchState; timeline: readonly MatchEvent[] } {
  const result = runSimulation(input);
  return { state: result.state, timeline: result.timeline };
}

/** Exposes the fixed exogenous draw schedule for counterfactual verification. */
export function simulateWithTrace(input: SimulationInput): SimulationTrace {
  return runSimulation(input);
}

function runSimulation(input: SimulationInput): SimulationTrace {
  const world = new WorldBook(input.world);
  const interventions = [...input.interventions].sort((left, right) => left.atMinute - right.atMinute || left.tokenIndex - right.tokenIndex);
  const observed = new Set<string>();
  let interventionIndex = 0;
  let state = input.startState;

  while (state.clock.phase !== "finished") {
    if (state.clock.phase === "shootout") {
      const attempts = state.shootout?.attempts.length ?? 0;
      if (attempts >= MAX_SHOOTOUT_ATTEMPTS) {
        throw new Error("Simulation exceeded the shootout attempt limit.");
      }
      state = takePenalty(state, input.scenario, world, attempts + 1);
      continue;
    }

    if (state.clock.absoluteMinute >= MAX_ABSOLUTE_MINUTE) {
      throw new Error("Simulation exceeded the absolute minute limit.");
    }

    while (interventionIndex < interventions.length && interventions[interventionIndex]!.atMinute <= state.clock.absoluteMinute) {
      const intervention = interventions[interventionIndex]!;
      state = applyIntervention(state, intervention);
      interventionIndex += 1;
    }
    state = respondToObservedIntervention(state, interventions, observed, input.world);

    state = { ...state, clock: advanceClock(state.clock, input.scenario.format) };
    state = createChances(state, input.scenario, world);
    if (state.clock.phase !== "finished") {
      state = stepPhase(state, input.scenario.format, input.scenario.derivedOutcomeRule).state;
    }
  }

  if (state.terminal === null) {
    throw new Error("Finished simulation did not produce terminal facts.");
  }
  return { state, timeline: state.events, worldTrace: world.trace };
}

function applyIntervention(state: MatchState, intervention: Intervention): MatchState {
  const event: MatchEvent = {
    type: "intervention",
    side: "user",
    tokenIndex: intervention.tokenIndex,
    summary: `개입 ${intervention.tokenIndex + 1}: 전술과 대형을 조정했습니다.`,
    clock: state.clock,
  };
  const substitutions: MatchEvent[] = intervention.substitutions.map((substitution) => ({
    type: "substitution",
    side: "user",
    outId: substitution.outId,
    inId: substitution.inId,
    clock: state.clock,
  }));
  return {
    ...state,
    tokensRemaining: Math.max(0, state.tokensRemaining - 1),
    userDirectives: intervention.directives,
    events: [...state.events, event, ...substitutions],
  };
}

function respondToObservedIntervention(
  state: MatchState,
  interventions: readonly Intervention[],
  observed: Set<string>,
  world: WorldSeed,
): MatchState {
  const intervention = interventions.find((candidate) => {
    const fingerprint = fingerprintIntervention(candidate);
    return !observed.has(fingerprint) && candidate.atMinute + state.ai.observationLagMinutes <= state.clock.absoluteMinute;
  });
  if (intervention === undefined) return state;

  const fingerprint = fingerprintIntervention(intervention);
  observed.add(fingerprint);
  if (state.ai.responseBudget <= 0 || state.ai.cooldownUntilMinute > state.clock.absoluteMinute) return state;

  const draw = decisionDraw(world, fingerprint, "ai-counter", state.clock.absoluteMinute);
  if (draw > 0.45 + state.ai.riskTolerance * 0.1) {
    return { ...state, ai: { ...state.ai, lastObserved: intervention.directives } };
  }

  const counteredWhat = intervention.directives.mindset > 0 ? "공격적인 마인드셋" : "전술 조정";
  const exposedWeakness = intervention.directives.defensiveLine > 0 ? "뒷공간" : "측면 전환";
  return {
    ...state,
    opponentDirectives: counterDirectives(state.opponentDirectives, intervention.directives),
    ai: {
      ...state.ai,
      responseBudget: state.ai.responseBudget - 1,
      cooldownUntilMinute: state.clock.absoluteMinute + 8,
      lastObserved: intervention.directives,
    },
    events: [...state.events, {
      type: "aiCounter",
      side: "opponent",
      counteredWhat,
      exposedWeakness,
      clock: state.clock,
    }],
  };
}

function counterDirectives(current: TacticalDirectives, user: TacticalDirectives): TacticalDirectives {
  return {
    defensiveLine: clamp(current.defensiveLine - Math.sign(user.mindset)),
    pressing: clamp(current.pressing + Math.sign(user.tempo)),
    tempo: clamp(current.tempo - Math.sign(user.pressing)),
    attackRoute: clamp(current.attackRoute - Math.sign(user.attackRoute)),
    mindset: clamp(current.mindset - Math.sign(user.defensiveLine)),
  };
}

function createChances(state: MatchState, scenario: ScenarioDeclaration, world: WorldBook): MatchState {
  const minute = state.clock.absoluteMinute;
  let next = state;
  for (const side of ["user", "opponent"] as const) {
    const chanceDraw = world.draw(`chance:${side}`, minute);
    const conversionDraw = world.draw(`conversion:${side}`, minute);
    if (next.clock.phase === "finished") break;
    if (chanceDraw >= 0.14) continue;

    const directives = side === "user" ? next.userDirectives : next.opponentDirectives;
    const opposing = side === "user" ? next.opponentDirectives : next.userDirectives;
    const threshold = conversionThreshold(side, directives, opposing);
    const converted = conversionDraw < threshold;
    const chance: MatchEvent = {
      type: "chance",
      side,
      shooterId: `${side}-attack-${minute}`,
      quality: Math.round((0.2 + chanceDraw * 2) * 100) / 100,
      converted,
      clock: next.clock,
    };
    next = { ...next, events: [...next.events, chance] };
    if (converted) {
      next = applyGoal(next, scenario.format, {
        side,
        scorerId: `${side}-attack-${minute}`,
        kind: "openPlay",
      }, scenario.derivedOutcomeRule);
    }
  }
  return next;
}

function conversionThreshold(side: "user" | "opponent", directives: TacticalDirectives, opposing: TacticalDirectives): number {
  const attack =
    directives.defensiveLine * 0.012 +
    directives.pressing * 0.016 +
    directives.tempo * 0.014 +
    directives.attackRoute * 0.01 +
    directives.mindset * 0.024;
  const resistance =
    opposing.defensiveLine * 0.018 +
    opposing.pressing * 0.012 +
    opposing.tempo * 0.008 +
    opposing.attackRoute * 0.006 +
    opposing.mindset * 0.009;
  const sideBias = side === "user" ? 0.01 : 0;
  return Math.max(0.025, Math.min(0.42, 0.13 + sideBias + attack - resistance));
}

function takePenalty(state: MatchState, scenario: ScenarioDeclaration, world: WorldBook, attempt: number): MatchState {
  const side = state.shootout?.nextSide ?? "user";
  const draw = world.draw(`penalty:${side}`, attempt);
  const result: PenaltyResult = draw < 0.72 ? "scored" : draw < 0.87 ? "saved" : "missed";
  return applyPenaltyAttempt(state, scenario.format, {
    side,
    takerId: `${side}-penalty-${attempt}`,
    result,
  }, scenario.derivedOutcomeRule);
}

function clamp(value: number): number {
  return Math.max(-2, Math.min(2, value));
}

class WorldBook {
  readonly trace: readonly WorldTraceEntry[];
  private readonly draws: ReadonlyMap<string, number>;

  constructor(world: WorldSeed) {
    const entries: WorldTraceEntry[] = [];
    for (let minute = 0; minute <= MAX_ABSOLUTE_MINUTE; minute += 1) {
      for (const namespace of ["chance:user", "conversion:user", "chance:opponent", "conversion:opponent"]) {
        entries.push({ namespace, minute, value: worldDraw(world, namespace, minute) });
      }
    }
    for (let attempt = 1; attempt <= MAX_SHOOTOUT_ATTEMPTS; attempt += 1) {
      for (const side of ["user", "opponent"] as const) {
        entries.push({ namespace: `penalty:${side}`, minute: attempt, value: worldDraw(world, `penalty:${side}`, attempt) });
      }
    }
    this.trace = entries;
    this.draws = new Map(entries.map((entry) => [`${entry.namespace}:${entry.minute}`, entry.value]));
  }

  draw(namespace: string, minute: number): number {
    const value = this.draws.get(`${namespace}:${minute}`);
    if (value === undefined) throw new Error(`Missing world draw for ${namespace} at ${minute}.`);
    return value;
  }
}
