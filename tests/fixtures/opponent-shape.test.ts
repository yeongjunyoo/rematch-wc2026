import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { simulateToTerminal } from "../../src/domain/simulate";
import { FORMATION_SLOTS } from "../../src/domain/tactics";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration } from "../../src/domain/types";
import { defaultFormation, initialPlacements } from "../../src/ui/squad";

function startState(scenario: ScenarioDeclaration): MatchState {
  return {
    clock: { phase: "regulation", minute: scenario.interventionStartMinute, absoluteMinute: scenario.interventionStartMinute, shootoutRound: null },
    userGoals: scenario.startingUserGoals,
    opponentGoals: scenario.startingOpponentGoals,
    shootout: null,
    events: [],
    tokensRemaining: 3,
    userDirectives: NEUTRAL_DIRECTIVES,
    opponentDirectives: NEUTRAL_DIRECTIVES,
    ai: { responseBudget: 2, cooldownUntilMinute: scenario.interventionStartMinute, lastObserved: null, observationLagMinutes: 0, riskTolerance: 2 },
    terminal: null,
  };
}

function intervention(scenario: ScenarioDeclaration): Intervention {
  return {
    tokenIndex: 0,
    atMinute: scenario.interventionStartMinute,
    directives: NEUTRAL_DIRECTIVES,
    formation: defaultFormation(scenario.id),
    placements: initialPlacements(scenario.id),
    substitutions: [],
  };
}

describe("상대 대형 선언", () => {
  it("모든 시나리오가 유효한 상대 대형을 선언한다", () => {
    expect(SCENARIOS).toHaveLength(5);
    for (const scenario of SCENARIOS) expect(FORMATION_SLOTS[scenario.opponentFormation]).toBeDefined();
  });

  it("데이터 이동 뒤에도 고정 경기 결과를 유지한다", () => {
    const observed = SCENARIOS.map((scenario) => {
      const result = simulateToTerminal({
        scenario,
        world: deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, "opponent-shape", "opponent-shape"),
        interventions: [intervention(scenario)],
        startState: startState(scenario),
      });
      const terminal = result.state.terminal;
      if (terminal === null) throw new Error("Terminal facts are required for regression coverage.");
      return {
        id: scenario.id,
        score: [result.state.userGoals, result.state.opponentGoals],
        decidedPhase: terminal.decidedPhase,
        userResult: terminal.userResult,
        eventCount: result.timeline.length,
      };
    });

    // 아래 기대값은 고정 시드와 고정 개입으로 실제 실행해 관측한 종료 상태다.
    expect(observed).toEqual([
      { id: "za-kor-2026", score: [0, 1], decidedPhase: "regulation", userResult: "loss", eventCount: 9 },
      { id: "kor-cze-2026", score: [2, 1], decidedPhase: "regulation", userResult: "win", eventCount: 8 },
      { id: "esp-arg-2026-final", score: [0, 1], decidedPhase: "extraTime", userResult: "loss", eventCount: 11 },
      { id: "ger-par-2026-r32", score: [1, 2], decidedPhase: "regulation", userResult: "loss", eventCount: 10 },
      { id: "kor-ita-2002", score: [1, 1], decidedPhase: "shootout", userResult: "win", eventCount: 16 },
    ]);
  });
});
