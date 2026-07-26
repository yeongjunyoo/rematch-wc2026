import type { FormationPreset, PitchSlot, Placement, TacticalDirectives } from "./types";

export type SlotRole = "GK" | "DF" | "MF" | "FW";
export type PositionFitness = "primary" | "playable" | "poor";

const GOALKEEPER: PitchSlot = { x: 5, y: 50 };

/**
 * Every preset has one goalkeeper, then defenders, midfielders, and forwards.
 * 4-3-3: GK 1, DF 4, MF 3, FW 3.
 * 4-2-3-1: GK 1, DF 4, MF 5, FW 1.
 * 3-4-3: GK 1, DF 3, MF 4, FW 3.
 * 3-5-2: GK 1, DF 3, MF 5, FW 2.
 * 5-4-1: GK 1, DF 5, MF 4, FW 1.
 */
export const FORMATION_SLOTS: Record<FormationPreset, readonly PitchSlot[]> = {
  "4-3-3": [
    GOALKEEPER,
    { x: 25, y: 15 }, { x: 25, y: 38 }, { x: 25, y: 62 }, { x: 25, y: 85 },
    { x: 50, y: 20 }, { x: 50, y: 50 }, { x: 50, y: 80 },
    { x: 75, y: 20 }, { x: 75, y: 50 }, { x: 75, y: 80 },
  ],
  "4-2-3-1": [
    GOALKEEPER,
    { x: 25, y: 15 }, { x: 25, y: 38 }, { x: 25, y: 62 }, { x: 25, y: 85 },
    { x: 48, y: 35 }, { x: 48, y: 65 }, { x: 56, y: 20 }, { x: 56, y: 50 }, { x: 56, y: 80 },
    { x: 78, y: 50 },
  ],
  "3-4-3": [
    GOALKEEPER,
    { x: 25, y: 25 }, { x: 25, y: 50 }, { x: 25, y: 75 },
    { x: 50, y: 15 }, { x: 50, y: 38 }, { x: 50, y: 62 }, { x: 50, y: 85 },
    { x: 75, y: 20 }, { x: 75, y: 50 }, { x: 75, y: 80 },
  ],
  "3-5-2": [
    GOALKEEPER,
    { x: 25, y: 25 }, { x: 25, y: 50 }, { x: 25, y: 75 },
    { x: 50, y: 10 }, { x: 50, y: 30 }, { x: 50, y: 50 }, { x: 50, y: 70 }, { x: 50, y: 90 },
    { x: 75, y: 35 }, { x: 75, y: 65 },
  ],
  "5-4-1": [
    GOALKEEPER,
    { x: 25, y: 10 }, { x: 25, y: 30 }, { x: 25, y: 50 }, { x: 25, y: 70 }, { x: 25, y: 90 },
    { x: 50, y: 20 }, { x: 50, y: 40 }, { x: 50, y: 60 }, { x: 50, y: 80 },
    { x: 75, y: 50 },
  ],
};

/**
 * Role boundaries use pitch depth: x <= 10 is GK, 10 < x <= 35 is DF,
 * 35 < x <= 60 is MF, and x > 60 is FW. The y coordinate is lateral only.
 */
export function slotRole(slot: PitchSlot): SlotRole {
  if (slot.x <= 10) return "GK";
  if (slot.x <= 35) return "DF";
  if (slot.x <= 60) return "MF";
  return "FW";
}

function normalizePosition(position: string): SlotRole | null {
  const normalized = position.trim().toUpperCase();
  if (normalized === "GK" || normalized === "GOALKEEPER") return "GK";
  if (["DF", "DEFENDER", "CB", "LB", "RB", "LWB", "RWB"].includes(normalized)) return "DF";
  if (["MF", "MIDFIELDER", "CM", "CDM", "CAM", "LM", "RM"].includes(normalized)) return "MF";
  if (["FW", "FORWARD", "ST", "CF", "LW", "RW"].includes(normalized)) return "FW";
  return null;
}

