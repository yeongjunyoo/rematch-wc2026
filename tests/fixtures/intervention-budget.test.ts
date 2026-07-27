import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { commitIntervention, createRuntime, isFinished, runToTerminal, tickRuntime } from "../../src/domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration, TacticalDirectives } from "../../src/domain/types";
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
    ai: { responseBudget: 2, cooldownUntilMinute: scenario.interventionStartMinute, lastObserved: null, observationLagMinutes: 2, riskTolerance: 1 },
    terminal: null,
  };
}

function worldFor(scenario: ScenarioDeclaration, attemptIndex = 0) {
  return deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, "e1", "d1");
}

function interventionOf(scenario: ScenarioDeclaration, directives: TacticalDirectives, tokenIndex: number): Intervention {
  return {
    tokenIndex,
    atMinute: 0,
    directives,
    formation: defaultFormation(scenario.id),
    placements: initialPlacements(scenario.id),
    substitutions: [],
  };
}

const attacking: TacticalDirectives = { defensiveLine: 2, pressing: 1, tempo: 1, attackRoute: -1, mindset: 2 };

/**
 * 완료 게이트의 3레인 리뷰가 잡은 두 계약 위반을 고정한다.
 * 둘 다 화면에서는 성공한 것처럼 보이고 실제로는 규칙이 깨지던 결함이라
 * 눈으로 보는 검증으로는 다시 잡히지 않는다.
 */
describe("개입 예산과 국면 계약", () => {
  it("승부차기 국면에서 확정한 개입도 실제로 적용된다", () => {
    const scenario = SCENARIOS.find((candidate) => candidate.id === "ger-par-2026-r32")!;
    // 시드 덱을 훑어 실제로 승부차기까지 가는 시도를 찾는다. 못 찾으면 이 계약을 시험할 수 없다.
    let reached: ReturnType<typeof createRuntime> | null = null;
    for (let attemptIndex = 0; attemptIndex < scenario.publishedSeedDeck.length; attemptIndex += 1) {
      let runtime = createRuntime(scenario, worldFor(scenario, attemptIndex), startState(scenario));
      let steps = 0;
      while (!isFinished(runtime) && runtime.state.clock.phase !== "shootout" && steps < 400) {
        runtime = tickRuntime(runtime);
        steps += 1;
      }
      if (runtime.state.clock.phase === "shootout") { reached = runtime; break; }
    }
    expect(reached, "공개 시드 덱 안에 승부차기에 도달하는 시도가 있어야 한다").not.toBeNull();

    const before = reached!;
    expect(before.appliedCount).toBe(0);

    const committed = commitIntervention(before, interventionOf(scenario, attacking, 0));
    const stepped = tickRuntime(committed);

    // 예약 개입이 승부차기에서도 소비되어야 한다. 예전에는 여기서 영원히 0으로 남았다.
    expect(stepped.appliedCount).toBe(1);
    expect(stepped.state.tokensRemaining).toBe(2);
    expect(stepped.state.userDirectives).toEqual(attacking);
    expect(stepped.state.events.some((event) => event.type === "intervention")).toBe(true);
  });

  it("승부차기 개입이 없으면 경기 결과가 그대로다", () => {
    const scenario = SCENARIOS.find((candidate) => candidate.id === "ger-par-2026-r32")!;
    for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
      const world = worldFor(scenario, attemptIndex);
      const first = runToTerminal(createRuntime(scenario, world, startState(scenario)));
      const second = runToTerminal(createRuntime(scenario, world, startState(scenario)));
      expect(first.state.terminal).toEqual(second.state.terminal);
    }
  });

  it("교체 카드 예산의 정본은 확정된 개입들이다", () => {
    const scenario = SCENARIOS[0]!;
    const runtime = createRuntime(scenario, worldFor(scenario), startState(scenario));
    const withOne = commitIntervention(runtime, {
      ...interventionOf(scenario, attacking, 0),
      substitutions: [{ outId: "oh-hyeon-gyu", inId: "son-heung-min" }],
    });
    const withTwo = commitIntervention(withOne, {
      ...interventionOf(scenario, attacking, 1),
      substitutions: [{ outId: "hwang-hee-chan", inId: "za-kor-b-fw" }, { outId: "baek-seung-ho", inId: "za-kor-b-mf" }],
    });

    // 화면이 더그아웃을 다시 열 때 내려보내는 값과 같은 방식으로 센다.
    const used = (candidate: typeof withTwo) =>
      candidate.interventions.reduce((total, intervention) => total + intervention.substitutions.length, 0);

    expect(used(runtime)).toBe(0);
    expect(used(withOne)).toBe(1);
    expect(used(withTwo)).toBe(3);
  });

  it("확정된 교체는 경기 사건으로 남아 화면이 다시 세지 않아도 된다", () => {
    const scenario = SCENARIOS[0]!;
    const runtime = commitIntervention(
      createRuntime(scenario, worldFor(scenario), startState(scenario)),
      { ...interventionOf(scenario, attacking, 0), substitutions: [{ outId: "oh-hyeon-gyu", inId: "son-heung-min" }] },
    );
    const stepped = tickRuntime(runtime);
    const substitutions = stepped.state.events.filter((event) => event.type === "substitution");
    expect(substitutions).toHaveLength(1);
    expect(substitutions[0]).toMatchObject({ outId: "oh-hyeon-gyu", inId: "son-heung-min" });
  });
});
