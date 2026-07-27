import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { evaluateGrade } from "../../src/domain/outcome";
import { deriveWorldSeed } from "../../src/domain/rng";
import { createRuntime, runToTerminal } from "../../src/domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration, TacticalDirectives } from "../../src/domain/types";
import { DATA_VERSION, ENGINE_VERSION } from "../../src/domain/version";
import { defaultFormation, initialPlacements, squadFor } from "../../src/ui/squad";

/**
 * 등급표에 걸린 목표는 실제로 달성 가능해야 한다.
 *
 * 앞선 판에서는 5대1 같은 스코어를 손으로 지어내 모든 국면과 조합했다. 그 방식은
 * 상태기가 만들 수 없는 종료 상태를 증거로 삼아, 2002 헌정 경기의 도달 불가능한 S 커트라인을
 * 통과시켰다. 90분 1대1에서 골든골 형식으로 이어받으면 승리 골득실은 최대 1인데도 그랬다.
 *
 * 그래서 이 파일은 증거를 지어내지 않는다. 실제 엔진을 공개 시드 전수와 여러 전술로 돌려
 * 나온 종료 상태만 모으고, 선언된 각 등급이 그 안에서 최소 한 번 나오는지 본다.
 */

const ATTACKING: TacticalDirectives = { defensiveLine: 2, pressing: 2, tempo: 2, attackRoute: 0, mindset: 2 };
const DEFENSIVE: TacticalDirectives = { defensiveLine: -2, pressing: -2, tempo: -2, attackRoute: 0, mindset: -2 };

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

function interventionsFor(scenario: ScenarioDeclaration, directives: TacticalDirectives, withSubstitution: boolean): readonly Intervention[] {
  const base = initialPlacements(scenario.id);
  const incoming = squadFor(scenario.id).bench[0];
  const outgoing = [...base].sort((left, right) => right.slot.x - left.slot.x)[0];
  const substitutes = withSubstitution && incoming !== undefined && outgoing !== undefined
    ? [{ outId: outgoing.playerId, inId: incoming.id }]
    : [];
  return [{
    tokenIndex: 0,
    atMinute: scenario.interventionStartMinute,
    directives,
    formation: defaultFormation(scenario.id),
    placements: substitutes.length === 0
      ? base
      : base.map((placement) => placement.playerId === outgoing!.playerId ? { playerId: incoming!.id, slot: placement.slot } : placement),
    substitutions: substitutes,
  }];
}

/** 이 시나리오에서 엔진이 실제로 만들어 낼 수 있는 등급들. */
function observedGrades(scenario: ScenarioDeclaration): ReadonlySet<string> {
  const grades = new Set<string>();
  for (let attemptIndex = 0; attemptIndex < scenario.publishedSeedDeck.length; attemptIndex += 1) {
    const world = deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, ENGINE_VERSION, DATA_VERSION);
    for (const directives of [NEUTRAL_DIRECTIVES, ATTACKING, DEFENSIVE]) {
      for (const withSubstitution of [false, true]) {
        const finished = runToTerminal(createRuntime(scenario, world, startState(scenario), interventionsFor(scenario, directives, withSubstitution)));
        const terminal = finished.state.terminal;
        if (terminal !== null) grades.add(evaluateGrade(scenario.mission, terminal));
      }
    }
  }
  return grades;
}

describe("선언된 등급은 실제로 달성 가능하다", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.id}의 모든 등급이 엔진이 만들 수 있는 종료 상태로 도달된다`, () => {
      const reachable = observedGrades(scenario);
      const declared = scenario.mission.gradeCutlines.map((cutline) => cutline.grade);
      const unreachable = declared.filter((grade) => !reachable.has(grade));
      expect(unreachable, `달성할 수 없는 등급을 목표로 보여주면 안 된다. 관측된 등급: ${[...reachable].join(", ")}`).toEqual([]);
    });
  }

  it("표본이 실제로 여러 결과를 만든다", () => {
    // 모든 시나리오가 한 등급만 낸다면 위 단언은 통과해도 의미가 없다.
    const spread = SCENARIOS.map((scenario) => observedGrades(scenario).size);
    expect(Math.max(...spread)).toBeGreaterThan(1);
  });
});