export function fitness(playerPosition: string, slot: PitchSlot): PositionFitness {
  const playerRole = normalizePosition(playerPosition);
  const targetRole = slotRole(slot);

  if (playerRole === null || playerRole === "GK" || targetRole === "GK") return playerRole === targetRole ? "primary" : "poor";
  if (playerRole === targetRole) return "primary";
  if ((playerRole === "DF" && targetRole === "MF") || (playerRole === "MF" && targetRole === "DF") ||
      (playerRole === "MF" && targetRole === "FW") || (playerRole === "FW" && targetRole === "MF")) {
    return "playable";
  }
  return "poor";
}

/** Throwing prevents an incomplete formation from reaching the simulation. */
export function applyPreset(preset: FormationPreset, playerIds: readonly string[]): readonly Placement[] {
  const slots = FORMATION_SLOTS[preset];
  if (playerIds.length !== slots.length) {
    throw new RangeError(`A formation requires exactly ${slots.length} players, received ${playerIds.length}.`);
  }
  return slots.map((slot, index) => ({ playerId: playerIds[index]!, slot }));
}

export function snapToNearestSlot(point: PitchSlot, slots: readonly PitchSlot[]): { index: number; slot: PitchSlot; distance: number } {
  if (slots.length === 0) throw new RangeError("Cannot snap to an empty slot list.");

  let nearestIndex = 0;
  let nearestSlot = slots[0]!;
  let nearestDistance = Math.hypot(point.x - nearestSlot.x, point.y - nearestSlot.y);

  for (let index = 1; index < slots.length; index += 1) {
    const slot = slots[index]!;
    const distance = Math.hypot(point.x - slot.x, point.y - slot.y);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestSlot = slot;
      nearestDistance = distance;
    }
  }

  return { index: nearestIndex, slot: nearestSlot, distance: nearestDistance };
}

export function swapPlacements(placements: readonly Placement[], aId: string, bId: string): readonly Placement[] {
  if (aId === bId) throw new RangeError("Two distinct player IDs are required for a swap.");
  const aIndex = placements.findIndex((placement) => placement.playerId === aId);
  const bIndex = placements.findIndex((placement) => placement.playerId === bId);
  if (aIndex === -1 || bIndex === -1) throw new RangeError("Both players must be on the pitch to swap placements.");

  const aPlacement = placements[aIndex]!;
  const bPlacement = placements[bIndex]!;
  return placements.map((placement, index) => {
    if (index === aIndex) return { playerId: placement.playerId, slot: bPlacement.slot };
    if (index === bIndex) return { playerId: placement.playerId, slot: aPlacement.slot };
    return placement;
  });
}

export type SubstitutionResult =
  | { ok: true; placements: readonly Placement[]; cardsUsed: number }
  | { ok: false; reason: string };

export function substitute(
  placements: readonly Placement[],
  outId: string,
  inId: string,
  cardsUsed: number,
  maxCards: number,
): SubstitutionResult {
  if (cardsUsed >= maxCards) return { ok: false, reason: "Substitution cards are exhausted." };
  const outIndex = placements.findIndex((placement) => placement.playerId === outId);
  if (outIndex === -1) return { ok: false, reason: "Outgoing player is not on the pitch." };
  if (placements.some((placement) => placement.playerId === inId)) {
    return { ok: false, reason: "Incoming player is already on the pitch." };
  }

  const outgoing = placements[outIndex]!;
  return {
    ok: true,
    placements: placements.map((placement, index) => index === outIndex ? { playerId: inId, slot: outgoing.slot } : placement),
    cardsUsed: cardsUsed + 1,
  };
}

export function clampToPitch(point: PitchSlot, margin = 0): PitchSlot {
  if (!Number.isFinite(margin) || margin < 0 || margin > 50) {
    throw new RangeError("Pitch margin must be between 0 and 50.");
  }
  return {
    x: Math.min(100 - margin, Math.max(margin, point.x)),
    y: Math.min(100 - margin, Math.max(margin, point.y)),
  };
}

function clampDirective(value: number): number {
  return Math.round(Math.min(2, Math.max(-2, value)));
}

export function clampDirectives(directives: TacticalDirectives): TacticalDirectives {
  return {
    defensiveLine: clampDirective(directives.defensiveLine),
    pressing: clampDirective(directives.pressing),
    tempo: clampDirective(directives.tempo),
    attackRoute: clampDirective(directives.attackRoute),
    mindset: clampDirective(directives.mindset),
  };
}
