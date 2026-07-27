import { describe, expect, it } from "vitest";

import { getScenario } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { simulateToTerminal } from "../../src/domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration, TacticalDirectives } from "../../src/domain/types";
import { DATA_VERSION, ENGINE_VERSION } from "../../src/domain/version";
import { defaultFormation, initialPlacements } from "../../src/ui/squad";

/**
 * 표본은 공개 시드 덱이어야 한다.
 *
 * 이전에는 balance라는 임의 버전 문자열로 24개의 가상 시드를 만들어 검증했다. 그 공간은
 * 사용자가 절대 받지 않는다. 사용자는 공개 시드 덱만 플레이하므로 계약도 거기서 세운다.
 * 실제로 두 공간의 결과는 크게 달랐고, 넓은 표본이 통과하는 동안 플래그십 시나리오는
 * 공개 덱 여덟 개 중 일곱 개에서 전술과 무관하게 패배로 고정되어 있었다.
 */
const ENGINE = ENGINE_VERSION;
const DATA = DATA_VERSION;
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
    // 제품이 실제로 쓰는 AI 상태와 같아야 한다. 여기만 더 강한 AI를 모델링하면
    // 테스트는 통과하는데 사용자가 만나는 균형은 다른 것이 된다.
    ai: { responseBudget: 2, cooldownUntilMinute: scenario.interventionStartMinute, lastObserved: null, observationLagMinutes: 2, riskTolerance: 1 },
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

  const attempts = scenario.publishedSeedDeck.length;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
      world: deriveWorldSeed(scenario.id, attempt, scenario.publishedSeedDeck, ENGINE, DATA),
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

  return { userGoals: userGoals / attempts, opponentGoals: opponentGoals / attempts, drawsOrWins, outcomes };
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

    // 공개 시드 덱 여덟 개 기준이다. 하나도 못 뒤집으면 내 결정이 결과에 닿지 않는 것이고,
    // 대부분 뒤집히면 역사를 다시 쓴다는 무게가 사라진다.
    const deck = getScenario("za-kor-2026")!.publishedSeedDeck.length;
    expect(attacking.drawsOrWins).toBeGreaterThanOrEqual(2);
    expect(attacking.drawsOrWins).toBeLessThanOrEqual(Math.floor(deck * 0.75));

    // 그리고 전술을 밀지 않으면 역사가 우세해야 한다.
    const neutral = summarize("za-kor-2026", NEUTRAL_DIRECTIVES);
    expect(neutral.drawsOrWins).toBeLessThan(attacking.drawsOrWins);
  });

  it("is deterministic for a fixed world sample and intervention", () => {
    expect(summarize("esp-arg-2026-final", ATTACKING)).toEqual(summarize("esp-arg-2026-final", ATTACKING));
  });
});
