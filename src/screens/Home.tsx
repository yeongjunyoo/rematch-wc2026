import { SCENARIOS } from "../data/scenarios";
import { useAgentSnapshot } from "../agent/bridge";
import "../ui/home.css";

function scenarioActionLabel(scenario: (typeof SCENARIOS)[number]): string {
  return `${scenario.userTeam.displayName} 벤치, ${scenario.interventionStartMinute}분`;
}

const SCENARIO_AFFORDANCES = SCENARIOS.map(scenarioActionLabel);

/** 대표 경기. 제목과 첫 카드가 같은 선언을 읽어야 순서가 바뀌어도 제목이 거짓이 되지 않는다. */
const FEATURED = SCENARIOS[0]!;

/**
 * 첫 카드의 상황 한 줄.
 * 선언된 사실에서만 만든다. 문장을 박아 두면 시나리오 순서가 바뀔 때 그대로 거짓말이 된다.
 */
function situationLine(scenario: (typeof SCENARIOS)[number]): string {
  const { startingUserGoals: mine, startingOpponentGoals: theirs } = scenario;
  const standing = mine < theirs ? "지고 있습니다" : mine > theirs ? "이기고 있습니다" : "비기고 있습니다";
  return `${scenario.interventionStartMinute}분, ${scenario.userTeam.displayName}은 ${mine}대${theirs}로 ${standing}.`;
}

export function Home() {
  useAgentSnapshot({
    screen: "home",
    headline: "REMATCH, 손흥민이 벤치에 있던 그 밤을 당신이 다시 지휘한다. 월드컵의 결정적 순간에서 전술로 결과를 다시 쓰는 게임",
    affordances: [...SCENARIO_AFFORDANCES, "경기 기록 보기", "도움말과 데이터 안내"],
    detail: Object.fromEntries(SCENARIOS.map((scenario, index) => [
      `경기${index + 1}`,
      `${scenario.userTeam.displayName} 대 ${scenario.opponentTeam.displayName}, 실제 결과 ${scenario.actualTerminal.userGoals}대${scenario.actualTerminal.opponentGoals}, 지휘 팀 ${scenario.userTeam.displayName}, 이어받는 시점 ${scenario.interventionStartMinute}분 ${scenario.startingUserGoals}대${scenario.startingOpponentGoals}, 미션 ${scenario.mission.brief}`,
    ])),
    feed: [],
  });

  return (
    <main className="page hm-page">
      <header className="hero hm-hero">
        <p className="eyebrow">월드컵 전술 리매치</p>
        <h1>REMATCH</h1>
        <p className="hook">손흥민이 벤치에 있던 그 밤을, 당신이 다시 지휘한다</p>
        <p className="hm-what">월드컵의 결정적 순간에서 전술로 결과를 다시 쓰는 게임</p>
      </header>

      <section aria-labelledby="scenario-heading">
        <div className="section-heading hm-section-heading">
          <p className="eyebrow">먼저, 이 한 경기를 지휘하세요</p>
          <h2 id="scenario-heading">{FEATURED.interventionStartMinute}분, 당신의 선택이 시작됩니다</h2>
        </div>
        <div className="hm-grid">
          {SCENARIOS.map((scenario, index) => (
            <article className={`hm-card${index === 0 ? " hm-card-featured" : ""}`} key={scenario.id}>
              {index === 0 ? <p className="hm-featured-label">첫 번째 리매치</p> : null}
              <h3>{scenario.userTeam.displayName} 대 {scenario.opponentTeam.displayName}</h3>
              <p className="hm-actual">실제 결과 {scenario.actualTerminal.userGoals}대{scenario.actualTerminal.opponentGoals}</p>
              <p className="hm-meta">{scenario.userTeam.displayName} 지휘, {scenario.interventionStartMinute}분부터, {scenario.startingUserGoals}대{scenario.startingOpponentGoals}</p>
              {index === 0 ? <p className="hm-situation">{situationLine(scenario)}</p> : null}
              <p className="hm-mission">{scenario.mission.brief}</p>
              <details className="hm-history">
                <summary>경기 기록 보기</summary>
                <p>{scenario.historyNote}</p>
              </details>
              <a className="button-link hm-action" href={`#/match/${scenario.id}`}>{scenarioActionLabel(scenario)}</a>
            </article>
          ))}
        </div>
      </section>

      <footer className="page-footer hm-footer">
        <a href="#/help">도움말과 데이터 안내</a>
      </footer>
    </main>
  );
}
