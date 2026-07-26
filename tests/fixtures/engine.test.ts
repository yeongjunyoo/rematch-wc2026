import { describe, expect, it } from "vitest";
import {
  applyGoal,
  applyPenaltyAttempt,
  deriveTerminalFacts,
  stepPhase,
} from "../../src/domain/engine";
import type { MatchFormat, MatchState } from "../../src/domain/types";

const fullExtraTime: MatchFormat = {
  regulationMinutes: 90,
  regulationStoppage: 0,
  extraTimeRule: "fullExtraTime",
  extraTimeMinutes: 30,
  shootoutOnTie: true,
  shootoutRegularRounds: 5,
};

function state(overrides: Partial<MatchState> = {}): MatchState {
  return {
    clock: { phase: "regulation", minute: 90, absoluteMinute: 90, shootoutRound: null },
    userGoals: 0,
    opponentGoals: 0,
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

function take(state: MatchState, format: MatchFormat, side: "user" | "opponent", result: "scored" | "saved" | "missed"): MatchState {
  return applyPenaltyAttempt(state, format, { side, takerId: `${side}-${state.events.length}`, result });
}

describe("종료 상태기", () => {
  it("정규시간 리드를 regulation 결과로 끝낸다", () => {
    const result = stepPhase(state({ userGoals: 1 }), fullExtraTime).state;

    expect(result.clock.phase).toBe("finished");
    expect(result.terminal).toMatchObject({ decidedPhase: "regulation", userResult: "win" });
  });

  it("연장과 승부차기 없는 정규시간 동점을 무승부로 끝낸다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "none", shootoutOnTie: false, extraTimeMinutes: 0 };
    const result = stepPhase(state(), format).state;

    expect(result.clock.phase).toBe("finished");
    expect(result.terminal).toMatchObject({ decidedPhase: "regulation", userResult: "draw" });
  });

  it("풀 연장전 득점은 종료 시점까지 진행한 뒤 연장 결과로 확정한다", () => {
    const entered = stepPhase(state(), fullExtraTime).state;
    const scored = applyGoal(entered, fullExtraTime, { side: "user", scorerId: "scorer", kind: "openPlay" });
    const result = stepPhase({ ...scored, clock: { ...scored.clock, minute: 30, absoluteMinute: 120 } }, fullExtraTime).state;

    expect(scored.clock.phase).toBe("extraTime");
    expect(result.terminal).toMatchObject({ decidedPhase: "extraTime", userResult: "win" });
  });

  it("골든골 연장전 득점은 남은 시간을 소진하지 않고 즉시 끝낸다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "suddenDeath" };
    const entered = stepPhase(state(), format).state;
    const result = applyGoal({ ...entered, clock: { ...entered.clock, minute: 16, absoluteMinute: 106 } }, format, {
      side: "user",
      scorerId: "scorer",
      kind: "openPlay",
    });

    expect(result.clock).toMatchObject({ phase: "finished", minute: 16, absoluteMinute: 106 });
    expect(result.terminal).toMatchObject({ decidedPhase: "goldenGoal", userResult: "win" });
  });

  it("연장 동점 뒤 정규 다섯 라운드 4대 3 승부차기를 확정한다", () => {
    const entered = stepPhase({ ...state(), clock: { phase: "extraTime", minute: 30, absoluteMinute: 120, shootoutRound: null } }, fullExtraTime).state;
    let result = entered;
    for (const [side, outcome] of [
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "scored"],
      ["user", "scored"], ["opponent", "missed"],
      ["user", "missed"], ["opponent", "missed"],
    ] as const) {
      result = take(result, fullExtraTime, side, outcome);
    }

    expect(result.clock.phase).toBe("finished");
    expect(result.terminal).toMatchObject({ decidedPhase: "shootout", userResult: "win" });
    expect(result.shootout).toMatchObject({ userScore: 4, opponentScore: 3 });
  });

  it("남은 킥을 모두 성공해도 뒤집지 못하면 조기 종료한다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "none" };
    let result = stepPhase(state(), format).state;
    for (const [side, outcome] of [
      ["user", "scored"], ["opponent", "missed"],
      ["user", "scored"], ["opponent", "missed"],
      ["user", "scored"], ["opponent", "missed"],
    ] as const) {
      result = take(result, format, side, outcome);
    }

    expect(result.clock.phase).toBe("finished");
    expect(result.shootout?.attempts).toHaveLength(6);
    expect(result.shootout).toMatchObject({ userScore: 3, opponentScore: 0 });
  });

  it("정규 라운드 동점은 서든데스로 전환하고 한 쌍 뒤 승자를 정한다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "none" };
    let result = stepPhase(state(), format).state;
    for (let round = 0; round < 5; round += 1) {
      result = take(result, format, "user", "scored");
      result = take(result, format, "opponent", "scored");
    }

    expect(result.shootout).toMatchObject({ inSuddenDeath: true, completedRounds: 5 });
    result = take(result, format, "user", "scored");
    result = take(result, format, "opponent", "missed");

    expect(result.terminal).toMatchObject({ decidedPhase: "shootout", userResult: "win" });
  });

  it("승부차기에서 같은 side의 연속 시도는 거부한다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "none" };
    const entered = stepPhase(state(), format).state;

    expect(entered.shootout?.nextSide).toBe("user");
    expect(() => take(entered, format, "opponent", "scored")).toThrow("Expected user");
  });

  it("정규 라운드를 소진한 side의 추가 시도는 거부한다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "none" };
    let result = stepPhase(state(), format).state;
    for (let round = 0; round < 5; round += 1) {
      result = take(result, format, "user", "scored");
      result = take(result, format, "opponent", "scored");
    }
    const beforeSuddenDeath = {
      ...result,
      shootout: { ...result.shootout!, inSuddenDeath: false, nextSide: "user" as const },
    };

    expect(() => take(beforeSuddenDeath, format, "user", "scored")).toThrow("Regular shootout rounds");
  });

  it("서든데스는 한 쌍이 완성되기 전에는 종료하지 않는다", () => {
    const format: MatchFormat = { ...fullExtraTime, extraTimeRule: "none" };
    let result = stepPhase(state(), format).state;
    for (let round = 0; round < 5; round += 1) {
      result = take(result, format, "user", "scored");
      result = take(result, format, "opponent", "scored");
    }

    result = take(result, format, "user", "scored");

    expect(result.clock.phase).toBe("shootout");
    expect(result.terminal).toBeNull();
    expect(result.shootout?.nextSide).toBe("opponent");
  });

  it("사용자가 진 팀을 지휘해도 관점 상대적으로 패배를 반환한다", () => {
    const result = stepPhase(state({ opponentGoals: 1 }), fullExtraTime).state;

    expect(deriveTerminalFacts(result, { derivedOutcomeRule: null }).userResult).toBe("loss");
  });
});
