import { useEffect, useState } from "react";
import { getScenario } from "../data/scenarios";
import type { FormationPreset, Intervention, Placement, TacticalDirectives } from "../domain/types";
import { NEUTRAL_DIRECTIVES } from "../domain/types";
import { defaultFormation, initialPlacements } from "../ui/squad";
import { Dugout } from "./Dugout";

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
    <svg className="pitch" viewBox="0 0 100 64" role="img" aria-label="경기 진행 전술판">
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
  const [tokensRemaining, setTokensRemaining] = useState(3);
  const [formation, setFormation] = useState<FormationPreset>(() => defaultFormation(scenarioId));
  const [placements, setPlacements] = useState<readonly Placement[]>(() => scenario === undefined ? [] : initialPlacements(scenarioId));
  const [directives, setDirectives] = useState<TacticalDirectives>(NEUTRAL_DIRECTIVES);
  const [isDugoutOpen, setDugoutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (scenario === undefined) return;
    setTokensRemaining(3);
    setFormation(defaultFormation(scenarioId));
    setPlacements(initialPlacements(scenarioId));
    setDirectives(NEUTRAL_DIRECTIVES);
    setDugoutOpen(false);
    setNotice(null);
  }, [scenario, scenarioId]);

  useEffect(() => {
    if (!isDugoutOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isDugoutOpen]);

  if (!scenario) {
    return <main className="page narrow-page"><h1>시나리오를 찾을 수 없습니다.</h1><a href="#/">홈으로 돌아가기</a></main>;
  }

  const openDugout = () => {
    if (tokensRemaining === 0) {
      setNotice("개입 토큰을 모두 사용했습니다. 현재 전술로 경기를 이어가세요.");
      return;
    }
    setNotice(null);
    setDugoutOpen(true);
  };

  const applyIntervention = (intervention: Intervention) => {
    setFormation(intervention.formation);
    setPlacements(intervention.placements);
    setDirectives(intervention.directives);
    setTokensRemaining((current) => current - 1);
    setDugoutOpen(false);
    setNotice(`개입 ${intervention.tokenIndex + 1}을 적용했습니다. 시뮬레이션 진행은 다음 단계에서 연결됩니다.`);
  };

  return (
    <main className="page">
      <p className="shell-notice">전술 개입을 편집하고 확정할 수 있습니다. 경기 시뮬레이션 진행은 아직 연결되지 않았습니다.</p>
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
            <div><dt>현재 포메이션</dt><dd>{formation}</dd></div>
          </dl>
          <div className="token-row" aria-label={`개입 토큰 ${tokensRemaining}개 남음`}><span>개입 토큰</span>{[1, 2, 3].map((token) => <b key={token} className={token <= tokensRemaining ? "" : "is-spent"}>{token}</b>)}</div>
          <button type="button" className="button-link intervention-button" onClick={openDugout}>개입</button>
          {notice === null ? null : <p className="match-notice" role="status">{notice}</p>}
        </div>
        <Pitch />
      </section>
      <nav className="screen-nav" aria-label="화면 이동">
        <a className="button-link" href={`#/report/${scenario.id}`}>결과 리포트 미리보기</a>
        <a href="#/">홈으로 돌아가기</a>
      </nav>
      {!isDugoutOpen ? null : <Dugout scenarioId={scenarioId} tokenIndex={3 - tokensRemaining} initialFormation={formation} initialPlacements={placements} initialDirectives={directives} onConfirm={applyIntervention} onClose={() => setDugoutOpen(false)} />}
    </main>
  );
}
