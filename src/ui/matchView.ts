import { FORMATION_SLOTS, slotRole } from "../domain/tactics";
import type { MatchEvent, Placement, ScenarioDeclaration } from "../domain/types";
import { squadFor } from "./squad";
import type { LivePitchPlayer, LivePitchProps } from "./LivePitch";

/**
 * 경기 상태를 피치 위의 그림으로 옮기는 조립 계층.
 *
 * 자동 플레이테스트에서 사용자가 "경기가 진행되고 있는지 알 수 없었다"고 말한 이유는
 * 모든 사건이 문장과 숫자로만 나왔기 때문이다. 여기서 하는 일은 이미 도메인이 만들어낸
 * 사실을 좌표로 바꾸는 것뿐이고, 새로운 사실을 지어내지 않는다. 순수 함수만 둔다.
 *
 * 좌표 계약: `FORMATION_SLOTS`의 `x`는 자기 골문 5에서 상대 골문 100까지의 깊이이고
 * `y`는 좌우다. 화면은 사용자가 항상 오른쪽으로 공격하도록 그리므로 사용자 좌표는
 * 그대로 쓰고 상대 좌표만 뒤집는다.
 */

const PITCH_MIN_X = 4;
const PITCH_MAX_X = 96;
const PITCH_MIN_Y = 6;
const PITCH_MAX_Y = 94;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** 사용자가 지휘하는 열한 명. 배치는 사용자가 더그아웃에서 정한 그대로다. */
export function userPitchPlayers(
  scenarioId: string,
  placements: readonly Placement[],
  keyPlayerIds: ReadonlySet<string>,
): readonly LivePitchPlayer[] {
  const squad = squadFor(scenarioId);
  const byId = new Map([...squad.starters, ...squad.bench].map((player) => [player.id, player]));
  return placements.map((placement) => {
    const player = byId.get(placement.playerId);
    return {
      id: placement.playerId,
      label: player?.label ?? slotRole(placement.slot),
      position: player?.position ?? slotRole(placement.slot),
      x: clamp(placement.slot.x, PITCH_MIN_X, PITCH_MAX_X),
      y: clamp(placement.slot.y, PITCH_MIN_Y, PITCH_MAX_Y),
      isKeyPlayer: keyPlayerIds.has(placement.playerId),
    };
  });
}

/**
 * 상대 열한 명.
 *
 * 상대 선발 명단은 출처로 확인되지 않았으므로 이름을 지어내지 않고 포지션 라벨만 쓴다.
 * 대형은 시나리오가 데이터로 선언한 값을 읽는다.
 *
 * 깊이를 그대로 뒤집으면(100 - x) 두 팀의 같은 역할이 **정확히 같은 점**에 선다.
 * 중앙 미드필더끼리 겹쳐 이름표가 서로를 덮었고, 화면에서 "황인범"이 "황안검"으로 읽혔다.
 * 사람 눈으로 잡은 결함이다. 그래서 상대는 자기 진영 쪽으로 눌러 배치한다 —
 * 골키퍼는 골문에 그대로 두고 최전방이 중앙선 근처에서 멈춘다.
 * 두 팀이 마주 보는 그림은 유지되면서 라벨 충돌만 사라진다.
 */
const OPPONENT_GOAL_X = 95;
const OPPONENT_DEPTH_SCALE = 0.44;

export function opponentPitchPlayers(scenario: ScenarioDeclaration): readonly LivePitchPlayer[] {
  return FORMATION_SLOTS[scenario.opponentFormation].map((slot, index) => {
    const role = slotRole(slot);
    return {
      id: `opponent-${index + 1}`,
      label: role,
      position: role,
      // 상대는 반대 방향으로 공격한다. 깊이를 뒤집되 자기 진영 쪽으로 눌러 겹침을 없앤다.
      x: clamp(OPPONENT_GOAL_X - (slot.x - 5) * OPPONENT_DEPTH_SCALE, PITCH_MIN_X, PITCH_MAX_X),
      y: clamp(100 - slot.y, PITCH_MIN_Y, PITCH_MAX_Y),
      isKeyPlayer: false,
    };
  });
}

/**
 * 교체로 들어온 선수와 시나리오의 상징 선수를 강조 대상으로 모은다.
 * 손흥민을 넣는 것이 이 제품의 서사이므로 그 순간이 피치에서 보여야 한다.
 */
export function keyPlayerIdsFrom(scenario: ScenarioDeclaration, events: readonly MatchEvent[]): ReadonlySet<string> {
  const ids = new Set<string>();
  if (scenario.id === "za-kor-2026") ids.add("son-heung-min");
  for (const event of events) if (event.type === "substitution") ids.add(event.inId);
  return ids;
}

/**
 * 경기 초점.
 *
 * 이는 관측된 공 위치가 아니라 마지막 공격 사건이 어느 진영에서 일어났는지의 시각화다.
 * 시뮬레이션이 만든 사건만 읽고, 최근 사건이 없으면 중앙을 가리킨다.
 */
export function matchFocusPoint(events: readonly MatchEvent[], minute: number): { readonly x: number; readonly y: number } {
  const latest = [...events].reverse().find((event) => event.type === "chance" || event.type === "goal" || event.type === "penaltyAttempt");
  if (latest === undefined || latest.clock.absoluteMinute > minute || latest.clock.absoluteMinute < minute - 1) {
    return { x: 50, y: 50 };
  }
  return { x: latest.side === "user" ? 84 : 16, y: 50 };
}


/** 골은 경기 결과를 즉시 바꾸므로, 같은 tick의 반격과 찬스보다 먼저 보여야 한다. */
export function emphasisFrom(freshEvents: readonly MatchEvent[]): LivePitchProps["emphasis"] {
  const goal = freshEvents.find((event) => event.type === "goal");
  if (goal !== undefined && goal.type === "goal") return goal.side === "user" ? "userGoal" : "opponentGoal";
  const counter = freshEvents.find((event) => event.type === "aiCounter");
  if (counter !== undefined) return "counter";
  const chance = freshEvents.find((event) => event.type === "chance");
  if (chance !== undefined && chance.type === "chance") return chance.side === "user" ? "userChance" : "opponentChance";
  return "none";
}
