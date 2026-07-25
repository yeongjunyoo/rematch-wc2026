import { getScenario } from "../data/scenarios";

interface MatchRoomProps {
  scenarioId: string;
}

function formatDescription(extraTimeRule: "none" | "fullExtraTime" | "suddenDeath", shootoutOnTie: boolean): string {
  const extraTime = extraTimeRule === "none"
    ? "연장전 없이 정규시간으로 끝납니다"
    : extraTimeRule === "suddenDeath"
      ? "연장전은 골든골 방식입니다"
      : "동점이면 연장전 30분을 치릅니다";
  return `${extraTime}. ${shootoutOnTie ? "연장전 뒤 동점이면 승부차기를 합니다" : "승부차기는 없습니다"}.`;
}

function Pitch() {
  return (
    <svg className="pitch" viewBox="0 0 100 64" role="img" aria-label="비어 있는 축구 피치">
      <rect x="1" y="1" width="98" height="62" rx="2" className="pitch-grass" />
      <rect x="1" y="1" width="98" height="62" rx="2" className="pitch-line" />
      <path d="M50 1v62M1 20h16v24H1M99 20H83v24h16M1 27h6v10H1M99 27h-6v10h6" className="pitch-line" />
      <circle cx="50" cy="32" r="9" className="pitch-line" />
      <circle cx="50" cy="32" r=".8" className="pitch-line fill-line" />
    </svg>
  );
}

export function MatchRoom({ scenarioId }: MatchRoomProps) {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    return <main className="page narrow-page"><h1>시나리오를 찾을 수 없습니다.</h1><a href="#/">홈으로 돌아가기</a></main>;
  }

  return (
    <main className="page">
      <p className="shell-notice">이 화면은 아직 셸이며 조작은 다음 단계에서 연결됩니다.</p>
      <header className="screen-header">
        <p className="eyebrow">매치룸</p>
        <h1>{scenario.displayTitle}</h1>
      </header>
      <section className="match-layout">
        <div className="match-details">
          <div className="scoreboard" aria-label="이어받는 시점의 스코어">
            <span>{scenario.userTeam.displayName}</span><strong>{scenario.startingUserGoals} : {scenario.startingOpponentGoals}</strong><span>{scenario.opponentTeam.displayName}</span>
          </div>
          <dl className="match-meta">
            <div><dt>현재 시간</dt><dd>{scenario.interventionStartMinute}분</dd></div>
            <div><dt>경기 형식</dt><dd>{formatDescription(scenario.format.extraTimeRule, scenario.format.shootoutOnTie)}</dd></div>
          </dl>
          <div className="token-row" aria-label="개입 토큰 3개"><span>개입 토큰</span><b>1</b><b>2</b><b>3</b></div>
        </div>
        <Pitch />
      </section>
      <nav className="screen-nav" aria-label="화면 이동">
        <a className="button-link" href={`#/report/${scenario.id}`}>결과 리포트 미리보기</a>
        <a href="#/">홈으로 돌아가기</a>
      </nav>
    </main>
  );
}
