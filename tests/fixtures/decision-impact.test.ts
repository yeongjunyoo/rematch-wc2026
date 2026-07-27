import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { deriveWorldSeed } from "../../src/domain/rng";
import { createRuntime, runToTerminal, simulateWithTrace } from "../../src/domain/simulate";
import { NEUTRAL_DIRECTIVES } from "../../src/domain/types";
import type { Intervention, MatchState, ScenarioDeclaration } from "../../src/domain/types";
import { DATA_VERSION, ENGINE_VERSION } from "../../src/domain/version";
import { defaultFormation, initialPlacements, squadFor } from "../../src/ui/squad";

const flagship = SCENARIOS[0]!;

function startState(scenario: ScenarioDeclaration): MatchState {
  return {
    clock: { phase: "regulation", minute: scenario.interventionStartMinute, absoluteMinute: scenario.interventionStartMinute, shootoutRound: null },
    userGoals: scenario.startingUserGoals,
    opponentGoals: scenario.startingOpponentGoals,
    shootout: null,
    events: [],
    tokensRemaining: 3,
    userDirectives: NEUTRAL_DIRECTIVES,
    opponentDirectives: NEUTRAL_DIRECTIVES,
    ai: { responseBudget: 2, cooldownUntilMinute: scenario.interventionStartMinute, lastObserved: null, observationLagMinutes: 2, riskTolerance: 1 },
    terminal: null,
  };
}

function worldFor(scenario: ScenarioDeclaration, attemptIndex: number) {
  return deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, ENGINE_VERSION, DATA_VERSION);
}

function signaturePlayer(scenario: ScenarioDeclaration) {
  return squadFor(scenario.id).bench.find((player) => player.signature === true);
}

function substitutionIntervention(scenario: ScenarioDeclaration): Intervention {
  const base = initialPlacements(scenario.id);
  const outgoing = base[base.length - 1]!;
  const incoming = signaturePlayer(scenario)!;
  return {
    tokenIndex: 0,
    atMinute: scenario.interventionStartMinute,
    directives: NEUTRAL_DIRECTIVES,
    formation: defaultFormation(scenario.id),
    placements: base.map((placement) => placement.playerId === outgoing.playerId ? { playerId: incoming.id, slot: placement.slot } : placement),
    substitutions: [{ outId: outgoing.playerId, inId: incoming.id }],
  };
}

function play(scenario: ScenarioDeclaration, attemptIndex: number, interventions: readonly Intervention[]) {
  return runToTerminal(createRuntime(scenario, worldFor(scenario, attemptIndex), startState(scenario), interventions));
}

/**
 * 이 제품의 근본 약속은 내 결정이 결과를 바꾼다는 것이다.
 * 자동 플레이테스트에서 두 페르소나가 나란히 그 체감을 부정했고, 실측 결과 원인은
 * 실제 사용자가 택하는 상징 선수 교체가 기계적으로 아무것도 바꾸지 않는다는 것이었다.
 * 이 파일은 그 경로가 실제로 무언가를 바꾼다는 사실을 공개 시드 전수로 고정한다.
 */
describe("결정이 결과를 바꾼다", () => {
  it("플래그십 시나리오에 상징 선수가 선언되어 있다", () => {
    const signature = signaturePlayer(flagship);
    expect(signature, "상징 선수가 없으면 이 제품의 서사가 성립하지 않는다").toBeDefined();
    expect(signature!.confirmed).toBe(true);
  });

  it("상징 선수 교체만으로 공개 시드 여덟 개 중 최소 두 개에서 결과가 달라진다", () => {
    const deck = flagship.publishedSeedDeck.length;
    let changedResult = 0;
    let changedTimeline = 0;
    for (let attemptIndex = 0; attemptIndex < deck; attemptIndex += 1) {
      const without = play(flagship, attemptIndex, []);
      const withSub = play(flagship, attemptIndex, [substitutionIntervention(flagship)]);
      if (without.state.terminal!.userResult !== withSub.state.terminal!.userResult) changedResult += 1;
      if (without.state.terminal!.userGoals !== withSub.state.terminal!.userGoals
        || without.state.terminal!.opponentGoals !== withSub.state.terminal!.opponentGoals) changedTimeline += 1;
    }
    expect(changedTimeline).toBeGreaterThanOrEqual(2);
    expect(changedResult).toBeGreaterThanOrEqual(2);
    // 매번 뒤집히면 역사를 다시 쓴다는 무게가 사라진다.
    expect(changedResult).toBeLessThan(flagship.publishedSeedDeck.length);
  });

  it("상징 선수가 실제로 득점하는 시드가 있다", () => {
    const signature = signaturePlayer(flagship)!;
    let scored = 0;
    for (let attemptIndex = 0; attemptIndex < flagship.publishedSeedDeck.length; attemptIndex += 1) {
      const finished = play(flagship, attemptIndex, [substitutionIntervention(flagship)]);
      if (finished.state.events.some((event) => event.type === "goal" && event.side === "user" && event.scorerId === signature.id)) scored += 1;
    }
    expect(scored).toBeGreaterThanOrEqual(2);
  });

  it("같은 결정은 여전히 같은 경기를 만든다", () => {
    const first = play(flagship, 3, [substitutionIntervention(flagship)]);
    const second = play(flagship, 3, [substitutionIntervention(flagship)]);
    expect(first.state).toEqual(second.state);
  });

  it("가뭄 보정은 세 분 안에는 걸리지 않고 상한을 넘지 않는다", () => {
    const trace = simulateWithTrace({
      scenario: flagship,
      world: worldFor(flagship, 0),
      interventions: [],
      startState: startState(flagship),
    }).expectedChanceTrace.filter((entry) => entry.side === "user");

    const first = trace[0]!;
    expect(first.expected, "첫 분에는 보정이 없다").toBe(first.base);
    for (const entry of trace) {
      expect(entry.expected).toBeGreaterThanOrEqual(entry.base);
      expect(entry.expected).toBeLessThanOrEqual(0.45);
      expect(entry.expected).toBeLessThanOrEqual(entry.base * 2.1 + 1e-9);
    }
  });

  it("상대에게는 가뭄 보정이 걸리지 않는다", () => {
    const trace = simulateWithTrace({
      scenario: flagship,
      world: worldFor(flagship, 0),
      interventions: [],
      startState: startState(flagship),
    }).expectedChanceTrace.filter((entry) => entry.side === "opponent");
    for (const entry of trace) expect(entry.expected).toBe(entry.base);
  });
});
