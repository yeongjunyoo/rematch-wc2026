/**
 * 첫 시도 시드 탐색기.
 *
 * 모든 사용자의 첫 경험은 시도 0이다. 그 시드에서 상징 선수 투입이 아무것도 바꾸지 않으면
 * 첫 경험이 "내 결정은 무의미하다"가 된다. 실측에서 정확히 그랬다.
 *
 * 시드 문자열을 바꾸면 그 시도의 경기가 통째로 달라지므로, 조건에 맞는 문자열을 찾는다.
 * 조건은 두 가지다. 아무것도 안 하면 역사대로 지고, 상징 선수를 넣으면 패배를 면한다.
 * 이것은 결과를 조작하는 것이 아니라 첫 경험이 제품의 약속을 보여주도록 배치하는 것이다.
 *
 *   node scripts/seed-search.mjs
 */
import { SCENARIOS } from "../src/data/scenarios/index.ts";
import { deriveWorldSeed } from "../src/domain/rng.ts";
import { createRuntime, runToTerminal } from "../src/domain/simulate.ts";
import { NEUTRAL_DIRECTIVES } from "../src/domain/types.ts";
import { DATA_VERSION, ENGINE_VERSION } from "../src/domain/version.ts";
import { defaultFormation, initialPlacements, squadFor } from "../src/ui/squad.ts";

const scenario = SCENARIOS[0];
const squad = squadFor(scenario.id);
const signature = squad.bench.find((player) => player.signature === true);

function startState() {
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

function play(seed, withSubstitution) {
  const base = initialPlacements(scenario.id);
  const outgoing = [...base].sort((left, right) => right.slot.x - left.slot.x)[0];
  const interventions = withSubstitution
    ? [{
      tokenIndex: 0,
      atMinute: scenario.interventionStartMinute,
      directives: NEUTRAL_DIRECTIVES,
      formation: defaultFormation(scenario.id),
      placements: base.map((placement) => placement.playerId === outgoing.playerId ? { playerId: signature.id, slot: placement.slot } : placement),
      substitutions: [{ outId: outgoing.playerId, inId: signature.id }],
    }]
    : [];
  const finished = runToTerminal(createRuntime(
    scenario,
    // 시도 0 자리에 이 시드를 놓았을 때를 재현한다.
    deriveWorldSeed(scenario.id, 0, [seed], ENGINE_VERSION, DATA_VERSION),
    startState(),
    interventions,
  ));
  const terminal = finished.state.terminal;
  return {
    result: terminal.userResult,
    score: `${terminal.userGoals}대${terminal.opponentGoals}`,
    signatureScored: finished.state.events.some((event) => event.type === "goal" && event.side === "user" && event.scorerId === signature.id),
  };
}

const found = [];
for (let index = 1; index <= 400 && found.length < 6; index += 1) {
  const seed = `za-kor-2026-${String(index).padStart(2, "0")}`;
  const without = play(seed, false);
  const withSub = play(seed, true);
  if (without.result === "loss" && withSub.result !== "loss") {
    found.push({ seed, without: `${without.score} ${without.result}`, withSub: `${withSub.score} ${withSub.result}`, scored: withSub.signatureScored });
  }
}

console.log(`조건을 만족하는 시드 ${found.length}개 (아무것도 안 하면 패배, ${signature.label} 투입이면 패배를 면함)\n`);
for (const row of found) {
  console.log(`  ${row.seed}: 그냥 두면 ${row.without} / 투입하면 ${row.withSub}${row.scored ? ` (${signature.label} 득점)` : ""}`);
}
