import { describe, expect, it } from "vitest";
import { getScenario } from "../../src/data/scenarios";
import type { Intervention, MatchClock, MatchEvent, ScenarioDeclaration, TacticalDirectives, TerminalFacts } from "../../src/domain/types";
import { buildReportInsight } from "../../src/ui/reportInsight";

const loadedScenario = getScenario("za-kor-2026");
if (loadedScenario === undefined) throw new Error("남아공 시나리오가 필요합니다.");
const scenario: ScenarioDeclaration = loadedScenario;

const neutral: TacticalDirectives = { defensiveLine: 0, pressing: 0, tempo: 0, attackRoute: 0, mindset: 0 };
const attacking: TacticalDirectives = { defensiveLine: 2, pressing: 0, tempo: 1, attackRoute: 0, mindset: 0 };
const terminal: TerminalFacts = { userGoals: 1, opponentGoals: 2, shootout: null, decidedPhase: "regulation", userResult: "loss", derivedOutcome: null };

function clock(minute: number): MatchClock {
  return { phase: "regulation", minute, absoluteMinute: minute, shootoutRound: null };
}

function intervention(tokenIndex: number, directives: TacticalDirectives = neutral, substitutions: Intervention["substitutions"] = [], formation: Intervention["formation"] = "3-5-2"): Intervention {
  return { tokenIndex, atMinute: 63 + tokenIndex, directives, formation, placements: [], substitutions };
}

function input(interventions: readonly Intervention[], timeline: readonly MatchEvent[] = [], source: ScenarioDeclaration = scenario) {
  return { scenario: source, terminal, timeline, interventions };
}

const timeline: readonly MatchEvent[] = [
  { type: "chance", side: "user", shooterId: "son-heung-min", quality: 0.5, converted: false, clock: clock(64) },
  { type: "chance", side: "user", shooterId: "lee-kang-in", quality: 0.4, converted: false, clock: clock(70) },
  { type: "chance", side: "opponent", shooterId: "za-9", quality: 0.4, converted: false, clock: clock(72) },
  { type: "goal", side: "user", scorerId: "son-heung-min", kind: "openPlay", clock: clock(74) },
  { type: "goal", side: "opponent", scorerId: "za-9", kind: "openPlay", clock: clock(78) },
  { type: "aiCounter", side: "opponent", counteredWhat: "압박", exposedWeakness: "뒷공간", clock: clock(75) },
  { type: "substitution", side: "user", outId: "oh-hyeon-gyu", inId: "son-heung-min", clock: clock(63) },
];

describe("결과 리포트 인사이트", () => {
  it("교체와 실제 타임라인 수치를 보존한다", () => {
    const insight = buildReportInsight(input([intervention(0, attacking, [{ outId: "oh-hyeon-gyu", inId: "son-heung-min" }], "4-2-3-1")], timeline));

    expect(insight.decisions).toHaveLength(1);
    expect(insight.decisions[0]?.changes).toContain("오현규 대신 손흥민 투입");
    expect(insight.decisions[0]?.changes).toContain("포메이션 3-5-2에서 4-2-3-1");
    expect(insight.decisions[0]?.changes).toContain("수비 라인 높게");
    expect(insight.decisions[0]?.changes).toContain("템포 다이렉트");
    expect(insight.decisions[0]?.changes).not.toContain("압박 강도 전방 압박");
    expect(insight.tally.userChances).toBe(2);
    expect(insight.tally.opponentChances).toBe(1);
    expect(insight.tally.userGoalsScored).toBe(1);
    expect(insight.tally.opponentGoalsScored).toBe(1);
    expect(insight.tally.aiCounters).toBe(1);
    expect(insight.tally.substitutions).toBe(1);
  });

  it("바뀌지 않은 포메이션과 지시는 결정 목록에서 뺀다", () => {
    const insight = buildReportInsight(input([intervention(0)]));

    expect(insight.decisions[0]?.changes).not.toContain("포메이션 3-5-2에서 3-5-2");
    expect(insight.decisions[0]?.changes).toEqual([]);
  });

  it("개입하지 않은 사실을 왜와 다음 시도에 적는다", () => {
    const insight = buildReportInsight(input([]));

    expect(insight.decisions).toEqual([]);
    expect(insight.why).toContain("확정한 개입은 없었습니다");
    expect(insight.nextTry).toContain("개입 토큰 3개를 남겼습니다");
  });

  it.each([
    { name: "토큰을 남긴 경우", interventions: [intervention(0)], expected: "개입 토큰 2개를 남겼습니다" },
    { name: "토큰을 모두 쓴 경우", interventions: [intervention(0), intervention(1), intervention(2)], expected: "교체 카드를 쓰지 않았습니다" },
  ])("$name 다음 시도가 다르다", ({ interventions, expected }) => {
    expect(buildReportInsight(input(interventions)).nextTry).toContain(expected);
  });

  it("독립적으로 구성한 같은 입력에는 같은 출력을 낸다", () => {
    const first = input([intervention(0, attacking, [{ outId: "oh-hyeon-gyu", inId: "son-heung-min" }], "4-2-3-1")], [...timeline]);
    const second = input([intervention(0, { ...attacking }, [{ outId: "oh-hyeon-gyu", inId: "son-heung-min" }], "4-2-3-1")], timeline.map((event) => ({ ...event })));

    expect(first).not.toBe(second);
    expect(first.interventions).not.toBe(second.interventions);
    expect(first.timeline).not.toBe(second.timeline);
    expect(buildReportInsight(first)).toEqual(buildReportInsight(second));
  });
});
