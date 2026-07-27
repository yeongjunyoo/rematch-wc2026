import { describe, expect, it } from "vitest";

import { SCENARIOS, getScenario } from "../../src/data/scenarios";
import {
  applyGoal,
  applyPenaltyAttempt,
  stepPhase,
} from "../../src/domain/engine";
import { evaluateGrade } from "../../src/domain/outcome";
import type { MatchState, ScenarioDeclaration } from "../../src/domain/types";

function scenario(id: string): ScenarioDeclaration {
  const found = getScenario(id);
  if (found === undefined) {
    throw new Error(`시나리오를 찾을 수 없습니다: ${id}`);
  }
  return found;
}

function state(
  declaration: ScenarioDeclaration,
  overrides: Partial<MatchState> = {},
): MatchState {
  return {
    clock: { phase: "regulation", minute: 90, absoluteMinute: 90, shootoutRound: null },
    userGoals: declaration.startingUserGoals,
    opponentGoals: declaration.startingOpponentGoals,
    shootout: null,
    events: [],
    tokensRemaining: 3,
    userDirectives: { defensiveLine: 0, pressing: 0, tempo: 0, attackRoute: 0, mindset: 0 },
    opponentDirectives: { defensiveLine: 0, pressing: 0, tempo: 0, attackRoute: 0, mindset: 0 },
    ai: { responseBudget: 0, cooldownUntilMinute: 0, lastObserved: null, observationLagMinutes: 0, riskTolerance: 0 },
    terminal: null,
    ...overrides,
  };
}

function terminal(match: MatchState): NonNullable<MatchState["terminal"]> {
  if (match.terminal === null) {
    throw new Error("Finished match must contain terminal facts.");
  }

  return match.terminal;
}

function penalty(
  match: MatchState,
  declaration: ScenarioDeclaration,
  side: "user" | "opponent",
  result: "scored" | "saved" | "missed",
): MatchState {
  return applyPenaltyAttempt(match, declaration.format, {
    side,
    takerId: `${side}-${match.events.length}`,
    result,
  }, declaration.derivedOutcomeRule);
}

