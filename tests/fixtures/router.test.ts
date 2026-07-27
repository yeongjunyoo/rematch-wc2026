import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { matchHash, parseRoute, reportHash, routeToHash } from "../../src/router";

describe("hash router", () => {
  it("parses blank hashes and the root as home", () => {
    expect(parseRoute("")).toEqual({ kind: "home" });
    expect(parseRoute("#")).toEqual({ kind: "home" });
    expect(parseRoute("#/")).toEqual({ kind: "home" });
  });

  it("parses known match and report routes with the first attempt", () => {
    expect(parseRoute("#/match/za-kor-2026")).toEqual({ kind: "match", scenarioId: "za-kor-2026", attemptIndex: 0 });
    expect(parseRoute("#/report/kor-cze-2026")).toEqual({ kind: "report", scenarioId: "kor-cze-2026", attemptIndex: 0 });
  });

  it("parses an explicit attempt segment", () => {
    expect(parseRoute("#/match/za-kor-2026/3")).toEqual({ kind: "match", scenarioId: "za-kor-2026", attemptIndex: 3 });
  });

  it("rejects an attempt beyond the published seed deck", () => {
    const scenario = SCENARIOS[0]!;
    const overflow = `#/match/${scenario.id}/${scenario.publishedSeedDeck.length}`;
    expect(parseRoute(overflow)).toEqual({ kind: "notFound", raw: overflow });
  });

  it("rejects an unknown scenario id", () => {
    expect(parseRoute("#/match/nope")).toEqual({ kind: "notFound", raw: "#/match/nope" });
  });

  it("parses the help and hall of fame routes", () => {
    expect(parseRoute("#/help")).toEqual({ kind: "help" });
    expect(parseRoute("#/hall-of-fame")).toEqual({ kind: "hallOfFame" });
  });

  it("preserves an unknown route as raw text", () => {
    expect(parseRoute("not a route")).toEqual({ kind: "notFound", raw: "not a route" });
  });

  it("keeps the first attempt out of the shared address", () => {
    expect(matchHash("za-kor-2026", 0)).toBe("#/match/za-kor-2026");
    expect(reportHash("za-kor-2026", 0)).toBe("#/report/za-kor-2026");
    expect(matchHash("za-kor-2026", 2)).toBe("#/match/za-kor-2026/2");
  });

  it("round trips every scenario route across every published attempt", () => {
    for (const scenario of SCENARIOS) {
      for (let attemptIndex = 0; attemptIndex < scenario.publishedSeedDeck.length; attemptIndex += 1) {
        const match = { kind: "match" as const, scenarioId: scenario.id, attemptIndex };
        const report = { kind: "report" as const, scenarioId: scenario.id, attemptIndex };
        expect(parseRoute(routeToHash(match))).toEqual(match);
        expect(parseRoute(routeToHash(report))).toEqual(report);
      }
    }
  });
});
