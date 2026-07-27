import type React from "react";
import "./matchHud.css";

export type MatchSpeed = 1 | 2 | 4;

export interface MatchHudProps {
  readonly userTeamName: string;
  readonly opponentTeamName: string;
  readonly userGoals: number;
  readonly opponentGoals: number;
  /** 이어받은 뒤 기록된 찬스 수. 도메인 사건을 그대로 센 값이다. */
  readonly userChances: number;
  readonly opponentChances: number;
  /** 예: "63분", "승부차기 3번째 킥" */
  readonly clockLabel: string;
  /** 예: "정규시간", "연장전" */
  readonly phaseLabel: string;
  readonly tokensRemaining: number;
  readonly totalTokens: number;
  readonly playing: boolean;
  readonly finished: boolean;
  /**
   * 재생 제어만 잠근다.
   * 결정을 요구하며 경기를 멈춰 세운 순간에도 개입 입구는 열려 있어야 한다.
   * 둘을 같은 플래그로 묶으면 사용자에게 결정을 요구하면서 결정을 막게 된다.
   */
  readonly playbackLocked: boolean;
  readonly speed: MatchSpeed;
  readonly pulse: "none" | "userGoal" | "opponentGoal" | "counter";
  readonly onTogglePlay: () => void;
  readonly onOpenDugout: () => void;
  readonly onSpeed: (speed: MatchSpeed) => void;
  readonly onSkip: () => void;
}

const SPEEDS: readonly MatchSpeed[] = [1, 2, 4];

export function MatchHud({
  userTeamName,
  opponentTeamName,
  userGoals,
  opponentGoals,
  userChances,
  opponentChances,
  clockLabel,
  phaseLabel,
  tokensRemaining,
  totalTokens,
  playing,
  finished,
  playbackLocked,
  speed,
  pulse,
  onTogglePlay,
  onOpenDugout,
  onSpeed,
  onSkip,
}: MatchHudProps): React.JSX.Element {
  const visibleTokenCount = Math.max(0, totalTokens);
  const remainingTokenCount = Math.min(Math.max(0, tokensRemaining), visibleTokenCount);
  const visibleUserChances = Math.max(0, userChances);
  const visibleOpponentChances = Math.max(0, opponentChances);
  const totalChances = visibleUserChances + visibleOpponentChances;
  const userChanceShare = totalChances === 0 ? 0 : (visibleUserChances / totalChances) * 100;
  const chanceBarStyle = {
    "--mh-user-chance-share": `${userChanceShare}%`,
  } as React.CSSProperties;

  return (
    <section className={`mh-hud mh-pulse-${pulse}`} aria-label="경기 조작판">
      <div className="mh-scoreboard" role="status" aria-live="polite" aria-atomic="true">
        <div className="mh-team mh-team-user">
          <span className="mh-team-name">{userTeamName}</span>
          <strong className="mh-score">{userGoals}</strong>
        </div>
        <span className="mh-score-separator" aria-hidden="true">:</span>
        <div className="mh-team mh-team-opponent">
          <strong className="mh-score">{opponentGoals}</strong>
          <span className="mh-team-name">{opponentTeamName}</span>
        </div>
        <div className="mh-chances">
          <div className="mh-chance-summary">
            <span className="mh-chance-label">만든 찬스</span>
            {totalChances === 0 ? (
              <span className="mh-chance-zero">
                <span className="mh-chance-empty">아직 기록 없음</span>
                <span
                  className="mh-chance-counts"
                  aria-label={`${userTeamName} 만든 찬스 0개, ${opponentTeamName} 만든 찬스 0개`}
                >
                  <span>우리 0</span>
                  <span aria-hidden="true">:</span>
                  <span>상대 0</span>
                </span>
              </span>
            ) : (
              <span
                className="mh-chance-counts"
                aria-label={`${userTeamName} 만든 찬스 ${visibleUserChances}개, ${opponentTeamName} 만든 찬스 ${visibleOpponentChances}개`}
              >
                <span>우리 {visibleUserChances}</span>
                <span aria-hidden="true">:</span>
                <span>상대 {visibleOpponentChances}</span>
              </span>
            )}
          </div>
          <div
            className={totalChances === 0 ? "mh-chance-bar mh-chance-bar-empty" : "mh-chance-bar"}
            style={chanceBarStyle}
            aria-hidden="true"
          >
            <span className="mh-chance-bar-user" />
            <span className="mh-chance-bar-opponent" />
          </div>
        </div>
      </div>

      <div className="mh-clock" aria-label={`경기 시간 ${clockLabel}, ${phaseLabel}`}>
        <strong>{clockLabel}</strong>
        <span>{phaseLabel}</span>
      </div>

      <div className="mh-primary-area">
        <div className="mh-tokens" aria-label={`개입 토큰 ${remainingTokenCount}개 남음, 총 ${visibleTokenCount}개`}>
          <span className="mh-tokens-label">개입 토큰</span>
          <span className="mh-token-dots" aria-hidden="true">
            {Array.from({ length: visibleTokenCount }, (_, index) => (
              <i key={index} className={index < remainingTokenCount ? "mh-token" : "mh-token mh-token-spent"} />
            ))}
          </span>
          <strong className="mh-token-count">{remainingTokenCount}/{visibleTokenCount}</strong>
        </div>
        <button type="button" className="mh-dugout-button" onClick={onOpenDugout} disabled={finished}>
          전술 바꾸기
        </button>
      </div>

      <div className="mh-controls" role="group" aria-label="경기 재생 제어">
        <button type="button" className="mh-play-button" onClick={onTogglePlay} disabled={finished || playbackLocked}>
          {playing ? "일시정지" : "경기 재개"}
        </button>
        <div className="mh-speed-group" role="group" aria-label="재생 속도">
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeed(option)}
              disabled={finished || playbackLocked}
              aria-pressed={speed === option}
            >
              {option}배속
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mh-skip-button"
          onClick={onSkip}
          disabled={finished || playbackLocked}
          title={tokensRemaining === totalTokens ? "전술을 한 번도 바꾸지 않고 결과만 봅니다" : undefined}
        >
          끝까지 건너뛰기
        </button>
      </div>
    </section>
  );
}
