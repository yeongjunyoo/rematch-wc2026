import { describe, expect, it } from "vitest";

import { applyResponse, canRespond, chooseResponse, counterCoverage, observedDirectives } from "../../src/domain/ai";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { AiState, TacticalDirectives } from "../../src/domain/types";

const ai: AiState = {
  responseBudget: 2,
  cooldownUntilMinute: 10,
  lastObserved: null,
  observationLagMinutes: 3,
  riskTolerance: 4,
};

const attacking: TacticalDirectives = {
  defensiveLine: 2,
  pressing: 2,
  tempo: 2,
  attackRoute: 2,
  mindset: 2,
};

function delta(axis: keyof TacticalDirectives, value: number): TacticalDirectives {
  return { ...NEUTRAL_DIRECTIVES, [axis]: value };
}

describe("AI counter model", () => {
  it("does not observe a directive until its delay has elapsed", () => {
    const earlier = delta("pressing", 1);
    const recent = delta("mindset", 2);
    const history = [
      { minute: 10, directives: earlier },
      { minute: 12, directives: recent },
    ];

    expect(observedDirectives(ai, history, 12)).toBeNull();
    expect(observedDirectives(ai, history, 13)).toBe(earlier);
    expect(observedDirectives(ai, history, 15)).toBe(recent);
  });

  it("rejects responses without budget or before the cooldown", () => {
    expect(canRespond({ ...ai, responseBudget: 0 }, 20)).toBe(false);
    expect(canRespond(ai, 9)).toBe(false);
    expect(canRespond(ai, 10)).toBe(true);
  });

  it("names a non-empty weakness for counters across decision draws", () => {
    for (const draw of [0, 0.2, 0.6]) {
      const response = chooseResponse({ ai, observed: attacking, own: NEUTRAL_DIRECTIVES, minute: 20, draw });
      expect(response.kind).toBe("counter");
      expect(response.counteredWhat).not.toBe("");
      expect(response.exposedWeakness).not.toBe("");
    }
  });

  it("never lets a counter fully cover a one-axis user intervention", () => {
    const axes: readonly (keyof TacticalDirectives)[] = ["defensiveLine", "pressing", "tempo", "attackRoute", "mindset"];
    for (const axis of axes) {
      const userDelta = delta(axis, 2);
      for (const draw of [0, 0.2, 0.6]) {
        const response = chooseResponse({ ai, observed: userDelta, own: NEUTRAL_DIRECTIVES, minute: 20, draw });
        expect(response.kind).toBe("counter");
        expect(counterCoverage(userDelta, response, NEUTRAL_DIRECTIVES)).toBeLessThan(1);
      }
    }
  });

  it("consumes budget, advances cooldown, and preserves the input state", () => {
    const original: AiState = { ...ai, lastObserved: attacking };
    const next = applyResponse(original, 24, 8);

    expect(next).toEqual({ ...original, responseBudget: 1, cooldownUntilMinute: 32 });
    expect(original).toEqual({ ...ai, lastObserved: attacking });
  });

  it("cannot respond after a response sequence exhausts its budget", () => {
    const first = applyResponse({ ...ai, responseBudget: 2, cooldownUntilMinute: 0 }, 10, 0);
    const second = applyResponse(first, 11, 0);

    expect(canRespond(first, 10)).toBe(true);
    expect(canRespond(second, 11)).toBe(false);
  });
});
