import { compareToHistory, evaluateGrade } from "../domain/outcome";
import { bestGrade, loadRecords } from "../domain/records";
import type { DecidedPhase, GradeRequirement, MatchEvent, MatchState, TerminalFacts } from "../domain/types";
import { getScenario } from "../data/scenarios";
import { useAgentSnapshot } from "../agent/bridge";
import { clockLabel, commentaryFor, isHighlight } from "../ui/commentary";
import { matchHash } from "../router";

interface ReportProps {
  scenarioId: string;
  attemptIndex: number;
}

type StoredResult = {
  readonly state: MatchState;
  readonly timeline: readonly MatchEvent[];
  readonly matchCode?: string;
};

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

function loadResult(scenarioId: string, attemptIndex: number): StoredResult | null {
  try {
    const raw = window.sessionStorage.getItem(`rematch:result:${scenarioId}:${attemptIndex}`);
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

export function Report({ scenarioId, attemptIndex }: ReportProps) {
  const scenario = getScenario(scenarioId);
  const result = scenario === undefined ? null : loadResult(scenarioId, attemptIndex);
  const mine = result?.state.terminal ?? null;
  const comparison = scenario === undefined || mine === null ? null : compareToHistory(scenario.actualTerminal, mine);
  const grade = scenario === undefined || mine === null ? null : evaluateGrade(scenario.mission, mine);
  const highlights = result?.timeline.filter(isHighlight) ?? [];
  const previousBest = bestGrade(loadRecords(), scenarioId);
  const nextAttempt = scenario === undefined ? 0 : (attemptIndex + 1) % scenario.publishedSeedDeck.length;

  useAgentSnapshot(
    scenario === undefined
      ? { screen: "notFound", affordances: ["홈으로 돌아가기"], headline: "시나리오를 찾을 수 없습니다", detail: {}, feed: [] }
      : {
        screen: "report",
        headline: `${scenario.displayTitle} 결과 리포트`,
        affordances: mine === null
          ? ["매치룸으로 가기", "새 리매치 시작", "명예의 전당", "홈으로 돌아가기"]
          : ["새 리매치 시작", "같은 경기 다시 보기", "명예의 전당", "홈으로 돌아가기"],
        detail: {
          시도: attemptIndex + 1,
          결과있음: mine !== null,
          등급: grade,
          내점수: mine?.userGoals ?? null,
          상대점수: mine?.opponentGoals ?? null,
          결정국면: mine === null ? null : phaseLabels[mine.decidedPhase],
          역사대비: comparison?.headline ?? null,
          실제역사: `${scenario.actualTerminal.userGoals}대${scenario.actualTerminal.opponentGoals}, ${phaseLabels[scenario.actualTerminal.decidedPhase]}`,
          이전최고등급: previousBest,
          매치코드: result?.matchCode ?? null,
        },
        feed: highlights.map((event) => `${clockLabel(event.clock)} ${commentaryFor(event, scenario)}`),
      },
  );

  if (!scenario) {
    return <main className="page narrow-page"><h1>시나리오를 찾을 수 없습니다.</h1><a href="#/">홈으로 돌아가기</a></main>;
  }

  return (
    <main className="page">
      <header className="screen-header">
        <p className="eyebrow">결과 리포트, {attemptIndex + 1}번째 시도</p>
        <h1>{scenario.displayTitle}</h1>
      </header>

      {mine === null ? (
        <section className="report-section">
          <h2>아직 이 시도의 결과가 없습니다</h2>
          <p>매치룸에서 경기를 끝까지 진행하면 여기에 결과가 남습니다. 결과는 브라우저 세션에만 저장되므로 탭을 닫으면 사라집니다.</p>
          <nav className="screen-nav"><a className="button-link" href={matchHash(scenarioId, attemptIndex)}>매치룸으로 가기</a></nav>
        </section>
      ) : (
        <section className="report-section">
          <h2>나의 결과</h2>
          <ResultRows terminal={mine} scenarioId={scenarioId} />
          <p className="result-headline">{comparison!.headline}</p>
          <p className="grade-result" aria-label={`등급 ${grade}`}>{grade} 등급</p>
          {previousBest === null || previousBest === grade ? null : <p className="best-grade">이 경기에서 남긴 최고 등급은 {previousBest}입니다.</p>}
          {result?.matchCode === undefined ? null : (
            <p className="match-code-line">매치 코드 <code className="match-code">{result.matchCode}</code></p>
          )}
        </section>
      )}

      <section className="report-section" aria-labelledby="actual-result">
        <h2 id="actual-result">실제 역사 결과</h2>
        <ResultRows terminal={scenario.actualTerminal} scenarioId={scenarioId} />
        <p className="history-note">{scenario.historyNote}</p>
      </section>

      {mine === null ? null : (
        <section className="report-section">
          <h2>하이라이트</h2>
          <ol className="event-feed">{highlights.map((event, index) => (
            <li key={`${event.type}-${index}`}><b>{clockLabel(event.clock)}</b> {commentaryFor(event, scenario)}</li>
          ))}</ol>
        </section>
      )}

      <section className="report-section">
        <h2>미션과 등급</h2>
        <p>{scenario.mission.brief}</p>
        <ul className="grade-list">{scenario.mission.gradeCutlines.map((cutline) => (
          <li key={cutline.grade}><strong>{cutline.grade} 등급</strong><span>{requirementLabel(cutline.requirement)}</span></li>
        ))}</ul>
      </section>

      <nav className="screen-nav" aria-label="화면 이동">
        <a className="button-link" href={matchHash(scenarioId, nextAttempt)}>새 리매치 시작</a>
        <a href={matchHash(scenarioId, attemptIndex)}>같은 경기 다시 보기</a>
        <a href="#/hall-of-fame">명예의 전당</a>
        <a href="#/">홈으로 돌아가기</a>
      </nav>
    </main>
  );
}
