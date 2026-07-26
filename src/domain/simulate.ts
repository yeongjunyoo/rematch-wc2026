import { applyResponse, canRespond, chooseResponse, counterCoverage, observedDirectives } from "./ai";
import { advanceClock, applyGoal, applyPenaltyAttempt, stepPhase } from "./engine";
import { directiveWeights, formationEdge, ratingsFor, scoreContext, staminaFactor, teamStrength } from "./ratings";
import { decisionDraw, fingerprintIntervention, worldDraw } from "./rng";
import { FORMATION_SLOTS, fitness, slotRole } from "./tactics";
import type { FormationPreset, Intervention, MatchEvent, MatchState, PenaltyResult, ScenarioDeclaration, Side, TacticalDirectives, WorldSeed } from "./types";
import { defaultFormation, squadFor } from "../ui/squad";

const MAX_ABSOLUTE_MINUTE = 200;
const MAX_SHOOTOUT_ATTEMPTS = 100;
const AI_COOLDOWN_MINUTES = 8;

type SimulationInput = { readonly scenario: ScenarioDeclaration; readonly world: WorldSeed; readonly interventions: readonly Intervention[]; readonly startState: MatchState };
type TeamProfile = { readonly formation: FormationPreset; readonly attack: number; readonly defense: number; readonly control: number; readonly stamina: number };

export interface WorldTraceEntry { readonly namespace: string; readonly minute: number; readonly value: number }
export interface ExpectedChanceEntry { readonly side: Side; readonly minute: number; readonly expected: number }
export interface SimulationTrace { readonly state: MatchState; readonly timeline: readonly MatchEvent[]; readonly worldTrace: readonly WorldTraceEntry[]; readonly expectedChanceTrace: readonly ExpectedChanceEntry[] }

/** Runs a match from its handed-over state without introducing ambient randomness. */
export function simulateToTerminal(input: SimulationInput): { state: MatchState; timeline: readonly MatchEvent[] } {
  const result = runSimulation(input);
  return { state: result.state, timeline: result.timeline };
}

/** Exposes fixed exogenous draws and expected chance rates for verification. */
export function simulateWithTrace(input: SimulationInput): SimulationTrace { return runSimulation(input); }

function runSimulation(input: SimulationInput): SimulationTrace {
  const world = new WorldBook(input.world);
  const interventions = [...input.interventions].sort((left, right) => left.atMinute - right.atMinute || left.tokenIndex - right.tokenIndex);
  const directiveHistory: { minute: number; directives: TacticalDirectives }[] = [];
  const expectedChanceTrace: ExpectedChanceEntry[] = [];
  let interventionIndex = 0;
  let state = input.startState;

  while (state.clock.phase !== "finished") {
    if (state.clock.phase === "shootout") {
      const attempts = state.shootout?.attempts.length ?? 0;
      if (attempts >= MAX_SHOOTOUT_ATTEMPTS) throw new Error("Simulation exceeded the shootout attempt limit.");
      state = takePenalty(state, input.scenario, world, attempts + 1, interventions.slice(0, interventionIndex));
      continue;
    }
    if (state.clock.absoluteMinute >= MAX_ABSOLUTE_MINUTE) throw new Error("Simulation exceeded the absolute minute limit.");

    while (interventionIndex < interventions.length && interventions[interventionIndex]!.atMinute <= state.clock.absoluteMinute) {
      const intervention = interventions[interventionIndex]!;
      state = applyIntervention(state, intervention);
      directiveHistory.push({ minute: state.clock.absoluteMinute, directives: intervention.directives });
      interventionIndex += 1;
    }
    state = respondToObservedDirectives(state, directiveHistory, input.world);
    state = { ...state, clock: advanceClock(state.clock, input.scenario.format) };
    state = createChances(state, input.scenario, interventions.slice(0, interventionIndex), world, expectedChanceTrace);
    if (state.clock.phase !== "finished") state = stepPhase(state, input.scenario.format, input.scenario.derivedOutcomeRule).state;
  }
  if (state.terminal === null) throw new Error("Finished simulation did not produce terminal facts.");
  return { state, timeline: state.events, worldTrace: world.trace, expectedChanceTrace };
}

function applyIntervention(state: MatchState, intervention: Intervention): MatchState {
  const event: MatchEvent = { type: "intervention", side: "user", tokenIndex: intervention.tokenIndex, summary: `개입 ${intervention.tokenIndex + 1}: 전술과 대형을 조정했습니다.`, clock: state.clock };
  const substitutions: MatchEvent[] = intervention.substitutions.map((substitution) => ({ type: "substitution", side: "user", outId: substitution.outId, inId: substitution.inId, clock: state.clock }));
  return { ...state, tokensRemaining: Math.max(0, state.tokensRemaining - 1), userDirectives: intervention.directives, events: [...state.events, event, ...substitutions] };
}

