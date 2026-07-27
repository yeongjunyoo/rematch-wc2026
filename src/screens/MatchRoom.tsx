import { useEffect, useMemo, useRef, useState } from "react";
import { getScenario } from "../data/scenarios";
import { useAgentSnapshot } from "../agent/bridge";
import { saveRecord } from "../domain/records";
import { buildMatchCode, deriveWorldSeed, formatMatchCode } from "../domain/rng";
import { commitIntervention, createRuntime, isFinished, runToTerminal, tickRuntime } from "../domain/simulate";
import type { MatchRuntime } from "../domain/simulate";
import { evaluateGrade } from "../domain/outcome";
import { NEUTRAL_DIRECTIVES } from "../domain/types";
import type { FormationPreset, Intervention, MatchEvent, MatchState, Placement, ScenarioDeclaration, TacticalDirectives } from "../domain/types";
import { DATA_VERSION, ENGINE_VERSION } from "../domain/version";
import { clockLabel, commentaryFor, isFeedWorthy, phaseLabel } from "../ui/commentary";
import { defaultFormation, initialPlacements, squadFor } from "../ui/squad";
import { rememberResult } from "../ui/matchResult";
import { matchHash, reportHash } from "../router";
import { LivePitch } from "../ui/LivePitch";
import type { LivePitchProps } from "../ui/LivePitch";
import { MatchHud } from "../ui/MatchHud";
import type { MatchSpeed } from "../ui/MatchHud";
import { emphasisFrom, keyPlayerIdsFrom, matchFocusPoint, opponentPitchPlayers, userPitchPlayers } from "../ui/matchView";
import { Dugout } from "./Dugout";

interface MatchRoomProps {
  scenarioId: string;
  attemptIndex: number;
}

/** 1배속에서 경기 1분이 흐르는 실제 시간. 한 경기가 몇 분 안에 끝나야 심사자가 끝까지 본다. */
const TICK_BASE_MS = 720;
type Speed = MatchSpeed;

/** 골과 상대 반격은 잠깐 멈춰 세워야 "내 결정이 만든 장면"으로 읽힌다. */
const BEAT_HOLD_MS = 1700;

/** 피치 강조는 배너보다 짧게 유지한다. 길면 다음 장면과 겹쳐 무엇이 방금 일어났는지 흐려진다. */
const EMPHASIS_HOLD_MS = 1100;

interface Beat {
  readonly tone: "goal" | "concede" | "counter";
  readonly headline: string;
  readonly detail: string;
}

function formatDescription(scenario: ScenarioDeclaration): string {
  const extraTime = scenario.format.extraTimeRule === "none"
    ? "연장전 없이 정규시간으로 끝납니다"
    : scenario.format.extraTimeRule === "suddenDeath"
      ? "연장전은 골든골 방식입니다"
      : "동점이면 연장전 30분을 치릅니다";
  return `${extraTime}. ${scenario.format.shootoutOnTie ? "연장전 뒤 동점이면 승부차기를 합니다" : "승부차기는 없습니다"}.`;
}

function initialState(scenario: ScenarioDeclaration): MatchState {
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

function freshRuntime(scenario: ScenarioDeclaration, attemptIndex: number): MatchRuntime {
  const world = deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, ENGINE_VERSION, DATA_VERSION);
  return createRuntime(scenario, world, initialState(scenario));
}

