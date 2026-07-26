import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { simulateToTerminal, simulateWithTrace } from "../../src/domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration, TacticalDirectives } from "../../src/domain/types";
import { defaultFormation, initialPlacements } from "../../src/ui/squad";

function startState(scenario: ScenarioDeclaration, responseBudget = 2): MatchState {
  return {
    clock: { phase: "regulation", minute: scenario.interventionStartMinute, absoluteMinute: scenario.interventionStartMinute, shootoutRound: null },
    userGoals: scenario.startingUserGoals,
    opponentGoals: scenario.startingOpponentGoals,
    shootout: null,
    events: [],
    tokensRemaining: 3,
    userDirectives: NEUTRAL_DIRECTIVES,
    opponentDirectives: NEUTRAL_DIRECTIVES,
    ai: { responseBudget, cooldownUntilMinute: scenario.interventionStartMinute, lastObserved: null, observationLagMinutes: 0, riskTolerance: 2 },
    terminal: null,
  };
}

function intervention(scenario: ScenarioDeclaration, directives: TacticalDirectives, placements = initialPlacements(scenario.id)): Intervention {
  return { tokenIndex: 0, atMinute: scenario.interventionStartMinute, directives, formation: defaultFormation(scenario.id), placements, substitutions: [] };
}

function input(scenario: ScenarioDeclaration, directives: TacticalDirectives = NEUTRAL_DIRECTIVES, responseBudget = 2) {
  return { scenario, world: deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, "d2", "d2"), interventions: [intervention(scenario, directives)], startState: startState(scenario, responseBudget) };
}

const attacking: TacticalDirectives = { defensiveLine: 2, pressing: 2, tempo: 2, attackRoute: 2, mindset: 2 };
const cautious: TacticalDirectives = { defensiveLine: -2, pressing: -2, tempo: -2, attackRoute: -2, mindset: -2 };

describe("D3 simulation runner", () => {
  it("finishes every declared scenario with terminal facts", () => {
    for (const scenario of SCENARIOS) {
      const result = simulateToTerminal(input(scenario));
      expect(result.state.clock.phase).toBe("finished");
      expect(result.state.terminal).not.toBeNull();
    }
  });

  it("is deterministic for the same world and intervention", () => {
    const scenario = SCENARIOS[0]!;
    const first = simulateToTerminal(input(scenario, attacking));
    const second = simulateToTerminal(input(scenario, attacking));
    expect(first.state).toMatchObject({ userGoals: second.state.userGoals, opponentGoals: second.state.opponentGoals });
    expect(first.timeline).toHaveLength(second.timeline.length);
  });

  it("changes the match timeline when tactical directives change", () => {
    const scenario = SCENARIOS[0]!;
    const first = simulateToTerminal(input(scenario, attacking));
    const second = simulateToTerminal(input(scenario, cautious));
    expect({ score: [first.state.userGoals, first.state.opponentGoals], timeline: first.timeline }).not.toEqual({ score: [second.state.userGoals, second.state.opponentGoals], timeline: second.timeline });
  });

  it("keeps the complete world draw trace fixed while decision paths vary", () => {
    const scenario = SCENARIOS[0]!;
    const first = simulateWithTrace(input(scenario, attacking));
    const second = simulateWithTrace(input(scenario, cautious));
    expect(first.worldTrace).toEqual(second.worldTrace);
    expect(first.timeline).not.toEqual(second.timeline);
  });

  it("does not counter with zero AI budget and never emits an empty weakness", () => {
    const scenario = SCENARIOS[0]!;
    const withoutBudget = simulateToTerminal(input(scenario, attacking, 0));
    expect(withoutBudget.timeline.some((event) => event.type === "aiCounter")).toBe(false);
    const withBudget = simulateToTerminal(input(scenario, attacking));
    for (const event of withBudget.timeline) if (event.type === "aiCounter") expect(event.exposedWeakness).not.toBe("");
  });

  it("fails explicitly instead of diverging when the minute cap is already exhausted", () => {
    const scenario = SCENARIOS[0]!;
    expect(() => simulateToTerminal({ ...input(scenario), startState: { ...startState(scenario), clock: { phase: "regulation", minute: 200, absoluteMinute: 200, shootoutRound: null } } })).toThrow("absolute minute limit");
  });

  it("applies the South Africa advancement rule to drawn or winning terminal states", () => {
    const scenario = SCENARIOS[0]!;
    const result = simulateToTerminal(input(scenario, attacking));
    expect(result.state.terminal!.derivedOutcome?.achieved).toBe(result.state.terminal!.userResult !== "loss");
  });

  it("uses placement fitness in team chance expectations", () => {
    const scenario = SCENARIOS[0]!;
    const normal = simulateWithTrace(input(scenario, attacking));
    const placements = initialPlacements(scenario.id);
    const goalkeeper = placements[0]!;
    const forward = placements[placements.length - 1]!;
    const poorFit = placements.map((placement) => placement.playerId === goalkeeper.playerId ? { ...placement, slot: forward.slot } : placement.playerId === forward.playerId ? { ...placement, slot: goalkeeper.slot } : placement);
    const misplaced = simulateWithTrace({ ...input(scenario, attacking), interventions: [intervention(scenario, attacking, poorFit)] });
    expect(misplaced.expectedChanceTrace).not.toEqual(normal.expectedChanceTrace);
  });

  it("lowers expected chance rate as stamina drains", () => {
    const trace = simulateWithTrace(input(SCENARIOS[0]!, NEUTRAL_DIRECTIVES)).expectedChanceTrace.filter((entry) => entry.side === "user");
    expect(trace[trace.length - 1]!.expected).toBeLessThan(trace[0]!.expected);
  });

  it("records a bounded AI counter only after its observation lag", () => {
    const scenario = SCENARIOS[0]!;
    const delayed = { ...startState(scenario, 2), ai: { ...startState(scenario, 2).ai, observationLagMinutes: 2, riskTolerance: 4 } };
    const result = simulateToTerminal({ ...input(scenario, attacking), startState: delayed });
    const counter = result.timeline.find((event) => event.type === "aiCounter");
    expect(counter).toBeDefined();
    expect(counter!.clock.absoluteMinute).toBeGreaterThanOrEqual(scenario.interventionStartMinute + 2);
  });

  it("never records an AI counter when its budget is zero", () => {
    expect(simulateToTerminal(input(SCENARIOS[0]!, attacking, 0)).timeline.some((event) => event.type === "aiCounter")).toBe(false);
  });
});
