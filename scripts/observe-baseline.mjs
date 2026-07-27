/**
 * 회귀 기준선 관측기.
 *
 * 엔진 계수를 의도적으로 바꾸면 고정 결과 기대값도 함께 갱신해야 한다. 그 값을
 * 손으로 적으면 틀리고, 틀린 기대값은 회귀 검사를 무력화한다. 여기서 실제로 실행해 찍는다.
 *
 *   node scripts/observe-baseline.mjs
 */
import { SCENARIOS } from "../src/data/scenarios/index.ts";
import { deriveWorldSeed } from "../src/domain/rng.ts";
import { simulateToTerminal } from "../src/domain/simulate.ts";
import { NEUTRAL_DIRECTIVES } from "../src/domain/types.ts";
import { defaultFormation, initialPlacements } from "../src/ui/squad.ts";

for (const scenario of SCENARIOS) {
  const startState = {
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
  const intervention = {
    tokenIndex: 0,
    atMinute: scenario.interventionStartMinute,
    directives: NEUTRAL_DIRECTIVES,
    formation: defaultFormation(scenario.id),
    placements: initialPlacements(scenario.id),
    substitutions: [],
  };
  const result = simulateToTerminal({
    scenario,
    world: deriveWorldSeed(scenario.id, 0, scenario.publishedSeedDeck, "opponent-shape", "opponent-shape"),
    interventions: [intervention],
    startState,
  });
  const terminal = result.state.terminal;
  console.log(`      { id: "${scenario.id}", score: [${result.state.userGoals}, ${result.state.opponentGoals}], decidedPhase: "${terminal.decidedPhase}", userResult: "${terminal.userResult}", eventCount: ${result.timeline.length} },`);
}
