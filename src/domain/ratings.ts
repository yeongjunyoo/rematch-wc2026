import { hashSeed } from "./rng";
import { FORMATION_SLOTS, slotRole } from "./tactics";
import type { FormationPreset, TacticalDirectives } from "./types";

/**
 * All player ratings are authored game-balance values, not assessments of real players.
 * They deliberately stay in a narrow range so scenario names do not imply player likeness.
 */
export interface PlayerRatings {
  pace: number;
  passing: number;
  finishing: number;
  defending: number;
  stamina: number;
  composure: number;
}

type Position = "GK" | "DF" | "MF" | "FW";
type RatingKey = keyof PlayerRatings;

const RATING_KEYS: readonly RatingKey[] = ["pace", "passing", "finishing", "defending", "stamina", "composure"];
const ROLE_BASELINES: Record<Position, PlayerRatings> = {
  GK: { pace: 66, passing: 70, finishing: 62, defending: 82, stamina: 72, composure: 74 },
  DF: { pace: 69, passing: 68, finishing: 63, defending: 78, stamina: 74, composure: 70 },
  MF: { pace: 72, passing: 79, finishing: 70, defending: 68, stamina: 76, composure: 77 },
  FW: { pace: 80, passing: 70, finishing: 82, defending: 62, stamina: 73, composure: 75 },
};

/**
 * Returns a deterministic authored balance profile.
 *
 * 이름이 출처로 확인된 선수는 재구성 선수보다 낫고, 시나리오의 상징 선수는 그보다 더 낫다.
 * 같은 포지션이면 전부 같은 능력치를 주면 손흥민을 넣는 결정이 기계적으로 아무 일도 하지 않는다.
 * authored 프로필이며 실축 능력치를 재현한다고 주장하지 않는다.
 */
export function ratingsFor(
  scenarioId: string,
  playerId: string,
  position: Position,
  tier: PlayerTier = "reconstructed",
): PlayerRatings {
  const baseline = ROLE_BASELINES[position];
  const bonus = TIER_BONUS[tier];
  const ratings = {} as PlayerRatings;

  for (const key of RATING_KEYS) {
    const variation = (hashSeed(`${scenarioId}:${playerId}:${position}:${key}`) % 5) - 2;
    ratings[key] = clamp(baseline[key] + variation + bonus, 50, 94);
  }

  return ratings;
}

/** 출처 확인 정도에 따른 authored 등급. */
export type PlayerTier = "reconstructed" | "confirmed" | "signature";

const TIER_BONUS: Record<PlayerTier, number> = {
  reconstructed: 0,
  confirmed: 3,
  signature: 9,
};

/**
 * Formation compatibility is derived only from each preset's line counts, never from a diagram.
 * A forward-heavy shape gains attack at the corresponding cost in defense.
 */
export function formationEdge(mine: FormationPreset, theirs: FormationPreset): { attack: number; defense: number } {
  const mineBias = formationBias(mine);
  const theirBias = formationBias(theirs);
  const attack = clamp((mineBias - theirBias) * 0.04, -0.2, 0.2);
  return attack === 0 ? { attack: 0, defense: 0 } : { attack, defense: -attack };
}

/**
 * Hattrick reverse-engineering figures are used only as priors and sensitivity bands here.
 * These coefficients do not reproduce those figures and are not empirically validated.
 */
