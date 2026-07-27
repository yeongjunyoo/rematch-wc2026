import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import type { AiCounterEvent, ChanceEvent, GoalEvent, MatchClock, MatchEvent, PenaltyAttemptEvent, SubstitutionEvent } from "../../src/domain/types";
import { initialPlacements } from "../../src/ui/squad";
import { emphasisFrom, keyPlayerIdsFrom, matchFocusPoint, opponentPitchPlayers, userPitchPlayers } from "../../src/ui/matchView";

function clock(absoluteMinute: number): MatchClock {
  return { phase: "regulation", minute: absoluteMinute, absoluteMinute, shootoutRound: null };
}

function chance(side: "user" | "opponent", minute: number): ChanceEvent {
  return { type: "chance", side, shooterId: "shooter", quality: 0.4, converted: false, clock: clock(minute) };
}

function goal(side: "user" | "opponent", minute: number): GoalEvent {
  return { type: "goal", side, scorerId: "scorer", kind: "openPlay", clock: clock(minute) };
}

function penaltyAttempt(side: "user" | "opponent", minute: number): PenaltyAttemptEvent {
  return { type: "penaltyAttempt", side, takerId: "taker", round: 1, result: "saved", clock: clock(minute) };
}

function counter(minute: number): AiCounterEvent {
  return { type: "aiCounter", side: "opponent", counteredWhat: "압박", exposedWeakness: "뒷공간", clock: clock(minute) };
}

describe("경기 화면 좌표 변환", () => {
  it("사용자 배치 수와 핵심 선수 표시를 보존하고 좌표를 피치 안으로 제한한다", () => {
    const players = userPitchPlayers("za-kor-2026", [
      { playerId: "kim-seung-gyu", slot: { x: -20, y: 140 } },
      { playerId: "son-heung-min", slot: { x: 120, y: -10 } },
    ], new Set(["son-heung-min"]));

    expect(players).toHaveLength(2);
    expect(players.map((player) => ({ x: player.x, y: player.y }))).toEqual([{ x: 4, y: 94 }, { x: 96, y: 6 }]);
    expect(players.map((player) => player.isKeyPlayer)).toEqual([false, true]);
  });

  it("다섯 시나리오에서 상대 열한 명과 마주 보는 골키퍼를 만든다", () => {
    expect(SCENARIOS).toHaveLength(5);
    for (const scenario of SCENARIOS) {
      const userGoalkeeper = userPitchPlayers(scenario.id, initialPlacements(scenario.id), new Set()).find((player) => player.position === "GK");
      const opponentGoalkeeper = opponentPitchPlayers(scenario).find((player) => player.position === "GK");

      expect(opponentPitchPlayers(scenario)).toHaveLength(11);
      expect(userGoalkeeper?.x).toBe(5);
      expect(opponentGoalkeeper?.x).toBe(95);
    }
  });

  it("사건 사실만으로 경기 초점을 고정한다", () => {
    const cases: readonly { readonly events: readonly MatchEvent[]; readonly minute: number; readonly expected: { readonly x: number; readonly y: number } }[] = [
      { events: [], minute: 60, expected: { x: 50, y: 50 } },
      { events: [chance("user", 57)], minute: 60, expected: { x: 50, y: 50 } },
      { events: [goal("user", 60)], minute: 60, expected: { x: 84, y: 50 } },
      { events: [chance("opponent", 59)], minute: 60, expected: { x: 16, y: 50 } },
      { events: [penaltyAttempt("user", 75)], minute: 76, expected: { x: 84, y: 50 } },
    ];

    for (const testCase of cases) expect(matchFocusPoint(testCase.events, testCase.minute)).toEqual(testCase.expected);
    // 결정론은 같은 호출을 자기 자신과 비교해서는 증명되지 않는다. 사건 배열의 순서와 사본이 달라도
    // 같은 사실이면 같은 초점이 나오는지를 본다.
    const first = matchFocusPoint([chance("user", 58), chance("opponent", 59)], 60);
    const second = matchFocusPoint([{ ...chance("user", 58) }, { ...chance("opponent", 59) }], 60);
    expect(first).toEqual(second);
    expect(first).not.toEqual(matchFocusPoint([chance("user", 59)], 60));
  });

  it("골, 반격, 찬스 순서로 강조하고 진영을 보존한다", () => {
    expect(emphasisFrom([chance("user", 60), counter(60), goal("opponent", 60)])).toBe("opponentGoal");
    expect(emphasisFrom([chance("user", 60), counter(60)])).toBe("counter");
    expect(emphasisFrom([chance("user", 60)])).toBe("userChance");
    expect(emphasisFrom([chance("opponent", 60)])).toBe("opponentChance");
    expect(emphasisFrom([])).toBe("none");
  });

  it("교체 투입 선수와 남아공전의 손흥민을 핵심 선수로 남긴다", () => {
    const substitution: SubstitutionEvent = { type: "substitution", side: "user", outId: "oh-hyeon-gyu", inId: "son-heung-min", clock: clock(62) };

    expect(keyPlayerIdsFrom(SCENARIOS[0]!, [substitution]).has("son-heung-min")).toBe(true);
    expect(keyPlayerIdsFrom(SCENARIOS[1]!, [substitution]).has("son-heung-min")).toBe(true);
  });
});
