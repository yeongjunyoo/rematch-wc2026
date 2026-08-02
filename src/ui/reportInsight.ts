import { NEUTRAL_DIRECTIVES } from "../domain/types";
import type { FormationPreset, Intervention, MatchEvent, Placement, ScenarioDeclaration, TacticalDirectives, TerminalFacts } from "../domain/types";
import { directiveWeights } from "../domain/ratings";
import { defaultFormation, initialPlacements, squadFor } from "./squad";
import { directionParticle } from "./commentary";

export interface DecisionSummary {
  readonly tokenIndex: number;
  readonly minute: number;
  readonly headline: string;
  readonly changes: readonly string[];
}

export interface MatchTally {
  readonly userChances: number;
  readonly opponentChances: number;
  readonly userGoalsScored: number;
  readonly opponentGoalsScored: number;
  readonly aiCounters: number;
  readonly substitutions: number;
}

/** 마지막으로 확정한 전술이 계수상 무엇을 바꾸도록 되어 있었는지. */
export interface TacticEffect {
  /** 우리 기회량 배수의 백분율 변화. 0이면 중립과 같다. */
  readonly chanceShift: number;
  /** 상대에게 내주는 위험 배수의 백분율 변화. */
  readonly exposureShift: number;
  readonly summary: string;
}

export interface ReportInsight {
  readonly tacticEffect: TacticEffect | null;
  readonly decisions: readonly DecisionSummary[];
  readonly tally: MatchTally;
  readonly why: string;
  readonly nextTry: string;
}

const directiveLabels = {
  defensiveLine: { label: "수비 라인", low: "낮게", high: "높게" },
  pressing: { label: "압박 강도", low: "소극", high: "전방 압박" },
  tempo: { label: "템포", low: "점유", high: "다이렉트" },
  attackRoute: { label: "공격 루트", low: "중앙", high: "측면" },
  mindset: { label: "마인드셋", low: "수비", high: "공격" },
} as const;

type DirectiveKey = keyof typeof directiveLabels;

const directiveKeys: readonly DirectiveKey[] = ["defensiveLine", "pressing", "tempo", "attackRoute", "mindset"];

/** 경기당 개입 토큰 수. 화면과 리포트가 서로 다른 숫자를 세면 사용자가 규칙을 믿지 못한다. */
export const INTERVENTION_TOKEN_BUDGET = 3;

function playerLabels(scenarioId: string): ReadonlyMap<string, string> {
  const squad = squadFor(scenarioId);
  return new Map([...squad.starters, ...squad.bench].map((player) => [player.id, player.label]));
}

function labelFor(players: ReadonlyMap<string, string>, id: string): string {
  return players.get(id) ?? id;
}

/** 직전 지시와 달라진 축만 서술한다. 유지된 축은 그 시점의 결정이 아니다. */
function directiveChanges(previous: TacticalDirectives, next: TacticalDirectives): readonly string[] {
  return directiveKeys.flatMap((key) => {
    const before = previous[key];
    const after = next[key];
    if (before === after) return [];
    const copy = directiveLabels[key];
    if (after === 0) return [`${copy.label} 중립으로`];
    return [`${copy.label} ${after < 0 ? copy.low : copy.high}`];
  });
}

/** 직전 배치와 달라진 선수. 위치 이동이나 맞교환만 확정한 개입도 유효한 결정이다. */
function placementChanges(
  previous: readonly Placement[],
  next: readonly Placement[],
  substituted: ReadonlySet<string>,
  players: ReadonlyMap<string, string>,
): readonly string[] {
  const before = new Map(previous.map((placement) => [placement.playerId, placement.slot]));
  const moved = next
    .filter((placement) => !substituted.has(placement.playerId))
    .filter((placement) => {
      const slot = before.get(placement.playerId);
      // 교체로 새로 들어온 선수는 교체 문구가 이미 설명한다. 여기서 또 세지 않는다.
      if (slot === undefined) return false;
      return slot.x !== placement.slot.x || slot.y !== placement.slot.y;
    })
    .map((placement) => labelFor(players, placement.playerId));
  if (moved.length === 0) return [];
  if (moved.length <= 3) return [`${moved.join(", ")} 위치 조정`];
  return [`선수 ${moved.length}명 위치 조정`];
}

