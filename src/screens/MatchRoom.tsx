import { useEffect, useState } from "react";
import { getScenario } from "../data/scenarios";
import { deriveWorldSeed } from "../domain/rng";
import { simulateToTerminal } from "../domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../domain/types";
import type { FormationPreset, Intervention, MatchEvent, MatchState, Placement, TacticalDirectives } from "../domain/types";
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

function eventDescription(event: MatchEvent): string {
  const minute = event.clock.phase === "shootout" ? `${event.clock.shootoutRound ?? 1}번 킥` : `${event.clock.absoluteMinute}분`;
  switch (event.type) {
    case "goal": return `${minute} ${event.side === "user" ? "우리 팀" : "상대"} 득점`;
    case "card": return `${minute} ${event.side === "user" ? "우리 팀" : "상대"} 카드`;
    case "phaseChange": return `${minute} ${event.to === "extraTime" ? "연장전 시작" : event.to === "shootout" ? "승부차기 시작" : "경기 종료"}`;
    case "penaltyAttempt": return `${minute} ${event.side === "user" ? "우리 팀" : "상대"} 승부차기 ${event.result === "scored" ? "성공" : "실패"}`;
    case "aiCounter": return `${minute} 상대 반격: ${event.counteredWhat}, ${event.exposedWeakness} 노출`;
    case "intervention": return `${minute} ${event.summary}`;
    case "substitution": return `${minute} 우리 팀 교체`;
    case "chance": return `${minute} ${event.side === "user" ? "우리 팀" : "상대"} 찬스 ${event.converted ? "득점" : "무산"}`;
  }
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

function initialState(scenario: NonNullable<ReturnType<typeof getScenario>>): MatchState {
  return {
    clock: { phase: "regulation", minute: scenario.interventionStartMinute, absoluteMinute: scenario.interventionStartMinute, shootoutRound: null },
    userGoals: scenario.startingUserGoals,
    opponentGoals: scenario.startingOpponentGoals,
    shootout: null,
    events: [],
    tokensRemaining: 3,
    userDirectives: NEUTRAL_DIRECTIVES,
    opponentDirectives: NEUTRAL_DIRECTIVES,
    ai: { responseBudget: 2, cooldownUntilMinute: scenario.interventionStartMinute, lastObserved: null, observationLagMinutes: 2, riskTolerance: 1 },
    terminal: null,
  };
}

export function MatchRoom({ scenarioId }: MatchRoomProps) {
  const scenario = getScenario(scenarioId);
  const [tokensRemaining, setTokensRemaining] = useState(3);
  const [formation, setFormation] = useState<FormationPreset>(() => defaultFormation(scenarioId));
  const [placements, setPlacements] = useState<readonly Placement[]>(() => scenario === undefined ? [] : initialPlacements(scenarioId));
  const [directives, setDirectives] = useState<TacticalDirectives>(NEUTRAL_DIRECTIVES);
  const [interventions, setInterventions] = useState<readonly Intervention[]>([]);
  const [timeline, setTimeline] = useState<readonly MatchEvent[]>([]);
  const [isDugoutOpen, setDugoutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (scenario === undefined) return;
    setTokensRemaining(3);
    setFormation(defaultFormation(scenarioId));
    setPlacements(initialPlacements(scenarioId));
    setDirectives(NEUTRAL_DIRECTIVES);
    setInterventions([]);
    setTimeline([]);
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
    const scheduled = { ...intervention, atMinute: scenario.interventionStartMinute };
    setFormation(scheduled.formation);
    setPlacements(scheduled.placements);
    setDirectives(scheduled.directives);
    setInterventions((current) => [...current, scheduled]);
    setTokensRemaining((current) => current - 1);
    setDugoutOpen(false);
    setNotice(`개입 ${scheduled.tokenIndex + 1}을 적용했습니다. 진행을 눌러 종료까지 확인하세요.`);
  };

  const progressMatch = () => {
    const world = deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, "d2", "d2");
    const result = simulateToTerminal({ scenario, world, interventions, startState: initialState(scenario) });
    sessionStorage.setItem(`rematch:result:${scenario.id}`, JSON.stringify({ state: result.state, timeline: result.timeline }));
    setTimeline(result.timeline);
    setNotice("경기가 종료되었습니다. 결과 리포트로 이동합니다.");
    window.setTimeout(() => { window.location.hash = `#/report/${scenario.id}`; }, 600);
  };

  return (
    <main className="page">
      <p className="shell-notice">전술 개입을 확정한 뒤 진행을 누르면 결정론적 시뮬레이션이 종료까지 이어집니다.</p>
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
          <button type="button" className="button-link intervention-button" onClick={progressMatch}>진행</button>
          {notice === null ? null : <p className="match-notice" role="status">{notice}</p>}
        </div>
        <Pitch />
      </section>
      {timeline.length === 0 ? null : <section className="report-section" aria-live="polite"><h2>진행 해설</h2><ol className="event-feed">{timeline.filter((event) => event.type !== "chance" || event.converted).map((event, index) => <li key={`${event.type}-${index}`}>{eventDescription(event)}</li>)}</ol></section>}
      <nav className="screen-nav" aria-label="화면 이동">
        <a className="button-link" href={`#/report/${scenario.id}`}>결과 리포트</a>
        <a href="#/">홈으로 돌아가기</a>
      </nav>
      {!isDugoutOpen ? null : <Dugout scenarioId={scenarioId} tokenIndex={3 - tokensRemaining} initialFormation={formation} initialPlacements={placements} initialDirectives={directives} onConfirm={applyIntervention} onClose={() => setDugoutOpen(false)} />}
    </main>
  );
}
