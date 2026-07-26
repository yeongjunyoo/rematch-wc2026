import { applyPreset } from "../domain/tactics";
import type { FormationPreset, Placement } from "../domain/types";

export interface SquadPlayer {
  id: string;
  label: string;
  position: "GK" | "DF" | "MF" | "FW";
  confirmed: boolean;
}

type Squad = { readonly starters: readonly SquadPlayer[]; readonly bench: readonly SquadPlayer[] };

// Full lineups and benches are not available for every source record. Numbered players are explicit reconstructions.
const reconstructed = (id: string, position: SquadPlayer["position"]): SquadPlayer => ({
  id,
  label: position === "GK" ? "GK" : `${position} ${id.slice(-1)}`,
  position,
  confirmed: false,
});

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
    bench: [confirmed("son-heung-min", "손흥민", "FW"), reconstructed("za-kor-b-gk", "GK"), reconstructed("za-kor-b-df", "DF"), reconstructed("za-kor-b-mf", "MF"), reconstructed("za-kor-b-fw", "FW")],
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