function respondToObservedDirectives(state: MatchState, history: readonly { minute: number; directives: TacticalDirectives }[], world: WorldSeed): MatchState {
  const observed = observedDirectives(state.ai, history, state.clock.absoluteMinute);
  if (observed === null || sameDirectives(observed, state.ai.lastObserved) || !canRespond(state.ai, state.clock.absoluteMinute)) return state;

  const fingerprint = fingerprintIntervention({ tokenIndex: 0, atMinute: state.clock.absoluteMinute, directives: observed, formation: "4-3-3", placements: [], substitutions: [] });
  const response = chooseResponse({ ai: state.ai, observed, own: state.opponentDirectives, minute: state.clock.absoluteMinute, draw: decisionDraw(world, fingerprint, "ai-counter", state.clock.absoluteMinute) });
  if (response.kind !== "counter" || counterCoverage(observed, response, state.opponentDirectives) === 0) {
    return { ...state, ai: { ...state.ai, lastObserved: observed } };
  }
  return {
    ...state,
    opponentDirectives: response.directives,
    ai: { ...applyResponse(state.ai, state.clock.absoluteMinute, AI_COOLDOWN_MINUTES), lastObserved: observed },
    events: [...state.events, { type: "aiCounter", side: "opponent", counteredWhat: response.counteredWhat, exposedWeakness: response.exposedWeakness, clock: state.clock }],
  };
}

function createChances(state: MatchState, scenario: ScenarioDeclaration, applied: readonly Intervention[], world: WorldBook, trace: ExpectedChanceEntry[]): MatchState {
  const minute = state.clock.absoluteMinute;
  const user = userProfile(scenario, applied[applied.length - 1]);
  const opponent = opponentProfile(scenario);
  let next = state;
  for (const side of ["user", "opponent"] as const) {
    const chanceDraw = world.draw(`chance:${side}`, minute);
    const conversionDraw = world.draw(`conversion:${side}`, minute);
    const expected = chanceExpectation(side, next, scenario, user, opponent);
    trace.push({ side, minute, expected });
    if (chanceDraw >= expected) continue;
    const converted = conversionThreshold(side, next, user, opponent) > conversionDraw;
    next = { ...next, events: [...next.events, { type: "chance", side, shooterId: `${side}-attack-${minute}`, quality: Math.round(expected * 100) / 100, converted, clock: next.clock }] };
    if (converted) next = applyGoal(next, scenario.format, { side, scorerId: `${side}-attack-${minute}`, kind: "openPlay" }, scenario.derivedOutcomeRule);
  }
  return next;
}

function chanceExpectation(side: Side, state: MatchState, scenario: ScenarioDeclaration, user: TeamProfile, opponent: TeamProfile): number {
  const own = side === "user" ? user : opponent;
  const theirs = side === "user" ? opponent : user;
  const directives = directiveWeights(side === "user" ? state.userDirectives : state.opponentDirectives);
  const opposing = directiveWeights(side === "user" ? state.opponentDirectives : state.userDirectives);
  const edge = formationEdge(own.formation, theirs.formation);
  const score = scoreContext(state.userGoals, state.opponentGoals, state.clock.absoluteMinute, scenario.format.regulationMinutes);
  const aggression = side === "user" ? score.userAggression : score.opponentAggression;
  const strength = 0.72 + (own.attack + own.control) / Math.max(1, theirs.defense + theirs.control) * 0.28;
  const fatigue = staminaFactor(state.clock.absoluteMinute, own.stamina, directives.staminaDrain);
  return clampProbability(0.115 * strength * directives.userChance * opposing.concede * aggression * (1 + edge.attack) * fatigue, 0.015, 0.32);
}

function conversionThreshold(side: Side, state: MatchState, user: TeamProfile, opponent: TeamProfile): number {
  const own = side === "user" ? user : opponent;
  const theirs = side === "user" ? opponent : user;
  const directives = directiveWeights(side === "user" ? state.userDirectives : state.opponentDirectives);
  const opposing = directiveWeights(side === "user" ? state.opponentDirectives : state.userDirectives);
  const edge = formationEdge(own.formation, theirs.formation);
  const strength = own.attack / Math.max(1, theirs.defense);
  return clampProbability(0.13 * strength * directives.conversion * opposing.concede * (1 + edge.attack) * staminaFactor(state.clock.absoluteMinute, own.stamina, directives.staminaDrain), 0.025, 0.42);
}

