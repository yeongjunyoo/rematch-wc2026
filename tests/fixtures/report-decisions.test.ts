import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchEvent, TacticalDirectives, TerminalFacts } from "../../src/domain/types";
import { buildReportInsight } from "../../src/ui/reportInsight";
import { defaultFormation, initialPlacements } from "../../src/ui/squad";

const scenario = SCENARIOS[0]!;

const terminal: TerminalFacts = {
  userGoals: 0,
  opponentGoals: 1,
  shootout: null,
  decidedPhase: "regulation",
  userResult: "loss",
  derivedOutcome: { achieved: false, statement: "녹아웃 진출에 실패했습니다." },
};

function intervention(overrides: Partial<Intervention> & { tokenIndex: number }): Intervention {
  return {
    atMinute: 63,
    directives: NEUTRAL_DIRECTIVES,
    formation: defaultFormation(scenario.id),
    placements: initialPlacements(scenario.id),
    substitutions: [],
    ...overrides,
  };
}

function insight(interventions: readonly Intervention[], timeline: readonly MatchEvent[] = []) {
  return buildReportInsight({ scenario, terminal, timeline, interventions });
}

const attacking: TacticalDirectives = { ...NEUTRAL_DIRECTIVES, defensiveLine: 2 };

/**
 * 리포트가 "내가 바꾼 것"을 말할 때 그 시점에 실제로 내린 결정만 말해야 한다.
 * 최초 상태와 비교하면 유지한 선택을 다시 바꾼 것처럼 쓰고 되돌린 선택은 지운다.
 * 둘 다 사용자에게 하지 않은 일을 했다고 말하는 것이라 눈으로는 잡히지 않는다.
 */
describe("결정 요약은 직전 상태와 비교한다", () => {
  it("포메이션을 바꾼 뒤 유지하면 두 번째 개입에는 포메이션이 안 적힌다", () => {
    const built = insight([
      intervention({ tokenIndex: 0, formation: "4-2-3-1" }),
      intervention({ tokenIndex: 1, formation: "4-2-3-1", directives: attacking }),
    ]);
    expect(built.decisions[0]!.changes.some((change) => change.includes("포메이션"))).toBe(true);
    expect(built.decisions[1]!.changes.some((change) => change.includes("포메이션"))).toBe(false);
    expect(built.decisions[1]!.changes.some((change) => change.includes("수비 라인"))).toBe(true);
  });

  it("지시를 올렸다가 중립으로 되돌리면 그 되돌림이 기록된다", () => {
    const built = insight([
      intervention({ tokenIndex: 0, directives: attacking }),
      intervention({ tokenIndex: 1, directives: NEUTRAL_DIRECTIVES }),
    ]);
    expect(built.decisions[0]!.changes).toContain("수비 라인 높게");
    expect(built.decisions[1]!.changes).toContain("수비 라인 중립으로");
  });

  it("배치만 바꾼 개입도 결정으로 기록된다", () => {
    const base = initialPlacements(scenario.id);
    const first = base[1]!;
    const second = base[2]!;
    const swapped = base.map((placement) =>
      placement.playerId === first.playerId
        ? { playerId: first.playerId, slot: second.slot }
        : placement.playerId === second.playerId
          ? { playerId: second.playerId, slot: first.slot }
          : placement,
    );
    const built = insight([intervention({ tokenIndex: 0, placements: swapped })]);
    expect(built.decisions[0]!.changes.length).toBeGreaterThan(0);
    expect(built.decisions[0]!.changes.some((change) => change.includes("위치 조정"))).toBe(true);
  });

  it("교체로 들어온 선수는 위치 조정으로 중복 기록되지 않는다", () => {
    const base = initialPlacements(scenario.id);
    const outgoing = base[base.length - 1]!;
    const withSon = base.map((placement) =>
      placement.playerId === outgoing.playerId ? { playerId: "son-heung-min", slot: placement.slot } : placement,
    );
    const built = insight([intervention({
      tokenIndex: 0,
      placements: withSon,
      substitutions: [{ outId: outgoing.playerId, inId: "son-heung-min" }],
    })]);
    const changes = built.decisions[0]!.changes;
    expect(changes.some((change) => change.includes("손흥민") && change.includes("투입"))).toBe(true);
    expect(changes.filter((change) => change.includes("손흥민"))).toHaveLength(1);
  });

  it("아무것도 안 바꾼 개입은 변화 목록이 비어 있다", () => {
    const built = insight([intervention({ tokenIndex: 0 })]);
    expect(built.decisions[0]!.changes).toEqual([]);
  });

  it("개입이 없으면 결정도 없고 왜 이렇게 끝났나가 그 사실을 담는다", () => {
    const built = insight([]);
    expect(built.decisions).toEqual([]);
    expect(built.why).toContain("확정한 개입은 없었습니다");
  });

  it("토큰을 다 쓰면 남은 토큰을 권하지 않는다", () => {
    const spent = insight([
      intervention({ tokenIndex: 0, directives: attacking }),
      intervention({ tokenIndex: 1, formation: "4-2-3-1" }),
      intervention({ tokenIndex: 2, formation: "3-4-3" }),
    ]);
    expect(spent.nextTry).not.toContain("토큰");
    const left = insight([intervention({ tokenIndex: 0, directives: attacking })]);
    expect(left.nextTry).toContain("토큰");
  });

  it("같은 사실이면 같은 요약이 나온다", () => {
    const build = () => insight(
      [intervention({ tokenIndex: 0, formation: "4-2-3-1", directives: attacking })],
      [{ type: "chance", side: "user", shooterId: "x", quality: 0.2, converted: false, clock: { phase: "regulation", minute: 70, absoluteMinute: 70, shootoutRound: null } }],
    );
    expect(build()).toEqual(build());
  });
});