describe("다섯 종료 경로", () => {
  it("남아공전은 패배와 동점 진출 그리고 역전 등급을 구분한다", () => {
    const declaration = scenario("za-kor-2026");
    const lost = stepPhase(state(declaration), declaration.format, declaration.derivedOutcomeRule).state;
    const lossFacts = terminal(lost);

    expect(lossFacts).toMatchObject({ decidedPhase: "regulation", userResult: "loss" });
    expect(lost.terminal?.derivedOutcome).toMatchObject({ achieved: false, statement: "녹아웃 진출에 실패했습니다." });

    const drawnStart = applyGoal(state(declaration), declaration.format, {
      side: "user",
      scorerId: "equalizer",
      kind: "openPlay",
    }, declaration.derivedOutcomeRule);
    const drawn = stepPhase(drawnStart, declaration.format, declaration.derivedOutcomeRule).state;
    const drawFacts = terminal(drawn);
    expect(drawFacts).toMatchObject({ userResult: "draw" });
    expect(drawn.terminal?.derivedOutcome).toMatchObject({ achieved: true, statement: "녹아웃 진출을 지켜냈습니다." });

    const wonStart = applyGoal(drawnStart, declaration.format, {
      side: "user",
      scorerId: "winner",
      kind: "openPlay",
    }, declaration.derivedOutcomeRule);
    const won = stepPhase(wonStart, declaration.format, declaration.derivedOutcomeRule).state;
    const winFacts = terminal(won);
    const grades = ["F", "B", "A", "S"];
    expect(grades.indexOf(evaluateGrade(declaration.mission, winFacts))).toBeGreaterThanOrEqual(
      grades.indexOf(evaluateGrade(declaration.mission, drawFacts)),
    );
  });

  it("체코전은 골득실 목표를 정규시간 등급에 반영한다", () => {
    const declaration = scenario("kor-cze-2026");
    const historical = terminal(
      stepPhase(state(declaration, { userGoals: 2, opponentGoals: 1 }), declaration.format, declaration.derivedOutcomeRule).state,
    );
    const expanded = terminal(
      stepPhase(state(declaration, { userGoals: 4, opponentGoals: 1 }), declaration.format, declaration.derivedOutcomeRule).state,
    );

    expect(historical).toMatchObject({ decidedPhase: "regulation", userResult: "win" });
    // 실제 역사인 2대1은 골득실 1이므로 A, 더 벌린 4대1은 S다.
    expect(evaluateGrade(declaration.mission, historical)).toBe("A");
    expect(evaluateGrade(declaration.mission, expanded)).toBe("S");
  });

  it("결승은 아르헨티나 관점의 연장 패배와 승리를 구분한다", () => {
    const declaration = scenario("esp-arg-2026-final");
    const entered = stepPhase(state(declaration), declaration.format, declaration.derivedOutcomeRule).state;
    expect(entered.clock.phase).toBe("extraTime");

    const conceded = applyGoal(entered, declaration.format, {
      side: "opponent",
      scorerId: "ferran-torres",
      kind: "openPlay",
    }, declaration.derivedOutcomeRule);
    const lost = stepPhase({ ...conceded, clock: { ...conceded.clock, minute: 30, absoluteMinute: 120 } }, declaration.format, declaration.derivedOutcomeRule).state;
    expect(terminal(lost)).toMatchObject({ decidedPhase: "extraTime", userResult: "loss" });

    const scored = applyGoal(entered, declaration.format, {
      side: "user",
      scorerId: "argentina-winner",
      kind: "openPlay",
    }, declaration.derivedOutcomeRule);
    const won = stepPhase({ ...scored, clock: { ...scored.clock, minute: 30, absoluteMinute: 120 } }, declaration.format, declaration.derivedOutcomeRule).state;
    expect(terminal(won)).toMatchObject({ decidedPhase: "extraTime", userResult: "win" });
  });

  it("독일전은 실화의 승부차기 3대4와 이번 승리를 구분한다", () => {
    const declaration = scenario("ger-par-2026-r32");
    const extraTime = stepPhase(state(declaration), declaration.format, declaration.derivedOutcomeRule).state;
    const shootout = stepPhase(
      { ...extraTime, clock: { ...extraTime.clock, minute: 30, absoluteMinute: 120 } },
      declaration.format,
      declaration.derivedOutcomeRule,
    ).state;
    expect(shootout.clock.phase).toBe("shootout");

    let historical = shootout;
    for (const [side, result] of [
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "scored"],
      ["user", "missed"], ["opponent", "missed"],
      ["user", "missed"], ["opponent", "missed"],
      ["user", "missed"], ["opponent", "scored"],
    ] as const) {
      historical = penalty(historical, declaration, side, result);
    }
    expect(terminal(historical)).toMatchObject({ decidedPhase: "shootout", userResult: "loss" });
    expect(historical.shootout).toMatchObject({ userScore: 3, opponentScore: 4 });

    let rematch = shootout;
    for (const [side, result] of [
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "missed"],
      ["user", "missed"], ["opponent", "missed"],
    ] as const) {
      rematch = penalty(rematch, declaration, side, result);
    }
    expect(terminal(rematch)).toMatchObject({ decidedPhase: "shootout", userResult: "win" });
    expect(rematch.shootout).toMatchObject({ userScore: 4, opponentScore: 3 });
  });

  it("2002년은 골든골 직후 종료하고 정규시간 승리보다 높은 등급을 주지 않는다", () => {
    const declaration = scenario("kor-ita-2002");
    const atEnd = state(declaration);
    const entered = stepPhase(
      { ...atEnd, clock: { ...atEnd.clock, minute: 94, absoluteMinute: 94 } },
      declaration.format,
      declaration.derivedOutcomeRule,
    ).state;
    const goldenGoal = applyGoal(
      { ...entered, clock: { ...entered.clock, minute: 16, absoluteMinute: 106 } },
      declaration.format,
      { side: "user", scorerId: "golden-goal", kind: "openPlay" },
      declaration.derivedOutcomeRule,
    );
    const goldenFacts = terminal(goldenGoal);
    const atRegulationEnd = state(declaration, { userGoals: 2, opponentGoals: 1 });
    const regulationFacts = terminal(
      stepPhase(
        { ...atRegulationEnd, clock: { ...atRegulationEnd.clock, minute: 94, absoluteMinute: 94 } },
        declaration.format,
        declaration.derivedOutcomeRule,
      ).state,
    );
    const grades = ["F", "B", "A", "S"];

    expect(goldenGoal.clock).toMatchObject({ phase: "finished", minute: 16, absoluteMinute: 106 });
    expect(goldenGoal.clock.minute).toBeLessThan(declaration.format.extraTimeMinutes);
    expect(goldenFacts).toMatchObject({ decidedPhase: "goldenGoal", userResult: "win" });
    expect(grades.indexOf(evaluateGrade(declaration.mission, goldenFacts))).toBeLessThanOrEqual(
      grades.indexOf(evaluateGrade(declaration.mission, regulationFacts)),
    );
  });

  it("실제 종료 사실은 네 종류의 결판 국면을 모두 덮는다", () => {
    const phases = new Set(SCENARIOS.map((declaration) => declaration.actualTerminal.decidedPhase));

    expect([...phases].sort()).toEqual(["extraTime", "goldenGoal", "regulation", "shootout"]);
  });

  it("실제 종료 사실과 형식 선언을 스냅샷으로 보존한다", () => {
    expect(SCENARIOS.map(({ id, actualTerminal, format }) => ({ id, actualTerminal, format }))).toMatchSnapshot();
  });
});
