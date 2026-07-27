import type React from "react";
import "./livePitch.css";

export interface LivePitchPlayer {
  readonly id: string;
  readonly label: string;
  readonly position: string;
  /** 0..100. 0이 자기 골문, 100이 상대 골문. 사용자는 항상 오른쪽으로 공격한다. */
  readonly x: number;
  /** 0..100. 0이 위쪽 터치라인, 100이 아래쪽 터치라인. */
  readonly y: number;
  readonly isKeyPlayer: boolean;
}

export interface LivePitchProps {
  readonly userPlayers: readonly LivePitchPlayer[];
  readonly opponentPlayers: readonly LivePitchPlayer[];
  /** 경기의 초점. 관측된 공 좌표가 아니라 마지막 사건이 어느 진영에서 일어났는지의 시각화다. */
  readonly focus: { readonly x: number; readonly y: number };
  readonly userTeamName: string;
  readonly opponentTeamName: string;
  readonly emphasis: "none" | "userChance" | "opponentChance" | "userGoal" | "opponentGoal" | "counter";
  /** 피치 위에 잠깐 띄울 한 줄. null이면 표시하지 않는다. */
  readonly caption: string | null;
}

const FIELD = {
  x: 3,
  y: 3,
  width: 99,
  height: 62,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function pitchPoint(point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
  return {
    x: clamp(FIELD.x + (point.x / 100) * FIELD.width, FIELD.x + 2, FIELD.x + FIELD.width - 2),
    y: clamp(FIELD.y + (point.y / 100) * FIELD.height, FIELD.y + 2, FIELD.y + FIELD.height - 2),
  };
}

function shortLabel(label: string): string {
  return Array.from(label).slice(0, 3).join("");
}

function emphasisLabel(emphasis: LivePitchProps["emphasis"]): string {
  switch (emphasis) {
    case "userChance": return "사용자 팀이 상대 골문을 위협하는 상황";
    case "opponentChance": return "상대 팀이 사용자 골문을 위협하는 상황";
    case "userGoal": return "사용자 팀 득점 상황";
    case "opponentGoal": return "상대 팀 실점 상황";
    case "counter": return "상대 팀이 전술 변화에 대응하는 상황";
    case "none": return "경기 진행 상황";
  }
}

function playerDescription(player: LivePitchPlayer): string {
  return `${player.label} ${player.position}${player.isKeyPlayer ? " 핵심 선수" : ""}`;
}

interface PlayerTokensProps {
  readonly players: readonly LivePitchPlayer[];
  readonly side: "user" | "opponent";
  readonly countering: boolean;
}

function PlayerTokens({ players, side, countering }: PlayerTokensProps): React.JSX.Element {
  return (
    <g className={`lp-team lp-team-${side}${countering ? " lp-team-countering" : ""}`} aria-hidden="true">
      {players.map((player) => {
        const point = pitchPoint(player);
        return (
          <g key={player.id} className={`lp-player${player.isKeyPlayer ? " lp-player-key" : ""}`} transform={`translate(${point.x} ${point.y})`}>
            {player.isKeyPlayer && <circle className="lp-key-ring" r="3.25" />}
            <circle className="lp-player-shirt" r="2.35" />
            <path className="lp-player-stripe" d="M-1.15 -1.4h2.3v2.8h-2.3z" />
            <text className="lp-player-label" y="4.75">{shortLabel(player.label)}</text>
          </g>
        );
      })}
    </g>
  );
}

export function LivePitch(props: LivePitchProps): React.JSX.Element {
  const {
    userPlayers,
    opponentPlayers,
    focus,
    userTeamName,
    opponentTeamName,
    emphasis,
    caption,
  } = props;
  const focusPoint = pitchPoint(focus);
  const ariaLabel = `경기 전술판. ${userTeamName} 대 ${opponentTeamName}. 사용자는 오른쪽으로 공격합니다. ${emphasisLabel(emphasis)}. 경기 초점은 마지막 사건의 진영을 나타냅니다. 사용자 선수 ${userPlayers.map(playerDescription).join(", ")}. 상대 선수 ${opponentPlayers.map(playerDescription).join(", ")}.${caption === null ? "" : ` ${caption}`}`;
  const isUserEvent = emphasis === "userChance" || emphasis === "userGoal";
  const isOpponentEvent = emphasis === "opponentChance" || emphasis === "opponentGoal";

  return (
    <div className={`lp-frame lp-emphasis-${emphasis}`}>
      <svg className="lp-pitch" viewBox="0 0 105 68" role="img" aria-label={ariaLabel}>
        <rect className="lp-grass" x={FIELD.x} y={FIELD.y} width={FIELD.width} height={FIELD.height} rx="1.5" />
        <g className="lp-markings" aria-hidden="true">
          <rect x={FIELD.x} y={FIELD.y} width={FIELD.width} height={FIELD.height} rx="1.5" />
          <path d="M52.5 3v62M3 21.5h16.5v25H3M102 21.5H85.5v25H102M3 28.5h5.5v11H3M102 28.5h-5.5v11H102" />
          <circle cx="52.5" cy="34" r="9.15" />
          <circle className="lp-spot" cx="52.5" cy="34" r=".7" />
          <circle className="lp-spot" cx="14.5" cy="34" r=".7" />
          <circle className="lp-spot" cx="90.5" cy="34" r=".7" />
          <path className="lp-goal" d="M3 28.5H.75v11H3M102 28.5h2.25v11H102" />
        </g>
        {(isUserEvent || isOpponentEvent) && (
          <g className={`lp-danger-zone ${isUserEvent ? "lp-danger-user" : "lp-danger-opponent"}`} aria-hidden="true">
            <rect x={isUserEvent ? 84 : 3} y="19" width="18" height="30" rx="2" />
            <circle cx={isUserEvent ? 97 : 8} cy="34" r="8" />
          </g>
        )}
        {(emphasis === "userGoal" || emphasis === "opponentGoal") && (
          <rect className="lp-goal-flash" x={FIELD.x} y={FIELD.y} width={FIELD.width} height={FIELD.height} rx="1.5" aria-hidden="true" />
        )}
        <PlayerTokens players={opponentPlayers} side="opponent" countering={emphasis === "counter"} />
        <PlayerTokens players={userPlayers} side="user" countering={false} />
        <g className="lp-focus" transform={`translate(${focusPoint.x} ${focusPoint.y})`} aria-hidden="true">
          <circle className="lp-focus-ring" r="3.8" />
          <circle className="lp-focus-center" r="1.15" />
        </g>
        {caption !== null && (
          <g className="lp-caption" aria-hidden="true">
            <rect x="31" y="5.3" width="43" height="6.4" rx="1.4" />
            <text x="52.5" y="9.65" textAnchor="middle">{caption}</text>
          </g>
        )}
      </svg>
    </div>
  );
}
