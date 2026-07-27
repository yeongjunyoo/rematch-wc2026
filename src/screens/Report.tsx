import { compareToHistory, evaluateGrade } from "../domain/outcome";
import { bestGrade, loadRecords } from "../domain/records";
import type { DecidedPhase, GradeRequirement, Intervention, MatchEvent, MatchState, TerminalFacts } from "../domain/types";
import { getScenario } from "../data/scenarios";
import { useAgentSnapshot } from "../agent/bridge";
import { clockLabel, commentaryFor, isHighlight } from "../ui/commentary";
import { recallResult } from "../ui/matchResult";
import type { StoredMatchResult } from "../ui/matchResult";
import { matchHash } from "../router";
import { buildReportInsight } from "../ui/reportInsight";
import "../ui/report.css";

interface ReportProps {
  scenarioId: string;
  attemptIndex: number;
}

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

function loadResult(scenarioId: string, attemptIndex: number): StoredMatchResult | null {
  return recallResult(scenarioId, attemptIndex).result;
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
  // 예전 형식의 저장본에는 개입 내역이 없다. 그것은 개입을 안 했다는 뜻이 아니라
  // 기록이 남지 않았다는 뜻이므로 부정 사실로 바꾸지 않고 알 수 없음으로 유지한다.
  const decisionsRecoverable = result?.interventions !== undefined;
  const insight = scenario === undefined || mine === null || result === null || !decisionsRecoverable
    ? null
    : buildReportInsight({ scenario, terminal: mine, timeline: result.timeline, interventions: result.interventions ?? [] });
  const tallyOnly = scenario === undefined || mine === null || result === null || decisionsRecoverable
    ? null
    : buildReportInsight({ scenario, terminal: mine, timeline: result.timeline, interventions: [] });
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
          why: insight?.why ?? null,
          nextTry: insight?.nextTry ?? null,
          interventionCount: insight?.decisions.length ?? 0,
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
        <>
          <section className="report-section rp-summary">
            <h2>나의 결과</h2>
            <p className="rp-outcome">{resultLabel(mine)}, {comparison?.headline}</p>
            <p className="grade-result" aria-label={`등급 ${grade}`}>{grade} 등급</p>
            <ResultRows terminal={mine} scenarioId={scenarioId} />
            {previousBest === null || previousBest === grade ? null : <p className="best-grade">이 경기에서 남긴 최고 등급은 {previousBest}입니다.</p>}
            {result?.matchCode === undefined ? null : (
              <p className="match-code-line">매치 코드 <code className="match-code">{result.matchCode}</code></p>
            )}
          </section>

          <section className="report-section">
            <h2>내가 바꾼 것</h2>
            {insight === null ? (
              <p className="rp-empty">이 결과는 개입 내역을 남기지 않던 예전 형식으로 저장되어 무엇을 바꿨는지 복원할 수 없습니다. 새 리매치를 시작하면 이 기록이 남습니다.</p>
            ) : insight.decisions.length === 0 ? (
              <p className="rp-empty">확정한 개입이 없습니다. 다음 시도에서는 전술 하나를 바꿔 결과를 비교해 보세요.</p>
            ) : (
              <ol className="rp-decisions">{insight.decisions.map((decision) => (
                <li className="rp-decision" key={decision.tokenIndex}>
                  <h3>{decision.headline}</h3>
                  {decision.changes.length === 0 ? <p>기록할 전술 변화가 없습니다.</p> : <ul className="rp-changes">{decision.changes.map((change) => <li key={change}>{change}</li>)}</ul>}
                </li>
              ))}</ol>
            )}
          </section>

          <section className="report-section">
            <h2>왜 이렇게 끝났나</h2>
            <p className="rp-why">{(insight ?? tallyOnly)?.why}</p>
            {/*
              이 집계는 이어받은 시점 이후에 일어난 것만 센다. 그 사실을 밝히지 않으면
              최종 스코어 0대1 옆에 상대 득점 0골이 나란히 서서 사용자가 모순으로 읽는다.
            */}
            <p className="rp-tally-scope">{scenario.interventionStartMinute}분에 이어받은 뒤 기록된 것만 셉니다. 그 전의 {scenario.startingUserGoals}대{scenario.startingOpponentGoals}은 이미 벌어진 일입니다.</p>
            <dl className="rp-tally">
              <div><dt>우리 찬스</dt><dd>{(insight ?? tallyOnly)?.tally.userChances}번</dd></div>
              <div><dt>상대 찬스</dt><dd>{(insight ?? tallyOnly)?.tally.opponentChances}번</dd></div>
              <div><dt>우리 득점</dt><dd>{(insight ?? tallyOnly)?.tally.userGoalsScored}골</dd></div>
              <div><dt>상대 득점</dt><dd>{(insight ?? tallyOnly)?.tally.opponentGoalsScored}골</dd></div>
              <div><dt>상대 반격</dt><dd>{(insight ?? tallyOnly)?.tally.aiCounters}번</dd></div>
              <div><dt>교체</dt><dd>{(insight ?? tallyOnly)?.tally.substitutions}번</dd></div>
            </dl>
          </section>

          <section className="report-section">
            <h2>다음에 뭘 바꿀까</h2>
            <p className="rp-next">{insight === null ? "이 결과는 개입 내역이 없어 다음 수를 제안할 수 없습니다. 새 리매치를 시작해 보세요." : insight.nextTry}</p>
            <nav className="screen-nav rp-next-action"><a className="button-link" href={matchHash(scenarioId, nextAttempt)}>새 리매치 시작</a></nav>
          </section>
        </>
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
        {mine === null ? <a className="button-link" href={matchHash(scenarioId, nextAttempt)}>새 리매치 시작</a> : null}
        {mine === null ? null : <a href={matchHash(scenarioId, attemptIndex)}>같은 경기 다시 보기</a>}
        <a href="#/hall-of-fame">명예의 전당</a>
        <a href="#/">홈으로 돌아가기</a>
      </nav>
    </main>
  );
}
