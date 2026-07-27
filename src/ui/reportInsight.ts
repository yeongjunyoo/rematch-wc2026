import type { Intervention, MatchEvent, ScenarioDeclaration, TerminalFacts } from "../domain/types";
import { defaultFormation, squadFor } from "./squad";

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

export interface ReportInsight {
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

function playerLabels(scenarioId: string): ReadonlyMap<string, string> {
  const squad = squadFor(scenarioId);
  return new Map([...squad.starters, ...squad.bench].map((player) => [player.id, player.label]));
}

function labelFor(players: ReadonlyMap<string, string>, id: string): string {
  return players.get(id) ?? id;
}

function directiveChanges(intervention: Intervention): readonly string[] {
  return directiveKeys.flatMap((key) => {
    const value = intervention.directives[key];
    if (value === 0) return [];
    const copy = directiveLabels[key];
    return [`${copy.label} ${value < 0 ? copy.low : copy.high}`];
  });
}

function decisionFor(intervention: Intervention, initialFormation: string, players: ReadonlyMap<string, string>): DecisionSummary {
  const substitutions = intervention.substitutions.map((substitution) =>
    `${labelFor(players, substitution.outId)} 대신 ${labelFor(players, substitution.inId)} 투입`,
  );
  const formation = intervention.formation === initialFormation ? [] : [`포메이션 ${initialFormation}에서 ${intervention.formation}`];
  const changes = [...substitutions, ...formation, ...directiveChanges(intervention)];
  const headlineParts = [
    ...intervention.substitutions.map((substitution) => `${labelFor(players, substitution.inId)} 투입`),
    ...formation.map(() => `${intervention.formation}로 전환`),
    ...directiveChanges(intervention),
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
  const remainingTokens = Math.max(0, 3 - interventions.length);
  if (remainingTokens > 0) return `개입 토큰 ${remainingTokens}개를 남겼습니다. 다음 시도에서는 남은 토큰으로 다른 전술을 확정해 보세요.`;
  if (!interventions.some((intervention) => intervention.substitutions.length > 0)) return "교체 카드를 쓰지 않았습니다. 다음 시도에서는 교체로 변화를 시험해 보세요.";
  if (!interventions.some((intervention) => directiveKeys.some((key) => intervention.directives[key] !== 0))) return "지시를 바꾸지 않았습니다. 다음 시도에서는 지시 한 축을 바꿔 시험해 보세요.";
  if (scenario.id === "za-kor-2026" && !interventions.some((intervention) => intervention.substitutions.some((substitution) => substitution.inId === "son-heung-min"))) return "손흥민을 투입하지 않았습니다. 다음 시도에서는 그 선택을 시험해 보세요.";
  return "다음 시도 번호에서 같은 전술을 다시 시험해 보세요.";
}

export function buildReportInsight(input: {
  readonly scenario: ScenarioDeclaration;
  readonly terminal: TerminalFacts;
  readonly timeline: readonly MatchEvent[];
  readonly interventions: readonly Intervention[];
}): ReportInsight {
  const players = playerLabels(input.scenario.id);
  const initialFormation = defaultFormation(input.scenario.id);
  const decisions = input.interventions
    .slice()
    .sort((left, right) => left.tokenIndex - right.tokenIndex)
    .map((intervention) => decisionFor(intervention, initialFormation, players));
  const tally = tallyFor(input.timeline);
  return {
    decisions,
    tally,
    why: whyFor(input.terminal, tally, decisions.length > 0),
    nextTry: nextTryFor(input.scenario, input.interventions),
  };
}