export function directiveWeights(directives: TacticalDirectives): {
  userChance: number;
  opponentChance: number;
  conversion: number;
  concede: number;
  staminaDrain: number;
} {
  const defensiveLine = normalizeDirective(directives.defensiveLine);
  const pressing = normalizeDirective(directives.pressing);
  const tempo = normalizeDirective(directives.tempo);
  const attackRoute = normalizeDirective(directives.attackRoute);
  const mindset = normalizeDirective(directives.mindset);

  return {
    // A full-axis change moves chance volume enough to survive deterministic draw cutoffs.
    // Openness deliberately amplifies both attacking volume and defensive exposure.
    userChance: Math.max(0.2, 1 + defensiveLine * 0.16 + pressing * 0.2 + tempo * 0.3 + attackRoute * 0.14 + mindset * 0.4),
    opponentChance: Math.max(0.2, 1 + defensiveLine * 0.16 - pressing * 0.2 + tempo * 0.3 + mindset * 0.4),
    conversion: 1 + tempo * 0.32 + attackRoute * 0.12 + mindset * 0.38,
    // 노출은 상대의 찬스 수와 전환 확률에 각각 곱해지므로 실효 페널티가 제곱으로 걸린다.
    // 이전 계수는 전면 공격 시 실효 2.9배가 되어, 지고 있을 때 공격하는 합리적 선택이
    // 오히려 결과를 나쁘게 만들었다. 트레이드오프는 남기되 제곱 효과를 감안해 낮춘다.
    concede: 1 + defensiveLine * 0.16 + pressing * 0.04 + tempo * 0.1 + mindset * 0.18,
    staminaDrain: 1 + pressing * 0.16 + tempo * 0.08 + mindset * 0.05,
  };
}

/** Produces a bounded, strictly positive fatigue multiplier. */
export function staminaFactor(minute: number, stamina: number, drain: number): number {
  const elapsed = Math.max(0, minute);
  const endurance = 0.6 + clamp(stamina, 0, 100) / 100;
  const exertion = Math.max(0, drain);
  return clamp(1 / (1 + (elapsed * (0.004 + exertion * 0.006)) / endurance), 0.05, 1);
}

/** Adjusts risk by scoreline urgency without changing the score itself. */
export function scoreContext(
  userGoals: number,
  opponentGoals: number,
  minute: number,
  regulationMinutes: number,
): { userAggression: number; opponentAggression: number } {
  const progress = regulationMinutes > 0 ? clamp(minute / regulationMinutes, 0, 1) : 1;
  const goalDifference = clamp(opponentGoals - userGoals, -4, 4);
  // 리드한 팀은 물러서고 뒤진 팀은 밀어붙인다. 이전 계수는 한 골 차 63분에서 스윙이
  // 6퍼센트에 그쳐 사실상 없는 것과 같았고, 그 결과 1대0으로 앞선 상대가 남은 27분에
  // 두 골을 더 넣는 축구가 아닌 결과가 나왔다. 경기 후반일수록 스윙이 커진다.
  const swing = clamp(goalDifference * (0.06 + progress * 0.16), -0.45, 0.45);
  return { userAggression: 1 + swing, opponentAggression: 1 - swing };
}

/** Aggregates player contributions; out-of-position fits reduce every team metric. */
export function teamStrength(players: readonly { ratings: PlayerRatings; fit: "primary" | "playable" | "poor" }[]): {
  attack: number;
  defense: number;
  control: number;
} {
  if (players.length === 0) return { attack: 0, defense: 0, control: 0 };

  const total = players.reduce(
    (result, player) => {
      const fitness = player.fit === "primary" ? 1 : player.fit === "playable" ? 0.9 : 0.72;
      const { pace, passing, finishing, defending, stamina, composure } = player.ratings;
      return {
        attack: result.attack + ((pace + passing + finishing + composure) / 4) * fitness,
        defense: result.defense + ((defending + stamina + composure) / 3) * fitness,
        control: result.control + ((pace + passing + stamina + composure) / 4) * fitness,
      };
    },
    { attack: 0, defense: 0, control: 0 },
  );

  return {
    attack: total.attack / players.length,
    defense: total.defense / players.length,
    control: total.control / players.length,
  };
}

function formationBias(formation: FormationPreset): number {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const slot of FORMATION_SLOTS[formation]) counts[slotRole(slot)] += 1;
  return counts.FW - counts.DF + counts.MF * 0.5;
}

function normalizeDirective(value: number): number {
  return clamp(value, -2, 2) / 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
