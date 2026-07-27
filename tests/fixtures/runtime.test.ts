import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { commitIntervention, createRuntime, isFinished, runToTerminal, simulateToTerminal, tickRuntime } from "../../src/domain/simulate";
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
  return deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, "d2", "d2");
}

function interventionAt(scenario: ScenarioDeclaration, atMinute: number, directives: TacticalDirectives, tokenIndex = 0): Intervention {
  return { tokenIndex, atMinute, directives, formation: defaultFormation(scenario.id), placements: initialPlacements(scenario.id), substitutions: [] };
}

const attacking: TacticalDirectives = { defensiveLine: 2, pressing: 1, tempo: 1, attackRoute: -1, mindset: 2 };
const cautious: TacticalDirectives = { defensiveLine: -2, pressing: -1, tempo: -1, attackRoute: 1, mindset: -2 };

/**
 * 화면은 tick으로 경기를 보여주고 리포트는 종료 상태를 읽는다. 두 경로가 조금이라도
 * 갈라지면 "내가 본 경기"와 "리포트가 말하는 경기"가 달라진다. 이 파일은 그 동일성이
 * 다섯 시나리오와 개입 유무 모두에서 유지되는지를 단언한다.
 */
describe("재생 가능한 경기 런타임", () => {
  it("한 걸음씩 밟은 결과가 배치 시뮬레이션과 완전히 같다", () => {
    for (const scenario of SCENARIOS) {
      const world = worldFor(scenario);
      const interventions = [interventionAt(scenario, scenario.interventionStartMinute, attacking)];
      const batch = simulateToTerminal({ scenario, world, interventions, startState: startState(scenario) });

      let runtime = createRuntime(scenario, world, startState(scenario), interventions);
      let steps = 0;
      while (!isFinished(runtime)) {
        runtime = tickRuntime(runtime);
        steps += 1;
        expect(steps).toBeLessThan(400);
      }

      expect(runtime.state).toEqual(batch.state);
      expect(runtime.state.events).toEqual(batch.timeline);
    }
  });

  it("개입이 전혀 없는 경기도 두 경로가 같다", () => {
    for (const scenario of SCENARIOS) {
      const world = worldFor(scenario);
      const batch = simulateToTerminal({ scenario, world, interventions: [], startState: startState(scenario) });
      const live = runToTerminal(createRuntime(scenario, world, startState(scenario)));
      expect(live.state).toEqual(batch.state);
    }
  });

  it("재생 도중 확정한 개입은 그 시점의 분으로 고정되어 배치와 같은 경기를 만든다", () => {
    const scenario = SCENARIOS[0]!;
    const world = worldFor(scenario);
    const pauseMinute = scenario.interventionStartMinute + 7;

    let live = createRuntime(scenario, world, startState(scenario));
    while (live.state.clock.absoluteMinute < pauseMinute) live = tickRuntime(live);
    expect(live.state.clock.absoluteMinute).toBe(pauseMinute);
    live = commitIntervention(live, interventionAt(scenario, 0, attacking));
    live = runToTerminal(live);

    const batch = simulateToTerminal({
      scenario,
      world,
      interventions: [interventionAt(scenario, pauseMinute, attacking)],
      startState: startState(scenario),
    });

    expect(live.state).toEqual(batch.state);
  });

  it("개입 시점이 다르면 경기 전개도 달라진다", () => {
    const scenario = SCENARIOS[0]!;
    const world = worldFor(scenario);
    const early = simulateToTerminal({ scenario, world, interventions: [interventionAt(scenario, scenario.interventionStartMinute, attacking)], startState: startState(scenario) });
    const late = simulateToTerminal({ scenario, world, interventions: [interventionAt(scenario, scenario.interventionStartMinute + 15, attacking)], startState: startState(scenario) });
    expect(early.timeline).not.toEqual(late.timeline);
  });

  it("한 걸음은 정확히 1분만 전진하고 토큰은 반영 시점에만 줄어든다", () => {
    const scenario = SCENARIOS[0]!;
    const world = worldFor(scenario);
    let runtime = createRuntime(scenario, world, startState(scenario));
    const before = runtime.state.clock.absoluteMinute;

    runtime = tickRuntime(runtime);
    expect(runtime.state.clock.absoluteMinute).toBe(before + 1);
    expect(runtime.state.tokensRemaining).toBe(3);

    runtime = commitIntervention(runtime, interventionAt(scenario, 0, cautious));
    expect(runtime.state.tokensRemaining).toBe(3);
    expect(runtime.appliedCount).toBe(0);

    runtime = tickRuntime(runtime);
    expect(runtime.state.tokensRemaining).toBe(2);
    expect(runtime.appliedCount).toBe(1);
    expect(runtime.state.events.some((event) => event.type === "intervention")).toBe(true);
  });

  it("종료된 경기에 한 걸음을 더 밟아도 상태가 변하지 않는다", () => {
    const scenario = SCENARIOS[0]!;
    const finished = runToTerminal(createRuntime(scenario, worldFor(scenario), startState(scenario)));
    expect(isFinished(finished)).toBe(true);
    expect(tickRuntime(finished)).toBe(finished);
  });

  it("승부차기 국면에서는 한 걸음이 한 번의 킥이다", () => {
    const scenario = SCENARIOS.find((candidate) => candidate.id === "ger-par-2026-r32")!;
    let runtime = createRuntime(scenario, worldFor(scenario), startState(scenario));
    while (!isFinished(runtime) && runtime.state.clock.phase !== "shootout") runtime = tickRuntime(runtime);
    if (runtime.state.clock.phase !== "shootout") return;

    const before = runtime.state.shootout?.attempts.length ?? 0;
    runtime = tickRuntime(runtime);
    expect(runtime.state.shootout?.attempts.length ?? 0).toBe(before + 1);
  });

  it("새 리매치는 공개 시드 덱의 다음 인덱스로만 전진한다", () => {
    const scenario = SCENARIOS[0]!;
    const first = runToTerminal(createRuntime(scenario, worldFor(scenario, 0), startState(scenario)));
    const second = runToTerminal(createRuntime(scenario, worldFor(scenario, 1), startState(scenario)));
    expect(first.world.publishedSeed).not.toBe(second.world.publishedSeed);
    expect(first.state.events).not.toEqual(second.state.events);
  });
});