export function MatchRoom({ scenarioId, attemptIndex }: MatchRoomProps) {
  const scenario = getScenario(scenarioId);
  const [runtime, setRuntime] = useState<MatchRuntime | null>(() => scenario === undefined ? null : freshRuntime(scenario, attemptIndex));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [beat, setBeat] = useState<Beat | null>(null);
  // 피치 강조는 연출 배너와 수명이 다르다. 배너는 멈춰 세우고, 강조는 흐름을 끊지 않는다.
  const [emphasis, setEmphasis] = useState<LivePitchProps["emphasis"]>("none");
  // 개입을 한 번도 하지 않은 채 경기가 흘러갈 때 한 번만 멈춰 세운다. 두 번 이상 막으면 방해가 된다.
  const [decisionPrompt, setDecisionPrompt] = useState(false);
  const promptedOnce = useRef(false);
  const [formation, setFormation] = useState<FormationPreset>(() => defaultFormation(scenarioId));
  const [placements, setPlacements] = useState<readonly Placement[]>(() => scenario === undefined ? [] : initialPlacements(scenarioId));
  const [directives, setDirectives] = useState<TacticalDirectives>(NEUTRAL_DIRECTIVES);
  const [isDugoutOpen, setDugoutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seenEventCount = useRef(0);
  const resumeAfterBeat = useRef(false);

  const matchCode = useMemo(
    () => runtime === null ? "" : formatMatchCode(buildMatchCode(runtime.world)),
    [runtime],
  );

  // 시나리오나 시도가 바뀌면 이전 경기의 흔적을 남기지 않는다.
  useEffect(() => {
    if (scenario === undefined) return;
    setRuntime(freshRuntime(scenario, attemptIndex));
    setPlaying(false);
    setSpeed(1);
    setBeat(null);
    setEmphasis("none");
    setDecisionPrompt(false);
    promptedOnce.current = false;
    setFormation(defaultFormation(scenario.id));
    setPlacements(initialPlacements(scenario.id));
    setDirectives(NEUTRAL_DIRECTIVES);
    setDugoutOpen(false);
    setNotice(null);
    seenEventCount.current = 0;
    resumeAfterBeat.current = false;
  }, [attemptIndex, scenario]);

  useEffect(() => {
    if (!isDugoutOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isDugoutOpen]);

  const finished = runtime !== null && isFinished(runtime);

  // 경기 시계. 더그아웃이 열려 있거나 연출이 진행 중이면 시간은 흐르지 않는다.
  useEffect(() => {
    if (runtime === null || finished || !playing || isDugoutOpen || beat !== null || decisionPrompt) return undefined;
    const interval = window.setInterval(
      () => setRuntime((current) => current === null || isFinished(current) ? current : tickRuntime(current)),
      Math.round(TICK_BASE_MS / speed),
    );
    return () => window.clearInterval(interval);
  }, [beat, decisionPrompt, finished, isDugoutOpen, playing, runtime === null, speed]);

  // 새로 생긴 사건 중 멈춰 세울 것을 고른다.
  useEffect(() => {
    if (runtime === null || scenario === undefined) return;
    const events = runtime.state.events;
    if (events.length <= seenEventCount.current) {
      seenEventCount.current = events.length;
      return;
    }
    const fresh = events.slice(seenEventCount.current);
    seenEventCount.current = events.length;
    setEmphasis(emphasisFrom(fresh));
    const applied = runtime.interventions.slice(0, runtime.appliedCount);
    const lastDecision = applied.length === 0 ? null : applied[applied.length - 1]!.atMinute;
    const next = beatFor(fresh, scenario, lastDecision);
    if (next === null) return;
    resumeAfterBeat.current = playing;
    setBeat(next);
  }, [beat, playing, runtime, scenario]);

  useEffect(() => {
    if (beat === null) return undefined;
    const timer = window.setTimeout(() => {
      setBeat(null);
      if (resumeAfterBeat.current) setPlaying(true);
    }, BEAT_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [beat]);

  // 개입 없이 다섯 분이 지나면 한 번 멈춰 세운다. 사용자가 화면을 탐색하지 않아도
  // 이 게임의 핵심 행동을 만나게 하는 유일한 경로다.
  useEffect(() => {
    if (runtime === null || scenario === undefined || finished || promptedOnce.current) return;
    if (runtime.interventions.length > 0) { promptedOnce.current = true; return; }
    const elapsed = runtime.state.clock.absoluteMinute - scenario.interventionStartMinute;
    if (elapsed < 3) return;
    promptedOnce.current = true;
    setPlaying(false);
    setDecisionPrompt(true);
  }, [finished, runtime, scenario]);

  // 강조는 스스로 꺼진다. 계속 켜져 있으면 그건 강조가 아니라 배경이다.
  useEffect(() => {
    if (emphasis === "none") return undefined;
    const timer = window.setTimeout(() => setEmphasis("none"), EMPHASIS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [emphasis]);

  // 종료되면 결과를 넘기고 기록을 남긴다.
  useEffect(() => {
    if (runtime === null || scenario === undefined || runtime.state.terminal === null) return;
    setPlaying(false);
    const terminal = runtime.state.terminal;
    const code = formatMatchCode(buildMatchCode(runtime.world));
    rememberResult(scenario.id, attemptIndex, {
      state: runtime.state,
      timeline: runtime.state.events,
      // 리포트가 내 결정이 무엇이었는지를 말하려면 확정한 개입이 결과에 함께 실려야 한다.
      // 이것이 없어 축구 팬 페르소나가 리포트에 내가 손흥민을 투입했다는 기록조차 없다고 했다.
      interventions: runtime.interventions.slice(0, runtime.appliedCount),
      matchCode: code,
      attemptIndex,
    });
    saveRecord({
      scenarioId: scenario.id,
      scenarioTitle: scenario.displayTitle,
      attemptIndex,
      matchCode: code,
      grade: evaluateGrade(scenario.mission, terminal),
      userGoals: terminal.userGoals,
      opponentGoals: terminal.opponentGoals,
      decidedPhase: terminal.decidedPhase,
      derivedAchieved: terminal.derivedOutcome === null ? null : terminal.derivedOutcome.achieved,
      savedAt: Date.now(),
    });
  }, [attemptIndex, runtime, scenario]);

  // 스냅샷은 조기 반환보다 위에서 발행되므로 여기서 쓰는 값도 그 위에서 계산한다.
  const promptQuickSub = runtime === null || scenario === undefined || isFinished(runtime)
    ? null
    : quickSubstitution(scenarioId, formation, placements, 0, directives);

  // 에이전트가 읽는 스냅샷. 훅이므로 조기 반환보다 위에 있어야 하고, 그래서
  // 시나리오가 없는 경우도 여기서 함께 표현한다.
  useAgentSnapshot(
    scenario === undefined || runtime === null
      ? { screen: "notFound", affordances: ["홈으로 돌아가기"], headline: "시나리오를 찾을 수 없습니다", detail: {}, feed: [] }
      : {
        screen: "match",
        headline: `${scenario.userTeam.displayName} 대 ${scenario.opponentTeam.displayName}`,
        affordances: (() => {
          // 더그아웃이 열려 있으면 뒤 화면 조작은 눌리지 않는다. 스냅샷이 그것들을 계속 발행하면
          // 에이전트는 사람이 못 누르는 것을 누르려 하고, 사람이 누를 수 있는 것은 보지 못한다.
          if (isDugoutOpen) {
            // 더그아웃에서 사람이 실제로 누를 수 있는 것은 탭과 버튼만이 아니라
            // 벤치 카드와 피치 토큰이다. 그것들을 빼면 자동 플레이테스트는 사람이
            // 할 수 있는 교체를 할 수 없는 상태로 게임을 평가하게 된다.
            const roster = squadFor(scenarioId);
            const onPitch = new Set(placements.map((placement) => placement.playerId));
            const benchNames = roster.bench.filter((player) => !onPitch.has(player.id)).map((player) => player.label);
            const pitchNames = placements
              .map((placement) => [...roster.starters, ...roster.bench].find((player) => player.id === placement.playerId)?.label)
              .filter((label): label is string => label !== undefined);
            return ["포메이션", "팀 지시", "개입 확정", "취소", "닫기", ...benchNames, ...pitchNames];
          }
          if (decisionPrompt) return [...(promptQuickSub === null ? [] : [`${promptQuickSub.incoming} 투입`]), "전술 직접 바꾸기", "이대로 본다"];
          if (isFinished(runtime)) return ["결과 리포트 보기", "새 리매치 시작", "홈으로 돌아가기"];
          const notStarted = runtime.state.clock.absoluteMinute === scenario.interventionStartMinute && runtime.state.events.length === 0;
          if (notStarted) return ["전술 바꾸기", "경기 재개", "끝까지 건너뛰기", "홈으로 돌아가기"];
          return [playing ? "일시정지" : "경기 재개", "전술 바꾸기", "끝까지 건너뛰기", "1배속", "2배속", "4배속", "홈으로 돌아가기"];
        })(),
        detail: {
          시도: attemptIndex + 1,
          내팀: scenario.userTeam.displayName,
          상대팀: scenario.opponentTeam.displayName,
          현재시각: clockLabel(runtime.state.clock),
          국면: phaseLabel(runtime.state.clock),
          내점수: runtime.state.userGoals,
          상대점수: runtime.state.opponentGoals,
          남은개입토큰: Math.max(0, runtime.state.tokensRemaining - (runtime.interventions.length - runtime.appliedCount)),
          재생중: playing,
          경기종료: isFinished(runtime),
          미션: scenario.mission.brief,
          이어받은시점: `${scenario.interventionStartMinute}분 ${scenario.startingUserGoals}대${scenario.startingOpponentGoals}`,
          더그아웃열림: isDugoutOpen,
          연출중: beat === null ? null : beat.headline,
        },
        feed: runtime.state.events.filter(isFeedWorthy).slice(-10).reverse().map((event) => `${clockLabel(event.clock)} ${commentaryFor(event, scenario)}`),
      },
  );

  if (scenario === undefined || runtime === null) {
    return <main className="page narrow-page"><h1>시나리오를 찾을 수 없습니다.</h1><a href="#/">홈으로 돌아가기</a></main>;
  }

  const pendingCount = runtime.interventions.length - runtime.appliedCount;
  const tokensRemaining = Math.max(0, runtime.state.tokensRemaining - pendingCount);
  const started = runtime.state.clock.absoluteMinute > scenario.interventionStartMinute || runtime.state.events.length > 0;
  const feed = runtime.state.events.filter(isFeedWorthy).slice(-14).reverse();
  // 전술이 효과를 내고 있는지는 점수가 나기 전에도 보여야 한다. 사건을 그대로 센다.
  const chanceTally = runtime.state.events.reduce(
    (tally, event) => event.type !== "chance"
      ? tally
      : event.side === "user"
        ? { user: tally.user + 1, opponent: tally.opponent }
        : { user: tally.user, opponent: tally.opponent + 1 },
    { user: 0, opponent: 0 },
  );
  // 피치 위 한 줄은 방금 일어난 일만 말한다. 피드 전체를 얹으면 그림을 가린다.
  const latestLine = feed.length === 0 || !started
    ? null
    : `${clockLabel(feed[0]!.clock)} ${commentaryFor(feed[0]!, scenario)}`;

  const openDugout = () => {
    if (finished) return;
    if (tokensRemaining === 0) {
      setNotice("개입 토큰을 모두 썼습니다. 지금 전술로 남은 시간을 버텨야 합니다.");
      return;
    }
    setPlaying(false);
    setNotice(null);
    setDecisionPrompt(false);
    setDugoutOpen(true);
  };

  const applyIntervention = (intervention: Intervention) => {
    setFormation(intervention.formation);
    setPlacements(intervention.placements);
    setDirectives(intervention.directives);
    setRuntime((current) => current === null ? current : commitIntervention(current, { ...intervention, tokenIndex: 3 - tokensRemaining }));
    setDugoutOpen(false);
    setNotice(`${runtime.state.clock.absoluteMinute}분에 개입을 확정했습니다. 상대 벤치는 잠시 뒤에야 이 변화를 알아챕니다.`);
    setPlaying(true);
  };

  const quickSub = runtime === null || scenario === undefined || finished || tokensRemaining === 0
    ? null
    : quickSubstitution(scenarioId, formation, placements, 3 - tokensRemaining, directives);

  const applyQuickSubstitution = () => {
    if (quickSub === null) return;
    setDecisionPrompt(false);
    applyIntervention(quickSub.intervention);
  };

  const skipToEnd = () => {
    // 개입을 한 번도 만나지 않은 채 건너뛰면 이 게임을 한 번도 해보지 않고 결과만 보게 된다.
    // 한 번만 멈춰 세워 선택지를 보여준다. 두 번째부터는 그대로 건너뛴다.
    if (runtime !== null && runtime.interventions.length === 0 && !promptedOnce.current) {
      promptedOnce.current = true;
      setPlaying(false);
      setDecisionPrompt(true);
      return;
    }
    setPlaying(false);
    setBeat(null);
    resumeAfterBeat.current = false;
    setRuntime((current) => current === null ? current : runToTerminal(current));
  };

  const restart = () => {
    const nextAttempt = (attemptIndex + 1) % scenario.publishedSeedDeck.length;
    window.location.hash = matchHash(scenario.id, nextAttempt);
  };

  return (
    <main className="page">
      <header className="screen-header">
        <p className="eyebrow">매치룸, {attemptIndex + 1}번째 시도</p>
        <h1>{scenario.userTeam.displayName} 대 {scenario.opponentTeam.displayName}</h1>
        <p className="match-history-line">실제로는 {scenario.actualTerminal.userGoals}대{scenario.actualTerminal.opponentGoals}로 끝난 경기입니다. 지금 점수는 위 기록판을 보세요.</p>
      </header>

      <MatchHud
        userTeamName={scenario.userTeam.displayName}
        opponentTeamName={scenario.opponentTeam.displayName}
        userGoals={runtime.state.userGoals}
        opponentGoals={runtime.state.opponentGoals}
        clockLabel={clockLabel(runtime.state.clock)}
        phaseLabel={phaseLabel(runtime.state.clock)}
        tokensRemaining={tokensRemaining}
        totalTokens={3}
        userChances={chanceTally.user}
        opponentChances={chanceTally.opponent}
        playing={playing}
        finished={finished}
        // 결정을 요구하는 동안에는 재생 제어만 잠근다. 건너뛰기로 요구를 지나쳐 버리면
        // 사용자가 이 게임의 핵심 행동을 영영 만나지 못하지만, 개입 입구까지 잠그면
        // 결정을 요구하면서 결정을 막는 것이 된다.
        playbackLocked={decisionPrompt}
        speed={speed}
        pulse={emphasis === "userGoal" || emphasis === "opponentGoal" || emphasis === "counter" ? emphasis : "none"}
        onTogglePlay={() => setPlaying((current) => !current)}
        onOpenDugout={openDugout}
        onSpeed={setSpeed}
        onSkip={skipToEnd}
      />

      <section className="match-stage" aria-label="경기 화면">
        <LivePitch
          userPlayers={userPitchPlayers(scenario.id, placements, keyPlayerIdsFrom(scenario, runtime.state.events))}
          opponentPlayers={opponentPitchPlayers(scenario)}
          focus={matchFocusPoint(runtime.state.events, runtime.state.clock.absoluteMinute)}
          userTeamName={scenario.userTeam.displayName}
          opponentTeamName={scenario.opponentTeam.displayName}
          emphasis={emphasis}
          caption={latestLine}
        />
        {beat === null ? null : (
          <div className={`beat-overlay is-${beat.tone}`} role="status">
            <strong>{beat.headline}</strong>
            <span>{beat.detail}</span>
          </div>
        )}
        {decisionPrompt && !finished ? (
          <div className="kickoff-overlay decision-prompt">
            <p className="eyebrow">{runtime.state.clock.absoluteMinute}분, 아직 아무것도 바꾸지 않았습니다</p>
            <strong>지금 바꾸지 않으면 남은 시간은 그냥 흘러갑니다.</strong>
            <div className="kickoff-actions">
              {quickSub === null ? null : (
                <button type="button" className="kickoff-primary" onClick={applyQuickSubstitution}>{quickSub.incoming} 투입</button>
              )}
              <button type="button" className={quickSub === null ? "kickoff-primary" : "kickoff-secondary"} onClick={openDugout}>전술 직접 바꾸기</button>
              <button type="button" className="kickoff-secondary" onClick={() => { setDecisionPrompt(false); setPlaying(true); }}>이대로 본다</button>
            </div>
            <span>{scenario.mission.brief}</span>
          </div>
        ) : null}
        {!started && !finished ? (
          <div className="kickoff-overlay">
            <p className="eyebrow">{scenario.interventionStartMinute}분, 당신이 벤치를 이어받았습니다</p>
            <strong>{scenario.mission.brief}</strong>
            {/*
              자동 플레이테스트에서 캐주얼 페르소나가 두 번 연속 개입을 발견하지 못하고
              재생만 하다 이탈했다. "무엇을 해야 결과가 바뀌는지 모르겠다"가 원문이다.
              그래서 첫 화면의 가장 큰 행동을 재생이 아니라 전술 개입으로 바꾼다.
              한 번에 한 가지만 제시하고, 그냥 보기는 부차 선택지로 내린다.
            */}
            <div className="kickoff-actions">
              <button type="button" className="kickoff-primary" onClick={openDugout}>전술 바꾸기</button>
            </div>
            <span>전술을 바꾸지 않으면 역사를 바꿀 기회도 없습니다. 개입 토큰 {tokensRemaining}개를 쓸 수 있습니다. 그냥 지켜보려면 위의 경기 재개를 누르세요.</span>
          </div>
        ) : null}
        {!finished ? null : (
          <div className="beat-overlay is-final" role="status">
            <strong>경기 종료</strong>
            <span>{runtime.state.userGoals} 대 {runtime.state.opponentGoals}</span>
          </div>
        )}
      </section>

      {notice === null ? null : <p className="match-notice" role="status">{notice}</p>}

      {/* 상세 수치는 접어 둔다. 첫 화면에서 표가 먼저 보이면 경기가 아니라 문서로 읽힌다. */}
      <details className="match-detail-fold">
        <summary>경기 정보와 매치 코드</summary>
        <dl className="match-meta">
          <div><dt>이어받은 시점</dt><dd>{scenario.interventionStartMinute}분, {scenario.startingUserGoals}대{scenario.startingOpponentGoals}</dd></div>
          <div><dt>경기 형식</dt><dd>{formatDescription(scenario)}</dd></div>
          <div><dt>현재 포메이션</dt><dd>{formation}</dd></div>
          <div><dt>매치 코드</dt><dd><code className="match-code">{matchCode}</code></dd></div>
        </dl>
      </details>

      {!finished ? null : (
        <section className="report-section">
          <h2>경기가 끝났습니다</h2>
          <nav className="screen-nav" aria-label="종료 후 이동">
            <a className="button-link" href={reportHash(scenario.id, attemptIndex)}>결과 리포트 보기</a>
            <button type="button" className="text-button" onClick={restart}>새 리매치 시작</button>
          </nav>
        </section>
      )}

      <section className="report-section" aria-live="polite">
        <h2>경기 피드</h2>
        {feed.length === 0
          ? <p className="feed-empty">아직 기록된 장면이 없습니다. 경기를 재개하세요.</p>
          : <ol className="event-feed">{feed.map((event, index) => (
            <li key={`${runtime.state.events.length - index}`} className={`feed-${event.type}`}>
              <b>{clockLabel(event.clock)}</b> {commentaryFor(event, scenario)}
            </li>
          ))}</ol>}
      </section>

      <nav className="screen-nav" aria-label="화면 이동">
        <a href={reportHash(scenario.id, attemptIndex)}>결과 리포트</a>
        <a href="#/">홈으로 돌아가기</a>
      </nav>

      {!isDugoutOpen ? null : (
        <Dugout
          scenarioId={scenarioId}
          tokenIndex={3 - tokensRemaining}
          minute={runtime.state.clock.absoluteMinute}
          cardsUsedBefore={runtime.interventions.reduce((total, intervention) => total + intervention.substitutions.length, 0)}
          initialFormation={formation}
          initialPlacements={placements}
          initialDirectives={directives}
          onConfirm={applyIntervention}
          onClose={() => setDugoutOpen(false)}
        />
      )}
    </main>
  );
}

/**
 * 상징 선수를 최전방 선수와 바꾸는 한 번짜리 개입.
 * 선택지가 하나뿐인 경로가 없으면 탐색하지 않는 사용자는 이 게임의 핵심 행동을 영영 만나지 못한다.
 */
function quickSubstitution(
  scenarioId: string,
  formation: FormationPreset,
  placements: readonly Placement[],
  tokenIndex: number,
  directives: TacticalDirectives,
): { readonly intervention: Intervention; readonly incoming: string; readonly outgoing: string } | null {
  const roster = squadFor(scenarioId);
  const onPitch = new Set(placements.map((placement) => placement.playerId));
  const incoming = roster.bench.find((player) => player.signature === true && !onPitch.has(player.id));
  if (incoming === undefined) return null;
  // 가장 앞선 선수와 바꾼다. 골키퍼를 빼는 사고를 막고 교체의 의미도 분명해진다.
  const outgoing = [...placements].sort((left, right) => right.slot.x - left.slot.x)[0];
  if (outgoing === undefined) return null;
  const outgoingLabel = [...roster.starters, ...roster.bench].find((player) => player.id === outgoing.playerId)?.label ?? "선수";
  return {
    intervention: {
      tokenIndex,
      atMinute: 0,
      directives,
      formation,
      placements: placements.map((placement) => placement.playerId === outgoing.playerId
        ? { playerId: incoming.id, slot: placement.slot }
        : placement),
      substitutions: [{ outId: outgoing.playerId, inId: incoming.id }],
    },
    incoming: incoming.label,
    outgoing: outgoingLabel,
  };
}

function beatFor(fresh: readonly MatchEvent[], scenario: ScenarioDeclaration, decidedAtMinute: number | null): Beat | null {
  const goal = fresh.find((event) => event.type === "goal");
  if (goal !== undefined && goal.type === "goal") {
    // 골이 내 결정 뒤에 나왔다는 사실을 그 순간에 말해준다. 나중 리포트에서만 말하면
    // 사용자는 경기 중에 자기 결정이 통했다는 것을 끝내 느끼지 못한다.
    const sinceDecision = decidedAtMinute === null ? null : goal.clock.absoluteMinute - decidedAtMinute;
    const credit = sinceDecision !== null && sinceDecision >= 0 && sinceDecision <= 20
      ? ` 전술을 바꾼 지 ${sinceDecision}분 만입니다.`
      : "";
    return goal.side === "user"
      ? { tone: "goal", headline: "골", detail: `${scenario.userTeam.displayName}가 흐름을 뒤집습니다.${credit}` }
      : { tone: "concede", headline: "실점", detail: `${scenario.opponentTeam.displayName}가 앞서갑니다.` };
  }
  const counter = fresh.find((event) => event.type === "aiCounter");
  if (counter !== undefined && counter.type === "aiCounter") {
    return { tone: "counter", headline: "상대 벤치가 움직입니다", detail: `${counter.counteredWhat}. 대신 ${counter.exposedWeakness}가 열립니다.` };
  }
  return null;
}
