import type React from "react";
import "./matchHud.css";

export type MatchSpeed = 1 | 2 | 4;

export interface MatchHudProps {
  readonly userTeamName: string;
  readonly opponentTeamName: string;
  readonly userGoals: number;
  readonly opponentGoals: number;
  /** 예: "63분", "승부차기 3번째 킥" */
  readonly clockLabel: string;
  /** 예: "정규시간", "연장전" */
  readonly phaseLabel: string;
  readonly tokensRemaining: number;
  readonly totalTokens: number;
  readonly playing: boolean;
  readonly finished: boolean;
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
  clockLabel,
  phaseLabel,
  tokensRemaining,
  totalTokens,
  playing,
  finished,
  speed,
  pulse,
  onTogglePlay,
  onOpenDugout,
  onSpeed,
  onSkip,
}: MatchHudProps): React.JSX.Element {
  const visibleTokenCount = Math.max(0, totalTokens);
  const remainingTokenCount = Math.min(Math.max(0, tokensRemaining), visibleTokenCount);

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
        <button type="button" className="mh-play-button" onClick={onTogglePlay} disabled={finished}>
          {playing ? "일시정지" : "경기 재개"}
        </button>
        <div className="mh-speed-group" role="group" aria-label="재생 속도">
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeed(option)}
              disabled={finished}
              aria-pressed={speed === option}
            >
              {option}배속
            </button>
          ))}
        </div>
        <button type="button" className="mh-skip-button" onClick={onSkip} disabled={finished}>
          끝까지 건너뛰기
        </button>
      </div>
    </section>
  );
}
