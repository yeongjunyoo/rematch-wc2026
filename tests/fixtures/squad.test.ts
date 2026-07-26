import { describe, expect, it } from "vitest";
import { initialPlacements, squadFor } from "../../src/ui/squad";

const scenarioIds = ["za-kor-2026", "kor-cze-2026", "esp-arg-2026-final", "ger-par-2026-r32", "kor-ita-2002"] as const;

const hasPlayer = (players: readonly { readonly id: string; readonly label: string }[], id: string, label: string) =>
  players.some((player) => player.id === id || player.label === label);

describe("scenario squads", () => {
  it("provides eleven starters, one goalkeeper, and five bench players for every scenario", () => {
    for (const scenarioId of scenarioIds) {
      const squad = squadFor(scenarioId);
      expect(squad.starters).toHaveLength(11);
      expect(squad.starters.filter((player) => player.position === "GK")).toHaveLength(1);
      expect(squad.bench.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps required historical players in their scenario roles", () => {
    const southAfrica = squadFor("za-kor-2026");
    expect(hasPlayer(southAfrica.bench, "son-heung-min", "손흥민")).toBe(true);
    expect(southAfrica.starters.every((player) => player.confirmed)).toBe(true);
    expect(southAfrica.starters.map((player) => player.label)).toEqual(["김승규", "이한범", "김민재", "이기혁", "설영우", "백승호", "황인범", "이태석", "이강인", "황희찬", "오현규"]);
    expect(hasPlayer(squadFor("esp-arg-2026-final").starters, "lionel-messi", "리오넬 메시")).toBe(true);
    expect(hasPlayer(squadFor("ger-par-2026-r32").starters, "kai-havertz", "카이 하베르츠")).toBe(true);
  });

  it("places every starter once inside the normalized pitch", () => {
    for (const scenarioId of scenarioIds) {
      const placements = initialPlacements(scenarioId);
      expect(placements).toHaveLength(11);
      expect(new Set(placements.map((placement) => `${placement.slot.x},${placement.slot.y}`)).size).toBe(11);
      expect(placements.every(({ slot }) => slot.x >= 0 && slot.x <= 100 && slot.y >= 0 && slot.y <= 100)).toBe(true);
    }
  });

  it("marks numbered reconstructed players as unconfirmed and named records as confirmed", () => {
    for (const scenarioId of scenarioIds) {
      const squad = squadFor(scenarioId);
      for (const player of [...squad.starters, ...squad.bench]) {
        if (player.label === "GK" || /^(DF|MF|FW) \d$/.test(player.label)) expect(player.confirmed).toBe(false);
      }
    }
    expect(squadFor("za-kor-2026").bench.find((player) => player.id === "son-heung-min")?.confirmed).toBe(true);
  });
});