interface EditorState {
  readonly formation: FormationPreset;
  readonly directives: TacticalDirectives;
  readonly placements: readonly Placement[];
}

function decisionFor(intervention: Intervention, previous: EditorState, players: ReadonlyMap<string, string>): DecisionSummary {
  const substitutions = intervention.substitutions.map((substitution) =>
    `${labelFor(players, substitution.outId)} 대신 ${labelFor(players, substitution.inId)} 투입`,
  );
  const substituted = new Set(intervention.substitutions.map((substitution) => substitution.inId));
  const formation = intervention.formation === previous.formation ? [] : [`포메이션 ${previous.formation}에서 ${intervention.formation}`];
  const directives = directiveChanges(previous.directives, intervention.directives);
  const placements = placementChanges(previous.placements, intervention.placements, substituted, players);
  const changes = [...substitutions, ...formation, ...directives, ...placements];
  const headlineParts = [
    ...intervention.substitutions.map((substitution) => `${labelFor(players, substitution.inId)} 투입`),
    ...formation.map(() => `${directionParticle(intervention.formation)} 전환`),
    ...directives,
    ...placements,
  ];
  const headline = headlineParts.length === 0 ? `${intervention.atMinute}분, 전술을 확정` : `${intervention.atMinute}분, ${headlineParts.join("하고 ")}`;
  return { tokenIndex: intervention.tokenIndex, minute: intervention.atMinute, headline, changes };
}

function tallyFor(timeline: readonly MatchEvent[]): MatchTally {
  return timeline.reduce<MatchTally>((tally, event) => {
    if (event.type === "chance") {
      return event.side === "user"
        ? { ...tally, userChances: tally.userChances + 1 }
        : { ...tally, opponentChances: tally.opponentChances + 1 };
    }
    if (event.type === "goal") {
      return event.side === "user"
        ? { ...tally, userGoalsScored: tally.userGoalsScored + 1 }
        : { ...tally, opponentGoalsScored: tally.opponentGoalsScored + 1 };
    }
    if (event.type === "aiCounter") return { ...tally, aiCounters: tally.aiCounters + 1 };
    if (event.type === "substitution") return { ...tally, substitutions: tally.substitutions + 1 };
    return tally;
  }, { userChances: 0, opponentChances: 0, userGoalsScored: 0, opponentGoalsScored: 0, aiCounters: 0, substitutions: 0 });
}

function whyFor(terminal: TerminalFacts, tally: MatchTally, hasDecisions: boolean): string {
  const result = terminal.userResult === "win" ? "승리" : terminal.userResult === "draw" ? "무승부" : "패배";
  const lines = [`최종 스코어 ${terminal.userGoals}대${terminal.opponentGoals}, ${result}로 끝났습니다.`, `기록된 찬스는 우리 ${tally.userChances}번, 상대 ${tally.opponentChances}번입니다.`];
  if (!hasDecisions) lines.push("확정한 개입은 없었습니다.");
  if (tally.userChances > 0 && tally.userGoalsScored === 0) lines.push("기록된 우리 찬스에서는 골이 나오지 않았습니다.");
  if (tally.userChances === 0) lines.push("기록된 우리 찬스가 없습니다.");
  if (tally.aiCounters > 0) lines.push(`상대 반격은 ${tally.aiCounters}번 기록됐습니다.`);
  return lines.join(" ");
}

