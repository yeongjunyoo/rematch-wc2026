import { describe, expect, it } from "vitest";
import type { TacticalDirectives } from "../../src/domain/types";
import {
  directiveWeights,
  formationEdge,
  ratingsFor,
  scoreContext,
  staminaFactor,
  teamStrength,
} from "../../src/domain/ratings";

const neutral: TacticalDirectives = {
  defensiveLine: 0,
  pressing: 0,
  tempo: 0,
  attackRoute: 0,
  mindset: 0,
};

describe("ratings", () => {
  it("creates deterministic, narrowly bounded authored profiles", () => {
    const first = ratingsFor("scenario-a", "player-a", "MF");
    expect(ratingsFor("scenario-a", "player-a", "MF")).toEqual(first);
    expect(Object.values(first).every((rating) => rating >= 60 && rating <= 85)).toBe(true);
  });

  it("keeps qualitative positional differences without player likeness", () => {
    const goalkeeper = ratingsFor("scenario-a", "player-a", "GK");
    const forward = ratingsFor("scenario-a", "player-a", "FW");
    expect(goalkeeper.defending).toBeGreaterThan(forward.defending);
    expect(forward.finishing).toBeGreaterThan(goalkeeper.finishing);
  });

  it("makes formation edges symmetric and neutral against the same preset", () => {
    const forward = formationEdge("4-3-3", "5-4-1");
    const reverse = formationEdge("5-4-1", "4-3-3");
    expect(reverse.attack).toBe(-forward.attack);
    expect(reverse.defense).toBe(-forward.defense);
    expect(formationEdge("3-5-2", "3-5-2")).toEqual({ attack: 0, defense: 0 });
  });

  it("uses every directive axis", () => {
    const baseline = directiveWeights(neutral);
    const keys: readonly (keyof TacticalDirectives)[] = [
      "defensiveLine",
      "pressing",
      "tempo",
      "attackRoute",
      "mindset",
    ];

    for (const key of keys) {
      const changed = directiveWeights({ ...neutral, [key]: 1 });
      expect(changed).not.toEqual(baseline);
    }
  });

  it("makes attacking openness costly", () => {
    const cautious = directiveWeights({ ...neutral, mindset: -2 });
    const open = directiveWeights({ ...neutral, mindset: 2 });
    expect(open.userChance).toBeGreaterThan(cautious.userChance);
    expect(open.concede).toBeGreaterThan(cautious.concede);
  });

  it("reduces stamina with elapsed minutes while staying inside bounds", () => {
    const early = staminaFactor(10, 70, 1);
    const late = staminaFactor(80, 70, 1);
    expect(late).toBeLessThan(early);
    expect(staminaFactor(10_000, 0, 100)).toBeGreaterThan(0);
    expect(staminaFactor(10_000, 0, 100)).toBeLessThanOrEqual(1);
  });

  it("increases late urgency for the trailing team and lowers it for the leader", () => {
    const early = scoreContext(0, 1, 15, 90);
    const late = scoreContext(0, 1, 80, 90);
    expect(late.userAggression).toBeGreaterThan(early.userAggression);
    expect(late.opponentAggression).toBeLessThan(early.opponentAggression);
  });

  it("penalizes teams with more poor positional fits", () => {
    const ratings = { pace: 70, passing: 70, finishing: 70, defending: 70, stamina: 70, composure: 70 };
    const primary = teamStrength(Array.from({ length: 11 }, () => ({ ratings, fit: "primary" as const })));
    const poor = teamStrength(Array.from({ length: 11 }, () => ({ ratings, fit: "poor" as const })));
    expect(poor.attack).toBeLessThan(primary.attack);
    expect(poor.defense).toBeLessThan(primary.defense);
    expect(poor.control).toBeLessThan(primary.control);
  });
});
