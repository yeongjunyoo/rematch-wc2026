/**
 * 전술 민감도와 사건 밀도 실측기.
 *
 * 두 페르소나가 나란히 "내 결정이 결과를 바꾸지 않는다"고 답했다. 원인이 사건이 너무
 * 드물어서인지, 전술이 실제로 효과가 없어서인지, 효과는 있는데 안 보이는 것인지를
 * 추측하지 않고 숫자로 가른다. 제품 코드를 고치기 전에 이 숫자를 먼저 본다.
 *
 *   node scripts/balance-probe.mjs
 */
import { SCENARIOS } from "../src/data/scenarios/index.ts";
import { deriveWorldSeed } from "../src/domain/rng.ts";
import { createRuntime, runToTerminal, simulateWithTrace } from "../src/domain/simulate.ts";
import { NEUTRAL_DIRECTIVES } from "../src/domain/types.ts";
import { DATA_VERSION, ENGINE_VERSION } from "../src/domain/version.ts";
import { defaultFormation, initialPlacements } from "../src/ui/squad.ts";

// 버전을 직접 적으면 엔진을 올릴 때 프로브만 옛 시드 공간을 재게 된다.
const ENGINE = ENGINE_VERSION;
const DATA = DATA_VERSION;

function startState(scenario) {
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

function interventionOf(scenario, directives) {
  return {
    tokenIndex: 0,
    atMinute: scenario.interventionStartMinute,
    directives,
    formation: defaultFormation(scenario.id),
    placements: initialPlacements(scenario.id),
    substitutions: [],
  };
}

const ALL_IN = { defensiveLine: 2, pressing: 2, tempo: 2, attackRoute: 0, mindset: 2 };
const ALL_OUT = { defensiveLine: -2, pressing: -2, tempo: -2, attackRoute: 0, mindset: -2 };

function play(scenario, attemptIndex, directives) {
  const world = deriveWorldSeed(scenario.id, attemptIndex, scenario.publishedSeedDeck, ENGINE, DATA);
  const interventions = directives === null ? [] : [interventionOf(scenario, directives)];
  const finished = runToTerminal(createRuntime(scenario, world, startState(scenario), interventions));
  const events = finished.state.events;
  return {
    userChances: events.filter((event) => event.type === "chance" && event.side === "user").length,
    opponentChances: events.filter((event) => event.type === "chance" && event.side === "opponent").length,
    userGoals: finished.state.terminal.userGoals,
    opponentGoals: finished.state.terminal.opponentGoals,
    result: finished.state.terminal.userResult,
    minutes: finished.state.clock.absoluteMinute - scenario.interventionStartMinute,
  };
}

console.log("=== 사건 밀도와 결과 민감도 (공개 시드 덱 8개 전수) ===\n");

for (const scenario of SCENARIOS) {
  const deck = scenario.publishedSeedDeck.length;
  const rows = [];
  for (let attemptIndex = 0; attemptIndex < deck; attemptIndex += 1) {
    rows.push({
      attemptIndex,
      neutral: play(scenario, attemptIndex, NEUTRAL_DIRECTIVES),
      allIn: play(scenario, attemptIndex, ALL_IN),
      allOut: play(scenario, attemptIndex, ALL_OUT),
    });
  }

  const avg = (pick) => (rows.reduce((total, row) => total + pick(row), 0) / rows.length).toFixed(2);
  const changedResult = rows.filter((row) => row.allIn.result !== row.neutral.result).length;
  const changedScore = rows.filter((row) => row.allIn.userGoals !== row.neutral.userGoals || row.allIn.opponentGoals !== row.neutral.opponentGoals).length;
  // 남아공전은 비기기만 해도 진출이다. 승리만 세면 실제 목표 달성률을 놓친다.
  const neutralOk = rows.filter((row) => row.neutral.result !== "loss").length;
  const allInOk = rows.filter((row) => row.allIn.result !== "loss").length;
  const allOutOk = rows.filter((row) => row.allOut.result !== "loss").length;

  console.log(`## ${scenario.id} (${scenario.interventionStartMinute}분 이어받기, 남은 시간 약 ${rows[0].neutral.minutes}분)`);
  console.log(`  중립     우리찬스 ${avg((r) => r.neutral.userChances)} 상대찬스 ${avg((r) => r.neutral.opponentChances)} 우리골 ${avg((r) => r.neutral.userGoals)} 상대골 ${avg((r) => r.neutral.opponentGoals)}`);
  console.log(`  전면공격 우리찬스 ${avg((r) => r.allIn.userChances)} 상대찬스 ${avg((r) => r.allIn.opponentChances)} 우리골 ${avg((r) => r.allIn.userGoals)} 상대골 ${avg((r) => r.allIn.opponentGoals)}`);
  console.log(`  전면수비 우리찬스 ${avg((r) => r.allOut.userChances)} 상대찬스 ${avg((r) => r.allOut.opponentChances)} 우리골 ${avg((r) => r.allOut.userGoals)} 상대골 ${avg((r) => r.allOut.opponentGoals)}`);
  console.log(`  전면공격이 결과를 바꾼 시드: ${changedResult}/${deck}, 스코어를 바꾼 시드: ${changedScore}/${deck}`);
  console.log("  패배를 면한 시드: 중립 " + neutralOk + "/" + deck + ", 전면공격 " + allInOk + "/" + deck + ", 전면수비 " + allOutOk + "/" + deck + "\n");
}

// 분당 기대 찬스율을 직접 본다. 사건이 드문 것이 밀도 문제인지 확인하는 1차 수치다.
const flagship = SCENARIOS[0];
const world = deriveWorldSeed(flagship.id, 0, flagship.publishedSeedDeck, ENGINE, DATA);
for (const [name, directives] of [["중립", NEUTRAL_DIRECTIVES], ["전면공격", ALL_IN], ["전면수비", ALL_OUT]]) {
  const trace = simulateWithTrace({
    scenario: flagship,
    world,
    interventions: [interventionOf(flagship, directives)],
    startState: startState(flagship),
  });
  const user = trace.expectedChanceTrace.filter((entry) => entry.side === "user");
  const opponent = trace.expectedChanceTrace.filter((entry) => entry.side === "opponent");
  const mean = (rows) => (rows.reduce((total, row) => total + row.expected, 0) / rows.length);
  console.log(`${flagship.id} ${name}: 분당 기대 찬스 우리 ${(mean(user) * 100).toFixed(1)}퍼센트, 상대 ${(mean(opponent) * 100).toFixed(1)}퍼센트, 관측 분 ${user.length}`);
}