function userProfile(scenario: ScenarioDeclaration, intervention: Intervention | undefined): TeamProfile {
  const formation = intervention?.formation ?? defaultFormation(scenario.id);
  const placements = intervention?.placements ?? squadFor(scenario.id).starters.map((player, index) => ({ playerId: player.id, slot: FORMATION_SLOTS[formation][index]! }));
  const players = [...squadFor(scenario.id).starters, ...squadFor(scenario.id).bench];
  const byId = new Map(players.map((player) => [player.id, player]));
  const rated = placements.map((placement) => {
    const player = byId.get(placement.playerId);
    const position = player?.position ?? slotRole(placement.slot);
    return { ratings: ratingsFor(scenario.id, placement.playerId, position), fit: fitness(position, placement.slot) };
  });
  const strength = teamStrength(rated);
  return { formation, ...strength, stamina: average(rated.map((player) => player.ratings.stamina)) };
}

function opponentProfile(scenario: ScenarioDeclaration): TeamProfile {
  // Authored opponent defaults keep unsourced squads deterministic without claiming real lineups.
  const formation: FormationPreset = scenario.id === "za-kor-2026" ? "4-2-3-1" : scenario.id === "kor-ita-2002" ? "5-4-1" : "4-3-3";
  const rated = FORMATION_SLOTS[formation].map((slot, index) => {
    const position = slotRole(slot);
    return { ratings: ratingsFor(scenario.id, `authored-opponent-${index + 1}`, position), fit: "primary" as const };
  });
  const strength = teamStrength(rated);
  return { formation, ...strength, stamina: average(rated.map((player) => player.ratings.stamina)) };
}

function takePenalty(state: MatchState, scenario: ScenarioDeclaration, world: WorldBook, attempt: number, applied: readonly Intervention[]): MatchState {
  const side = state.shootout?.nextSide ?? "user";
  const own = side === "user" ? userProfile(scenario, applied[applied.length - 1]) : opponentProfile(scenario);
  const theirs = side === "user" ? opponentProfile(scenario) : userProfile(scenario, applied[applied.length - 1]);
  const directives = directiveWeights(side === "user" ? state.userDirectives : state.opponentDirectives);
  const strength = own.attack / Math.max(1, theirs.defense);
  const tacticalComposure = 1 + (directives.conversion - 1) * 0.12;
  const threshold = clampProbability(0.72 * (0.88 + strength * 0.12) * tacticalComposure, 0.6, 0.84);
  const draw = world.draw(`penalty:${side}`, attempt);
  const result: PenaltyResult = draw < threshold ? "scored" : draw < threshold + (1 - threshold) * 0.55 ? "saved" : "missed";
  return applyPenaltyAttempt(state, scenario.format, { side, takerId: `${side}-penalty-${attempt}`, result }, scenario.derivedOutcomeRule);
}

function sameDirectives(left: TacticalDirectives, right: TacticalDirectives | null): boolean {
  return right !== null && left.defensiveLine === right.defensiveLine && left.pressing === right.pressing && left.tempo === right.tempo && left.attackRoute === right.attackRoute && left.mindset === right.mindset;
}
function average(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length); }
function clampProbability(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }

class WorldBook {
  readonly trace: readonly WorldTraceEntry[];
  private readonly draws: ReadonlyMap<string, number>;
  constructor(world: WorldSeed) {
    const entries: WorldTraceEntry[] = [];
    for (let minute = 0; minute <= MAX_ABSOLUTE_MINUTE; minute += 1) for (const namespace of ["chance:user", "conversion:user", "chance:opponent", "conversion:opponent"]) entries.push({ namespace, minute, value: worldDraw(world, namespace, minute) });
    for (let attempt = 1; attempt <= MAX_SHOOTOUT_ATTEMPTS; attempt += 1) for (const side of ["user", "opponent"] as const) entries.push({ namespace: `penalty:${side}`, minute: attempt, value: worldDraw(world, `penalty:${side}`, attempt) });
    this.trace = entries;
    this.draws = new Map(entries.map((entry) => [`${entry.namespace}:${entry.minute}`, entry.value]));
  }
  draw(namespace: string, minute: number): number { const value = this.draws.get(`${namespace}:${minute}`); if (value === undefined) throw new Error(`Missing world draw for ${namespace} at ${minute}.`); return value; }
}
