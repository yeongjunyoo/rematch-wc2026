import type { MatchClock, MatchEvent, ScenarioDeclaration, Side } from "../domain/types";

/**
 * 경기 피드 문구의 단일 정본.
 *
 * 매치룸과 결과 리포트가 같은 사건을 다른 문장으로 부르면 사용자는 두 화면을
 * 다른 경기로 읽는다. 그래서 문구 생성은 여기 한 곳에만 둔다.
 */

export function clockLabel(clock: MatchClock): string {
  if (clock.phase === "shootout") return `승부차기 ${clock.shootoutRound ?? 1}번째 킥`;
  if (clock.phase === "finished") return "경기 종료";
  return `${clock.absoluteMinute}분`;
}

export function phaseLabel(clock: MatchClock): string {
  switch (clock.phase) {
    case "regulation": return "정규시간";
    case "extraTime": return "연장전";
    case "shootout": return "승부차기";
    case "finished": return "종료";
  }
}

/** 사건 한 줄. 앞의 시간 표기는 화면이 따로 배치하므로 여기서는 붙이지 않는다. */
export function commentaryFor(event: MatchEvent, scenario: ScenarioDeclaration): string {
  const us = scenario.userTeam.displayName;
  const them = scenario.opponentTeam.displayName;
  const teamOf = (side: Side): string => (side === "user" ? us : them);

  switch (event.type) {
    case "goal":
      return event.side === "user"
        ? `골. ${us}가 넣었습니다.`
        : `실점. ${them}가 넣었습니다.`;
    case "chance":
      return event.converted
        ? `${teamOf(event.side)}의 결정적 장면이 골로 이어집니다.`
        : `${teamOf(event.side)}가 기회를 만들었지만 마무리가 빗나갑니다.`;
    case "card":
      return `${teamOf(event.side)} 경고.`;
    case "substitution":
      return `${us} 교체. 벤치가 움직였습니다.`;
    case "intervention":
      return event.summary;
    case "aiCounter":
      return `상대 벤치가 반응합니다. ${event.counteredWhat}. 대신 ${event.exposedWeakness}가 열립니다.`;
    case "penaltyAttempt":
      return event.result === "scored"
        ? `${teamOf(event.side)} 성공.`
        : event.result === "saved"
          ? `${teamOf(event.side)} 실축. 골키퍼가 막아냅니다.`
          : `${teamOf(event.side)} 실축. 골문을 벗어납니다.`;
    case "phaseChange":
      switch (event.reason) {
        case "regulationEnded": return "정규시간이 끝났습니다.";
        case "extraTimeEnded": return "연장전이 끝났습니다.";
        case "goldenGoal": return "골든골. 그대로 경기가 끝납니다.";
        case "shootoutStarted": return "승부차기로 갑니다.";
        case "decided": return "경기가 결정됐습니다.";
      }
  }
}

/** 리포트 하이라이트와 자동 정지 연출이 공유하는 중요 사건 판정. */
export function isHighlight(event: MatchEvent): boolean {
  return event.type === "goal"
    || event.type === "card"
    || event.type === "phaseChange"
    || event.type === "penaltyAttempt"
    || event.type === "aiCounter"
    || event.type === "substitution"
    || event.type === "intervention";
}

/** 피드에 노출할 사건. 무산된 찬스는 흐름을 보여주되 하이라이트는 아니다. */
export function isFeedWorthy(event: MatchEvent): boolean {
  return isHighlight(event) || event.type === "chance";
}
