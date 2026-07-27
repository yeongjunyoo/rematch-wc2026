import { applyPreset } from "../domain/tactics";
import type { FormationPreset, Placement } from "../domain/types";

export interface SquadPlayer {
  id: string;
  label: string;
  position: "GK" | "DF" | "MF" | "FW";
  confirmed: boolean;
  /**
   * 이 시나리오의 상징 선수인가.
   * 손흥민을 넣는 것이 이 제품의 서사인데 능력치가 다른 공격수와 같으면
   * 그 결정이 기계적으로 아무 일도 하지 않는다. authored 밸런스 프로필이며
   * 출처로 확인된 선수에게만 붙인다.
   */
  signature?: boolean;
}

type Squad = { readonly starters: readonly SquadPlayer[]; readonly bench: readonly SquadPlayer[] };

// 출처에 선발과 벤치 전체가 남지 않은 경기가 있다. 이름을 지어내지 않고 포지션 라벨로만 표기하며
// confirmed false로 재구성임을 드러낸다. id 끝에 숫자가 있으면 그 숫자를 순번으로 붙인다.
// 순수 함수로 유지한다. 모듈 수준 가변 상태를 두지 않는다.
const reconstructed = (id: string, position: SquadPlayer["position"]): SquadPlayer => {
  const ordinal = /(\d+)$/.exec(id)?.[1];
  return {
    id,
    label: ordinal === undefined ? position : `${position} ${ordinal}`,
    position,
    confirmed: false,
  };
};

const line = (prefix: string, confirmedPlayers: readonly SquadPlayer[], formation: FormationPreset): readonly SquadPlayer[] => {
  const positions: Record<FormationPreset, readonly SquadPlayer["position"][]> = {
    "4-3-3": ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"],
    "4-2-3-1": ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW"],
    "3-4-3": ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "FW", "FW", "FW"],
    "3-5-2": ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW", "FW"],
    "5-4-1": ["GK", "DF", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "FW"],
  };
  const available = [...confirmedPlayers];
  return positions[formation].map((position, index) => {
    const knownIndex = available.findIndex((player) => player.position === position);
    if (knownIndex !== -1) return available.splice(knownIndex, 1)[0]!;
    return reconstructed(`${prefix}-${position.toLowerCase()}-${index + 1}`, position);
  });
};

const confirmed = (id: string, label: string, position: SquadPlayer["position"]): SquadPlayer => ({ id, label, position, confirmed: true });

const SOUTH_AFRICA_STARTERS: readonly SquadPlayer[] = [
  confirmed("kim-seung-gyu", "김승규", "GK"),
  confirmed("lee-han-beom", "이한범", "DF"),
  confirmed("kim-min-jae", "김민재", "DF"),
  confirmed("lee-ki-hyuk", "이기혁", "DF"),
  confirmed("seol-young-woo", "설영우", "MF"),
  confirmed("baek-seung-ho", "백승호", "MF"),
  confirmed("hwang-in-beom", "황인범", "MF"),
  confirmed("lee-tae-seok", "이태석", "MF"),
  confirmed("lee-kang-in", "이강인", "MF"),
  confirmed("hwang-hee-chan", "황희찬", "FW"),
  confirmed("oh-hyeon-gyu", "오현규", "FW"),
];

const SQUADS: Readonly<Record<string, Squad>> = {
  "za-kor-2026": {
    starters: SOUTH_AFRICA_STARTERS,
    bench: [{ ...confirmed("son-heung-min", "손흥민", "FW"), signature: true }, reconstructed("za-kor-b-gk", "GK"), reconstructed("za-kor-b-df", "DF"), reconstructed("za-kor-b-mf", "MF"), reconstructed("za-kor-b-fw", "FW")],
  },
  "kor-cze-2026": {
    starters: line("kor-cze", [confirmed("hwang-in-beom", "황인범", "MF"), confirmed("kim-seung-gyu", "김승규", "GK")], "4-2-3-1"),
    bench: [reconstructed("kor-cze-b-gk", "GK"), reconstructed("kor-cze-b-df", "DF"), reconstructed("kor-cze-b-mf", "MF"), reconstructed("kor-cze-b-fw", "FW"), reconstructed("kor-cze-b-fw2", "FW")],
  },
  "esp-arg-2026-final": {
    starters: line("esp-arg", [confirmed("lionel-messi", "리오넬 메시", "FW"), confirmed("emiliano-martinez", "에밀리아노 마르티네스", "GK")], "4-3-3"),
    bench: [reconstructed("esp-arg-b-gk", "GK"), reconstructed("esp-arg-b-df", "DF"), reconstructed("esp-arg-b-mf", "MF"), reconstructed("esp-arg-b-fw", "FW"), reconstructed("esp-arg-b-fw2", "FW")],
  },
  "ger-par-2026-r32": {
    starters: line("ger-par", [confirmed("kai-havertz", "카이 하베르츠", "FW")], "4-2-3-1"),
    bench: [reconstructed("ger-par-b-gk", "GK"), reconstructed("ger-par-b-df", "DF"), reconstructed("ger-par-b-mf", "MF"), reconstructed("ger-par-b-fw", "FW"), reconstructed("ger-par-b-fw2", "FW")],
  },
  "kor-ita-2002": {
    starters: line("kor-ita", [], "3-5-2"),
    bench: [reconstructed("kor-ita-b-gk", "GK"), reconstructed("kor-ita-b-df", "DF"), reconstructed("kor-ita-b-mf", "MF"), reconstructed("kor-ita-b-fw", "FW"), reconstructed("kor-ita-b-fw2", "FW")],
  },
};

export function defaultFormation(scenarioId: string): FormationPreset {
  switch (scenarioId) {
    case "za-kor-2026": return "3-5-2";
    case "kor-cze-2026": return "4-2-3-1";
    case "ger-par-2026-r32": return "4-2-3-1";
    case "kor-ita-2002": return "3-5-2";
    default: return "4-3-3";
  }
}

export function squadFor(scenarioId: string): Squad {
  const squad = SQUADS[scenarioId];
  if (squad === undefined) throw new RangeError(`Unknown scenario squad: ${scenarioId}.`);
  return squad;
}

export function initialPlacements(scenarioId: string): readonly Placement[] {
  return applyPreset(defaultFormation(scenarioId), squadFor(scenarioId).starters.map((player) => player.id));
}
