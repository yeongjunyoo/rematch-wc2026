import { describe, expect, it } from "vitest";

import {
  compareToHistory,
  evaluateDerivedOutcome,
  evaluateGrade,
  withDerivedOutcome,
} from "../../src/domain/outcome";
import type {
  DerivedOutcomeRule,
  MissionGoal,
  TerminalFacts,
} from "../../src/domain/types";

const southAfricaRule: DerivedOutcomeRule = {
  label: "16강 진출",
  onWin: { achieved: true, statement: "16강에 진출했습니다." },
  onDraw: { achieved: true, statement: "16강에 진출했습니다." },
  onLoss: { achieved: false, statement: "16강 진출에 실패했습니다." },
  sourceNote: "비기기만 해도 진출",
};

function facts(overrides: Partial<TerminalFacts> = {}): TerminalFacts {
  return {
    userGoals: 0,
    opponentGoals: 0,
    shootout: null,
    decidedPhase: "regulation",
    userResult: "draw",
    derivedOutcome: null,
    ...overrides,
  };
}

describe("outcome", () => {
  it("남아공전의 승무패 세 행 진출 규칙을 그대로 평가한다", () => {
    expect(evaluateDerivedOutcome(southAfricaRule, "win").achieved).toBe(true);
    expect(evaluateDerivedOutcome(southAfricaRule, "draw").achieved).toBe(true);
    expect(evaluateDerivedOutcome(southAfricaRule, "loss").achieved).toBe(false);
  });

  it("선언된 순서에서 첫 번째 충족 등급을 반환한다", () => {
    const mission: MissionGoal = {
      brief: "순서 확인",
      gradeCutlines: [
        { grade: "A", requirement: { kind: "always" } },
        { grade: "S", requirement: { kind: "always" } },
      ],
    };

    expect(evaluateGrade(mission, facts())).toBe("A");
  });

  it("득점차는 승부차기 점수를 더하지 않는다", () => {
    const mission: MissionGoal = {
      brief: "두 골 차 승리",
      gradeCutlines: [
        { grade: "S", requirement: { kind: "goalDifferenceAtLeast", value: 2 } },
      ],
    };
    const shootoutFacts = facts({
      userGoals: 1,
      opponentGoals: 0,
      userResult: "win",
      decidedPhase: "shootout",
      shootout: {
        userScore: 5,
        opponentScore: 3,
        completedRounds: 5,
        inSuddenDeath: false,
        attempts: [],
      },
    });

    expect(evaluateGrade(mission, shootoutFacts)).toBe("F");
  });

  it("충족하는 커트라인이 없으면 F를 반환한다", () => {
    const mission: MissionGoal = {
      brief: "승리 필요",
      gradeCutlines: [
        { grade: "B", requirement: { kind: "userResult", result: "win" } },
        { grade: "A", requirement: { kind: "derivedAchieved" } },
      ],
    };

    expect(evaluateGrade(mission, facts())).toBe("F");
  });

  it("골든골과 승부차기 결판을 구별한다", () => {
    const goldenGoalMission: MissionGoal = {
      brief: "골든골",
      gradeCutlines: [
        { grade: "S", requirement: { kind: "decidedBy", phase: "goldenGoal" } },
      ],
    };
    const shootoutMission: MissionGoal = {
      brief: "승부차기",
      gradeCutlines: [
        { grade: "S", requirement: { kind: "decidedBy", phase: "shootout" } },
      ],
    };

    expect(evaluateGrade(goldenGoalMission, facts({ decidedPhase: "goldenGoal" }))).toBe("S");
    expect(evaluateGrade(shootoutMission, facts({ decidedPhase: "goldenGoal" }))).toBe("F");
  });

  it("같은 스코어라도 진출 여부가 바뀌면 역사가 바뀐 것으로 본다", () => {
    const actual = facts({
      userGoals: 0,
      opponentGoals: 1,
      userResult: "loss",
      derivedOutcome: southAfricaRule.onLoss,
    });
    const mine = facts({
      userGoals: 0,
      opponentGoals: 1,
      userResult: "loss",
      derivedOutcome: southAfricaRule.onDraw,
    });

    const comparison = compareToHistory(actual, mine);

    expect(comparison.changed).toBe(true);
    expect(comparison.headline).not.toBe("");
  });

  it("파생 결과 주입은 입력 종료 사실을 변경하지 않는다", () => {
    const original = facts({ userResult: "loss" });

    const enriched = withDerivedOutcome(original, southAfricaRule);

    expect(original.derivedOutcome).toBeNull();
    expect(enriched).not.toBe(original);
    expect(enriched.derivedOutcome).toEqual(southAfricaRule.onLoss);
  });
});
