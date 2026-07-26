import { compareToHistory, evaluateGrade } from "../domain/outcome";
import type { DecidedPhase, GradeRequirement, MatchEvent, MatchState, TerminalFacts } from "../domain/types";
import { getScenario } from "../data/scenarios";

interface ReportProps {
  scenarioId: string;
}

type StoredResult = { readonly state: MatchState; readonly timeline: readonly MatchEvent[] };

const phaseLabels: Record<DecidedPhase, string> = {
  regulation: "정규시간",
  extraTime: "연장",
  goldenGoal: "골든골",
  shootout: "승부차기",
};

function requirementLabel(requirement: GradeRequirement): string {
  switch (requirement.kind) {
    case "derivedAchieved": return "진출 규칙을 달성";
    case "userResult": return requirement.result === "win" ? "승리" : requirement.result === "draw" ? "무승부" : "패배";
    case "goalDifferenceAtLeast": return `${requirement.value}골 차 이상 승리`;
    case "decidedBy": return `${phaseLabels[requirement.phase]}에 결정`;
    case "always": return "경기를 마침";
  }
}

function resultLabel(terminal: TerminalFacts): string {
  return terminal.userResult === "win" ? "우리가 이겼습니다" : terminal.userResult === "draw" ? "비겼습니다" : "우리가 졌습니다";
}

function eventLabel(event: MatchEvent): string {
  const time = event.clock.phase === "shootout" ? `${event.clock.shootoutRound ?? 1}번 킥` : `${event.clock.absoluteMinute}분`;
  switch (event.type) {
    case "goal": return `${time} ${event.side === "user" ? "우리 팀" : "상대"} 득점`;
    case "card": return `${time} ${event.side === "user" ? "우리 팀" : "상대"} 카드`;
    case "phaseChange": return `${time} ${event.to === "extraTime" ? "연장전 시작" : event.to === "shootout" ? "승부차기 시작" : "경기 종료"}`;
    case "penaltyAttempt": return `${time} ${event.side === "user" ? "우리 팀" : "상대"} 킥 ${event.result === "scored" ? "성공" : "실패"}`;
    case "aiCounter": return `${time} 상대 반격, ${event.exposedWeakness} 노출`;
    case "intervention": return `${time} ${event.summary}`;
    case "substitution": return `${time} 우리 팀 교체`;
    case "chance": return `${time} ${event.side === "user" ? "우리 팀" : "상대"} 찬스`;
  }
}

function loadResult(scenarioId: string): StoredResult | null {
  try {
    const raw = sessionStorage.getItem(`rematch:result:${scenarioId}`);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed) || !("timeline" in parsed)) return null;
    const candidate = parsed as StoredResult;
    return candidate.state.terminal === null ? null : candidate;
  } catch {
    return null;
  }
}

function ResultRows({ terminal, scenarioId }: { readonly terminal: TerminalFacts; readonly scenarioId: string }) {
  const scenario = getScenario(scenarioId)!;
  return <table><tbody>
    <tr><th>스코어</th><td>{scenario.userTeam.displayName} {terminal.userGoals} : {terminal.opponentGoals} {scenario.opponentTeam.displayName}</td></tr>
    <tr><th>사용자 관점 결과</th><td>{resultLabel(terminal)}</td></tr>
    <tr><th>결정 국면</th><td>{phaseLabels[terminal.decidedPhase]}</td></tr>
    {terminal.shootout ? <tr><th>승부차기</th><td>{terminal.shootout.userScore} : {terminal.shootout.opponentScore}</td></tr> : null}
    {terminal.derivedOutcome ? <tr><th>진출 규칙</th><td>{terminal.derivedOutcome.achieved ? "달성" : "미달성"}, {terminal.derivedOutcome.statement}</td></tr> : null}
  </tbody></table>;
}

export function Report({ scenarioId }: ReportProps) {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return <main className="page narrow-page"><h1>시나리오를 찾을 수 없습니다.</h1><a href="#/">홈으로 돌아가기</a></main>;
  }
  const result = loadResult(scenarioId);
  const mine = result?.state.terminal ?? null;
  const comparison = mine === null ? null : compareToHistory(scenario.actualTerminal, mine);
  const grade = mine === null ? null : evaluateGrade(scenario.mission, mine);
  const highlights = result?.timeline.filter((event) => event.type === "goal" || event.type === "card" || event.type === "phaseChange" || event.type === "penaltyAttempt" || event.type === "aiCounter") ?? [];

  return (
    <main className="page">
      <header className="screen-header"><p className="eyebrow">결과 리포트</p><h1>{scenario.displayTitle}</h1></header>
      <section className="report-section" aria-labelledby="actual-result"><h2 id="actual-result">실제 역사 결과</h2><ResultRows terminal={scenario.actualTerminal} scenarioId={scenarioId} /></section>
      <section className="report-section"><h2>나의 결과</h2>{mine === null ? <p>아직 플레이하지 않음</p> : <>
        <ResultRows terminal={mine} scenarioId={scenarioId} />
        <p className="result-headline">{comparison!.headline}</p>
        <p className="grade-result" aria-label={`등급 ${grade}`}>{grade} 등급</p>
      </>}</section>
      {mine === null ? null : <section className="report-section"><h2>하이라이트</h2><ol className="event-feed">{highlights.map((event, index) => <li key={`${event.type}-${index}`}>{eventLabel(event)}</li>)}</ol></section>}
      <section className="report-section"><h2>미션과 등급</h2><p>{scenario.mission.brief}</p><ul className="grade-list">{scenario.mission.gradeCutlines.map((cutline) => <li key={cutline.grade}><strong>{cutline.grade} 등급</strong><span>{requirementLabel(cutline.requirement)}</span></li>)}</ul></section>
      <nav className="screen-nav" aria-label="화면 이동"><a className="button-link" href={`#/match/${scenario.id}`}>매치룸으로 돌아가기</a><a href="#/">홈으로 돌아가기</a></nav>
    </main>
  );
}
