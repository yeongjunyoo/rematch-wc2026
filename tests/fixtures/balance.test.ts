import { describe, expect, it } from "vitest";

import { getScenario } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { simulateToTerminal } from "../../src/domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration, TacticalDirectives } from "../../src/domain/types";
import { defaultFormation, initialPlacements } from "../../src/ui/squad";

const ATTEMPTS = 24;
const ATTACKING: TacticalDirectives = { defensiveLine: 2, pressing: 2, tempo: 2, attackRoute: 0, mindset: 2 };
const CAUTIOUS: TacticalDirectives = { defensiveLine: -2, pressing: -2, tempo: -2, attackRoute: 0, mindset: -2 };

type Summary = { readonly userGoals: number; readonly opponentGoals: number; readonly drawsOrWins: number; readonly outcomes: readonly string[] };

function stateFor(scenario: ScenarioDeclaration, directives: TacticalDirectives): MatchState {
  return {
    clock: { phase: "regulation", minute: scenario.interventionStartMinute, absoluteMinute: scenario.interventionStartMinute, shootoutRound: null },
    userGoals: scenario.startingUserGoals,
    opponentGoals: scenario.startingOpponentGoals,
    shootout: null,
    events: [],
    tokensRemaining: 3,
    userDirectives: directives,
    opponentDirectives: NEUTRAL_DIRECTIVES,
    ai: { responseBudget: 3, cooldownUntilMinute: 0, lastObserved: null, observationLagMinutes: 2, riskTolerance: 0.5 },
    terminal: null,
  };
}

function summarize(scenarioId: string, directives: TacticalDirectives): Summary {
  const scenario = getScenario(scenarioId);
  if (scenario === undefined) throw new Error(`Unknown scenario ${scenarioId}.`);
  let userGoals = 0;
  let opponentGoals = 0;
  let drawsOrWins = 0;
  const outcomes: string[] = [];

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const intervention: Intervention = {
      tokenIndex: 0,
      atMinute: scenario.interventionStartMinute,
      directives,
      formation: defaultFormation(scenario.id),
      placements: initialPlacements(scenario.id),
      substitutions: [],
    };
    const result = simulateToTerminal({
      scenario,
      world: deriveWorldSeed(scenario.id, attempt, scenario.publishedSeedDeck, "balance", "balance"),
      interventions: [intervention],
      startState: stateFor(scenario, directives),
    });
    const terminal = result.state.terminal;
    if (terminal === null) throw new Error("Simulation did not terminate.");
    userGoals += terminal.userGoals;
    opponentGoals += terminal.opponentGoals;
    if (terminal.userResult !== "loss") drawsOrWins += 1;
    outcomes.push(`${terminal.userGoals}:${terminal.opponentGoals}:${terminal.userResult}:${terminal.decidedPhase}`);
  }

  return { userGoals: userGoals / ATTEMPTS, opponentGoals: opponentGoals / ATTEMPTS, drawsOrWins, outcomes };
}

describe("tactical balance", () => {
  it("keeps a visible attacking tradeoff without a dominant profile", () => {
    const neutral = summarize("ger-par-2026-r32", NEUTRAL_DIRECTIVES);
    const attacking = summarize("ger-par-2026-r32", ATTACKING);
    const cautious = summarize("ger-par-2026-r32", CAUTIOUS);

    expect(attacking.userGoals - neutral.userGoals).toBeGreaterThanOrEqual(0.25);
    expect(attacking.opponentGoals - neutral.opponentGoals).toBeGreaterThanOrEqual(0.2);
    expect(neutral.opponentGoals - cautious.opponentGoals).toBeGreaterThanOrEqual(0.2);
    expect(attacking.userGoals > neutral.userGoals && attacking.opponentGoals < neutral.opponentGoals).toBe(false);
    expect(cautious.userGoals > neutral.userGoals && cautious.opponentGoals < neutral.opponentGoals).toBe(false);
  });

  it("makes the South Africa comeback possible but not routine", () => {
    const attacking = summarize("za-kor-2026", ATTACKING);

    expect(attacking.drawsOrWins).toBeGreaterThanOrEqual(3);
    expect(attacking.drawsOrWins).toBeLessThanOrEqual(11);
  });

  it("is deterministic for a fixed world sample and intervention", () => {
    expect(summarize("esp-arg-2026-final", ATTACKING)).toEqual(summarize("esp-arg-2026-final", ATTACKING));
  });
});
