/**
 * 상징 선수 교체의 실측 효과.
 *
 * 3레인 리뷰가 짚었다. 실제 사용자는 극단적인 팀 지시가 아니라 손흥민 교체와 대형 변경을
 * 먼저 고른다. 그 경로가 기계적으로 무엇을 바꾸는지를 공개 시드 전수로 잰다.
 *
 *   node scripts/substitution-probe.mjs
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
if (signature === undefined) throw new Error("상징 선수가 선언되어 있지 않습니다.");

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

function play(attemptIndex, mode) {
  const base = initialPlacements(scenario.id);
  const outgoing = base[base.length - 1];
  const placements = mode === "none"
    ? base
    : base.map((placement) => placement.playerId === outgoing.playerId ? { playerId: signature.id, slot: placement.slot } : placement);
  const interventions = mode === "none" ? [] : [{
    tokenIndex: 0,
    atMinute: scenario.interventionStartMinute,
    directives: NEUTRAL_DIRECTIVES,
    formation: defaultFormation(scenario.id),
    placements,
    substitutions: [{ outId: outgoing.playerId, inId: signature.id }],
  }];
  const finished = runToTerminal(createRuntime(
    scenario,
    deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, ENGINE_VERSION, DATA_VERSION),
    startState(),
    interventions,
  ));
  const events = finished.state.events;
  return {
    userChances: events.filter((event) => event.type === "chance" && event.side === "user").length,
    goals: finished.state.terminal.userGoals,
    conceded: finished.state.terminal.opponentGoals,
    result: finished.state.terminal.userResult,
    signature: [...events].some((event) => event.type === "goal" && event.side === "user" && event.scorerId === signature.id),
  };
}

let changedTimeline = 0;
let changedResult = 0;
let noneOk = 0;
let subOk = 0;
let signatureGoals = 0;

console.log(`상징 선수 ${signature.label} 교체만 했을 때 (지시와 대형은 그대로), 공개 시드 ${scenario.publishedSeedDeck.length}개\n`);
for (let attemptIndex = 0; attemptIndex < scenario.publishedSeedDeck.length; attemptIndex += 1) {
  const none = play(attemptIndex, "none");
  const sub = play(attemptIndex, "signature");
  if (none.userChances !== sub.userChances || none.goals !== sub.goals || none.conceded !== sub.conceded) changedTimeline += 1;
  if (none.result !== sub.result) changedResult += 1;
  if (none.result !== "loss") noneOk += 1;
  if (sub.result !== "loss") subOk += 1;
  if (sub.signature) signatureGoals += 1;
  console.log(`  시드 ${attemptIndex}: 교체 없음 ${none.goals}대${none.conceded} 찬스 ${none.userChances} / 교체 ${sub.goals}대${sub.conceded} 찬스 ${sub.userChances}${sub.signature ? ` (${signature.label} 득점)` : ""}`);
}

console.log(`\n타임라인이 달라진 시드: ${changedTimeline}/${scenario.publishedSeedDeck.length}`);
console.log(`결과가 달라진 시드: ${changedResult}/${scenario.publishedSeedDeck.length}`);
console.log(`패배를 면한 시드: 교체 없음 ${noneOk}, 교체 ${subOk}`);
console.log(`${signature.label}이 직접 득점한 시드: ${signatureGoals}`);
