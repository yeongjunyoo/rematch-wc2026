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

/** Returns a deterministic authored balance profile in the inclusive 60..85 range. */
export function ratingsFor(scenarioId: string, playerId: string, position: Position): PlayerRatings {
  const baseline = ROLE_BASELINES[position];
  const ratings = {} as PlayerRatings;

  for (const key of RATING_KEYS) {
    const variation = (hashSeed(`${scenarioId}:${playerId}:${position}:${key}`) % 5) - 2;
    ratings[key] = baseline[key] + variation;
  }

  return ratings;
}

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
    concede: 1 + defensiveLine * 0.22 + pressing * 0.05 + tempo * 0.14 + mindset * 0.29,
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
  const swing = clamp(goalDifference * (0.02 + progress * 0.06), -0.3, 0.3);
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
