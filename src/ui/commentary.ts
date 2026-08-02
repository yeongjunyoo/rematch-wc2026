import type { MatchClock, MatchEvent, ScenarioDeclaration, Side } from "../domain/types";
import { squadFor } from "./squad";

/**
 * 경기 피드 문구의 단일 정본.
 *
 * 매치룸과 결과 리포트가 같은 사건을 다른 문장으로 부르면 사용자는 두 화면을
 * 다른 경기로 읽는다. 그래서 문구 생성은 여기 한 곳에만 둔다.
 */

/**
 * 한국어 조사 선택.
 * 받침을 무시하면 "대한민국가 넣었습니다"처럼 읽는 순간 기계가 쓴 글이 된다.
 * 자동 플레이테스트에서 축구 팬이 정확히 그 문장을 지적했다.
 *
 * 한글만 보면 부족하다. 이 화면에는 스코어("0대1")와 포메이션("4-3-3")처럼
 * 숫자로 끝나는 말이 그대로 조사를 받는다. 숫자의 받침은 글자가 아니라 읽는 소리로
 * 정해지므로("3"은 삼이라 받침이 있고 "2"는 이라서 없다) 발음표로 판정한다.
 */
const DIGIT_HAS_FINAL: Readonly<Record<string, boolean>> = {
  // 영 일 삼 육 칠 팔 = 받침 있음, 이 사 오 구 = 없음
  "0": true, "1": true, "2": false, "3": true, "4": false,
  "5": false, "6": true, "7": true, "8": true, "9": false,
};

/** 받침이 있으면 true. 판정할 수 없는 글자는 받침 없음으로 둔다. */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  if (last === "") return false;
  if (last in DIGIT_HAS_FINAL) return DIGIT_HAS_FINAL[last]!;
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function withParticle(word: string, withFinal: string, withoutFinal: string): string {
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}

/**
 * 방향격 조사. 받침 유무만으로는 틀린다.
 * ㄹ 받침 뒤에는 "으로"가 아니라 "로"를 쓴다 — "일로", "팔로"이지 "일으로"가 아니다.
 * 스코어 0대1과 포메이션 4-3-3이 둘 다 이 한 줄을 지나간다.
 */
export function directionParticle(word: string): string {
  const last = word.trim().slice(-1);
  const rieulDigits = new Set(["1", "7", "8"]);
  if (last in DIGIT_HAS_FINAL) {
    return `${word}${DIGIT_HAS_FINAL[last] && !rieulDigits.has(last) ? "으로" : "로"}`;
  }
  const code = last.charCodeAt(0);
  const isHangul = !Number.isNaN(code) && code >= 0xac00 && code <= 0xd7a3;
  const finalIndex = isHangul ? (code - 0xac00) % 28 : 0;
  // 종성 인덱스 8 = ㄹ
  return `${word}${finalIndex === 0 || finalIndex === 8 ? "로" : "으로"}`;
}

/** 주격 조사. */
export function subjectParticle(word: string): string {
  return withParticle(word, "이", "가");
}

/** 보조사. */
export function topicParticle(word: string): string {
  return withParticle(word, "은", "는");
}

/** 목적격 조사. "손흥민를 넣고"처럼 읽는 순간 사람이 안 쓴 문장이 된다. */
export function objectParticle(word: string): string {
  return withParticle(word, "을", "를");
}

/** 명단에서 확인되는 선수만 이름으로 부른다. 확인되지 않으면 이름을 지어내지 않는다. */
function playerName(scenario: ScenarioDeclaration, id: string): string | null {
  const squad = squadFor(scenario.id);
  return [...squad.starters, ...squad.bench].find((player) => player.id === id)?.label ?? null;
}

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
    case "goal": {
      const scorer = event.side === "user" ? playerName(scenario, event.scorerId) : null;
      if (event.side === "user") {
        return scorer === null
          ? `골! ${us} 득점입니다.`
          : `골! ${scorer}입니다.`;
      }
      return `실점입니다. ${withParticle(them, "이", "가")} 골망을 흔듭니다.`;
    }
    case "chance": {
      const shooter = event.side === "user" ? playerName(scenario, event.shooterId) : null;
      const actor = shooter ?? teamOf(event.side);
      return event.converted
        ? `${actor}의 마무리가 그물을 가릅니다.`
        : `${withParticle(actor, "이", "가")} 때렸지만 빗나갑니다.`;
    }
    case "card":
      return `${teamOf(event.side)} 경고.`;
    case "substitution": {
      // 누가 들어가고 누가 나갔는지가 이 제품의 서사다. "벤치가 움직였습니다"로는
      // 손흥민을 넣었다는 사실이 피드에서 사라진다.
      const roster = new Map([...squadFor(scenario.id).starters, ...squadFor(scenario.id).bench].map((player) => [player.id, player.label]));
      const incoming = roster.get(event.inId);
      const outgoing = roster.get(event.outId);
      // 이름을 못 찾는 것은 내부 계약 파손이다. 일반 문구로 덮으면 교체가 일어난 것처럼 보이면서
      // 누가 들어갔는지만 사라져 진단이 불가능해진다. 원래 식별자를 그대로 드러낸다.
      if (incoming === undefined || outgoing === undefined) {
        return `교체. ${outgoing ?? event.outId} 대신 ${incoming ?? event.inId} 투입. 명단에서 확인되지 않은 식별자입니다.`;
      }
      return `${incoming} 투입! ${withParticle(outgoing, "이", "가")} 나갑니다.`;
    }
    case "intervention":
      return event.summary;
    case "aiCounter":
      return `상대 벤치가 움직입니다. ${event.counteredWhat}. 대신 ${withParticle(event.exposedWeakness, "이", "가")} 열립니다.`;
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