function nextTryFor(scenario: ScenarioDeclaration, interventions: readonly Intervention[]): string {
  const remainingTokens = Math.max(0, INTERVENTION_TOKEN_BUDGET - interventions.length);
  if (remainingTokens > 0) return `개입 토큰 ${remainingTokens}개를 남겼습니다. 다음 시도에서는 남은 토큰으로 다른 전술을 확정해 보세요.`;
  if (!interventions.some((intervention) => intervention.substitutions.length > 0)) return "교체 카드를 쓰지 않았습니다. 다음 시도에서는 교체로 변화를 시험해 보세요.";
  if (!interventions.some((intervention) => directiveKeys.some((key) => intervention.directives[key] !== 0))) return "지시를 바꾸지 않았습니다. 다음 시도에서는 지시 한 축을 바꿔 시험해 보세요.";
  if (scenario.id === "za-kor-2026" && !interventions.some((intervention) => intervention.substitutions.some((substitution) => substitution.inId === "son-heung-min"))) return "손흥민을 투입하지 않았습니다. 다음 시도에서는 그 선택을 시험해 보세요.";
  return "다음 시도 번호에서 같은 전술을 다시 시험해 보세요.";
}

/**
 * 전술 설정과 실제 관측을 나란히 둔다.
 * 인과를 단정하지 않는다. 계수는 시뮬레이션이 실제로 쓴 값이고 사건 수는 실제로 일어난 것이며,
 * 둘을 붙여 보여주는 것까지가 사실이다. 그 사이의 해석은 사용자 몫이다.
 */
function tacticEffectFor(interventions: readonly Intervention[], timeline: readonly MatchEvent[]): TacticEffect | null {
  const latest = [...interventions].sort((left, right) => left.tokenIndex - right.tokenIndex).pop();
  if (latest === undefined) return null;
  // 마지막 전술이 지배한 구간의 사건만 센다. 경기 전체를 붙이면 그 전술이 있기도 전의
  // 사건까지 그 전술의 효과라고 말하게 된다.
  const tally = tallyFor(timeline.filter((event) => event.clock.absoluteMinute >= latest.atMinute));
  const weights = directiveWeights(latest.directives);
  const chanceShift = Math.round((weights.userChance - 1) * 100);
  const exposureShift = Math.round((weights.concede - 1) * 100);
  const move = (value: number) => value === 0 ? "그대로" : value > 0 ? `${value}퍼센트 높게` : `${Math.abs(value)}퍼센트 낮게`;
  return {
    chanceShift,
    exposureShift,
    summary: `마지막에 확정한 지시는 우리 기회를 ${move(chanceShift)}, 상대에게 내주는 위험을 ${move(exposureShift)} 설정한 것이었습니다. 그 뒤 ${latest.atMinute}분부터 끝까지 우리 기회는 ${tally.userChances}번, 상대 기회는 ${tally.opponentChances}번 기록됐습니다.`,
  };
}

export function buildReportInsight(input: {
  readonly scenario: ScenarioDeclaration;
  readonly terminal: TerminalFacts;
  readonly timeline: readonly MatchEvent[];
  readonly interventions: readonly Intervention[];
}): ReportInsight {
  const players = playerLabels(input.scenario.id);
  // 각 개입은 그 직전 상태와 비교해야 그 시점에 실제로 내린 결정이 된다.
  let state: EditorState = {
    formation: defaultFormation(input.scenario.id),
    directives: NEUTRAL_DIRECTIVES,
    placements: initialPlacements(input.scenario.id),
  };
  const decisions: DecisionSummary[] = [];
  for (const intervention of [...input.interventions].sort((left, right) => left.tokenIndex - right.tokenIndex)) {
    decisions.push(decisionFor(intervention, state, players));
    state = { formation: intervention.formation, directives: intervention.directives, placements: intervention.placements };
  }
  const tally = tallyFor(input.timeline);
  return {
    tacticEffect: tacticEffectFor(input.interventions, input.timeline),
    decisions,
    tally,
    why: whyFor(input.terminal, tally, decisions.length > 0),
    nextTry: nextTryFor(input.scenario, input.interventions),
  };
}
