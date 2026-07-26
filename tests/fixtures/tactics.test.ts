import { describe, expect, it } from "vitest";
import type { FormationPreset, Placement, TacticalDirectives } from "../../src/domain/types";
import {
  FORMATION_SLOTS,
  clampDirectives,
  clampToPitch,
  fitness,
  slotRole,
  snapToNearestSlot,
  substitute,
  swapPlacements,
} from "../../src/domain/tactics";

const expectedLines: Record<FormationPreset, Record<"GK" | "DF" | "MF" | "FW", number>> = {
  "4-3-3": { GK: 1, DF: 4, MF: 3, FW: 3 },
  "4-2-3-1": { GK: 1, DF: 4, MF: 5, FW: 1 },
  "3-4-3": { GK: 1, DF: 3, MF: 4, FW: 3 },
  "3-5-2": { GK: 1, DF: 3, MF: 5, FW: 2 },
  "5-4-1": { GK: 1, DF: 5, MF: 4, FW: 1 },
};

const placements: readonly Placement[] = [
  { playerId: "a", slot: { x: 25, y: 25 } },
  { playerId: "b", slot: { x: 50, y: 50 } },
  { playerId: "c", slot: { x: 75, y: 75 } },
];

describe("tactics", () => {
  it("provides eleven distinct in-bounds slots with the declared line counts", () => {
    for (const [preset, slots] of Object.entries(FORMATION_SLOTS) as [FormationPreset, readonly { x: number; y: number }[]][]) {
      expect(slots).toHaveLength(11);
      expect(new Set(slots.map((slot) => `${slot.x},${slot.y}`)).size).toBe(11);
      expect(slots.every((slot) => slot.x >= 0 && slot.x <= 100 && slot.y >= 0 && slot.y <= 100)).toBe(true);

      const counts = slots.reduce<Record<"GK" | "DF" | "MF" | "FW", number>>(
        (total, slot) => ({ ...total, [slotRole(slot)]: total[slotRole(slot)] + 1 }),
        { GK: 0, DF: 0, MF: 0, FW: 0 },
      );
      expect(counts).toEqual(expectedLines[preset]);
    }
  });

  it("rates primary, adjacent, distant, and goalkeeper positions", () => {
    expect(fitness("DF", { x: 25, y: 50 })).toBe("primary");
    expect(fitness("DF", { x: 50, y: 50 })).toBe("playable");
    expect(fitness("DF", { x: 75, y: 50 })).toBe("poor");
    expect(fitness("GK", { x: 5, y: 50 })).toBe("primary");
    expect(fitness("GK", { x: 25, y: 50 })).toBe("poor");
    expect(fitness("MF", { x: 5, y: 50 })).toBe("poor");
  });

  it("snaps to the closest slot and keeps the first slot on a tie", () => {
    const slots = [{ x: 20, y: 50 }, { x: 80, y: 50 }] as const;
    expect(snapToNearestSlot({ x: 78, y: 50 }, slots)).toMatchObject({ index: 1, slot: slots[1], distance: 2 });
    expect(snapToNearestSlot({ x: 50, y: 50 }, slots)).toMatchObject({ index: 0, slot: slots[0], distance: 30 });
  });

  it("swaps slots without mutating the input placements", () => {
    const original = placements.map((placement) => ({ ...placement, slot: { ...placement.slot } }));
    const result = swapPlacements(placements, "a", "c");

    expect(result).toEqual([
      { playerId: "a", slot: { x: 75, y: 75 } },
      { playerId: "b", slot: { x: 50, y: 50 } },
      { playerId: "c", slot: { x: 25, y: 25 } },
    ]);
    expect(placements).toEqual(original);
  });

  it("rejects invalid substitutions and transfers the outgoing slot on success", () => {
    expect(substitute(placements, "a", "reserve", 3, 3)).toEqual({ ok: false, reason: "Substitution cards are exhausted." });
    expect(substitute(placements, "missing", "reserve", 0, 3)).toEqual({ ok: false, reason: "Outgoing player is not on the pitch." });
    expect(substitute(placements, "a", "b", 0, 3)).toEqual({ ok: false, reason: "Incoming player is already on the pitch." });
    expect(substitute(placements, "a", "reserve", 1, 3)).toEqual({
      ok: true,
      placements: [
        { playerId: "reserve", slot: { x: 25, y: 25 } },
        { playerId: "b", slot: { x: 50, y: 50 } },
        { playerId: "c", slot: { x: 75, y: 75 } },
      ],
      cardsUsed: 2,
    });
  });

  it("clamps pitch points and rounds directive values inside the limits", () => {
    expect(clampToPitch({ x: -3, y: 106 })).toEqual({ x: 0, y: 100 });
    expect(clampToPitch({ x: 2, y: 98 }, 5)).toEqual({ x: 5, y: 95 });

    const directives: TacticalDirectives = {
      defensiveLine: -3.2,
      pressing: -1.6,
      tempo: 0.49,
      attackRoute: 1.6,
      mindset: 3.2,
    };
    expect(clampDirectives(directives)).toEqual({
      defensiveLine: -2,
      pressing: -2,
      tempo: 0,
      attackRoute: 2,
      mindset: 2,
    });
  });
});
