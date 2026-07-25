import type { DecidedPhase, GradeRequirement } from "../domain/types";
import { getScenario } from "../data/scenarios";

interface ReportProps {
  scenarioId: string;
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

export function Report({ scenarioId }: ReportProps) {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return <main className="page narrow-page"><h1>시나리오를 찾을 수 없습니다.</h1><a href="#/">홈으로 돌아가기</a></main>;
  }
  const terminal = scenario.actualTerminal;

  return (
    <main className="page">
      <header className="screen-header"><p className="eyebrow">결과 리포트</p><h1>{scenario.displayTitle}</h1></header>
      <section className="report-section" aria-labelledby="actual-result"><h2 id="actual-result">실제 역사 결과</h2>
        <table><tbody>
          <tr><th>스코어</th><td>{scenario.userTeam.displayName} {terminal.userGoals} : {terminal.opponentGoals} {scenario.opponentTeam.displayName}</td></tr>
          <tr><th>사용자 관점 결과</th><td>{terminal.userResult === "win" ? "우리가 이겼습니다" : terminal.userResult === "draw" ? "비겼습니다" : "우리가 졌습니다"}</td></tr>
          <tr><th>결정 국면</th><td>{phaseLabels[terminal.decidedPhase]}</td></tr>
          {terminal.shootout ? <tr><th>승부차기</th><td>{terminal.shootout.userScore} : {terminal.shootout.opponentScore}</td></tr> : null}
          {terminal.derivedOutcome ? <tr><th>진출 규칙</th><td>{terminal.derivedOutcome.achieved ? "달성" : "미달성"}, {terminal.derivedOutcome.statement}</td></tr> : null}
        </tbody></table>
      </section>
      <section className="report-section"><h2>나의 결과</h2><p>아직 플레이하지 않음</p></section>
      <section className="report-section"><h2>미션과 등급</h2><p>{scenario.mission.brief}</p><ul className="grade-list">{scenario.mission.gradeCutlines.map((cutline) => <li key={cutline.grade}><strong>{cutline.grade} 등급</strong><span>{requirementLabel(cutline.requirement)}</span></li>)}</ul></section>
      <nav className="screen-nav" aria-label="화면 이동"><a className="button-link" href={`#/match/${scenario.id}`}>매치룸으로 돌아가기</a><a href="#/">홈으로 돌아가기</a></nav>
    </main>
  );
}
