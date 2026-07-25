import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { parseRoute, routeToHash } from "../../src/router";

describe("hash router", () => {
  it("parses blank hashes and the root as home", () => {
    expect(parseRoute("")).toEqual({ kind: "home" });
    expect(parseRoute("#/")).toEqual({ kind: "home" });
  });

  it("parses known match and report routes", () => {
    expect(parseRoute("#/match/za-kor-2026")).toEqual({ kind: "match", scenarioId: "za-kor-2026" });
    expect(parseRoute("#/report/kor-cze-2026")).toEqual({ kind: "report", scenarioId: "kor-cze-2026" });
  });

  it("rejects an unknown scenario id", () => {
    expect(parseRoute("#/match/nope")).toEqual({ kind: "notFound", raw: "#/match/nope" });
  });

  it("parses the help route", () => {
    expect(parseRoute("#/help")).toEqual({ kind: "help" });
  });

  it("preserves an unknown route as raw text", () => {
    expect(parseRoute("not a route")).toEqual({ kind: "notFound", raw: "not a route" });
  });

  it("round trips every scenario route", () => {
    for (const scenario of SCENARIOS) {
      const match = { kind: "match" as const, scenarioId: scenario.id };
      const report = { kind: "report" as const, scenarioId: scenario.id };
      expect(parseRoute(routeToHash(match))).toEqual(match);
      expect(parseRoute(routeToHash(report))).toEqual(report);
    }
  });
});
