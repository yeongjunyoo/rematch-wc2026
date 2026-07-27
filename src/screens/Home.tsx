import { SCENARIOS } from "../data/scenarios";
import { useAgentSnapshot } from "../agent/bridge";

export function Home() {
  useAgentSnapshot({
    screen: "home",
    headline: "REMATCH, 손흥민이 벤치에 있던 그 밤을 당신이 다시 지휘한다",
    affordances: [...SCENARIOS.map((scenario) => `${scenario.userTeam.displayName} 벤치, ${scenario.interventionStartMinute}분`), "도움말과 데이터 안내"],
    detail: Object.fromEntries(SCENARIOS.map((scenario, index) => [`경기${index + 1}`, `${scenario.displayTitle}, ${scenario.interventionStartMinute}분 ${scenario.startingUserGoals}대${scenario.startingOpponentGoals}, ${scenario.mission.brief}`])),
    feed: [],
  });

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">월드컵 전술 리매치</p>
        <h1>REMATCH</h1>
        <p className="hook">손흥민이 벤치에 있던 그 밤을, 당신이 다시 지휘한다</p>
      </header>

      <section aria-labelledby="scenario-heading">
        <div className="section-heading">
          <p className="eyebrow">다섯 개의 결정적 순간</p>
          <h2 id="scenario-heading">벤치에 앉을 경기</h2>
        </div>
        <div className="scenario-grid">
          {SCENARIOS.map((scenario, index) => (
            <article className={`scenario-card${index === 0 ? " featured" : ""}`} key={scenario.id}>
              {index === 0 ? <p className="featured-label">첫 번째 리매치</p> : null}
              <h3>{scenario.displayTitle}</h3>
              <dl className="scenario-meta">
                <div><dt>지휘 팀</dt><dd>{scenario.userTeam.displayName}</dd></div>
                <div><dt>이어받는 시점</dt><dd>{scenario.interventionStartMinute}분, {scenario.startingUserGoals}대{scenario.startingOpponentGoals}</dd></div>
              </dl>
              <p className="mission">{scenario.mission.brief}</p>
              <p className="history-note">{scenario.historyNote}</p>
              <a className="button-link" href={`#/match/${scenario.id}`}>{scenario.userTeam.displayName} 벤치, {scenario.interventionStartMinute}분</a>
            </article>
          ))}
        </div>
      </section>

      <footer className="page-footer">
        <a href="#/help">도움말과 데이터 안내</a>
      </footer>
    </main>
  );
}
