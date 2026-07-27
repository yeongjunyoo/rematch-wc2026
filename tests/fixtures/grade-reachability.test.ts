import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../../src/data/scenarios";
import { evaluateGrade, withDerivedOutcome } from "../../src/domain/outcome";
import type { DecidedPhase, ScenarioDeclaration, TerminalFacts } from "../../src/domain/types";

interface Scoreline {
  readonly userGoals: number;
  readonly opponentGoals: number;
  readonly userResult: TerminalFacts["userResult"];
}

const REGULAR_SCORELINES: readonly Scoreline[] = [
  { userGoals: 5, opponentGoals: 1, userResult: "win" },
  { userGoals: 3, opponentGoals: 1, userResult: "win" },
  { userGoals: 2, opponentGoals: 1, userResult: "win" },
  { userGoals: 1, opponentGoals: 1, userResult: "draw" },
  { userGoals: 1, opponentGoals: 2, userResult: "loss" },
];

const SHOOTOUT_SCORELINES: readonly Scoreline[] = [
  { userGoals: 1, opponentGoals: 1, userResult: "win" },
  { userGoals: 1, opponentGoals: 1, userResult: "loss" },
];

function terminalPhases(scenario: ScenarioDeclaration): readonly DecidedPhase[] {
  const phases: DecidedPhase[] = ["regulation"];
  if (scenario.format.extraTimeRule !== "none") phases.push("extraTime");
  if (scenario.format.extraTimeRule === "suddenDeath") phases.push("goldenGoal");
  if (scenario.format.shootoutOnTie) phases.push("shootout");
  return phases;
}

function canEndDraw(scenario: ScenarioDeclaration, phase: DecidedPhase): boolean {
  if (phase === "regulation") return scenario.format.extraTimeRule === "none" && !scenario.format.shootoutOnTie;
  return phase === "extraTime" && !scenario.format.shootoutOnTie;
}

function terminalFacts(scenario: ScenarioDeclaration): readonly TerminalFacts[] {
  return terminalPhases(scenario).flatMap((decidedPhase) => {
    const scorelines = decidedPhase === "shootout"
      ? SHOOTOUT_SCORELINES
      : REGULAR_SCORELINES.filter((scoreline) => scoreline.userResult !== "draw" || canEndDraw(scenario, decidedPhase));

    return scorelines.map((scoreline) => withDerivedOutcome({
      userGoals: scoreline.userGoals,
      opponentGoals: scoreline.opponentGoals,
      shootout: decidedPhase === "shootout"
        ? { userScore: scoreline.userResult === "win" ? 5 : 4, opponentScore: scoreline.userResult === "win" ? 4 : 5, completedRounds: 5, inSuddenDeath: false, attempts: [] }
        : null,
      decidedPhase,
      userResult: scoreline.userResult,
      derivedOutcome: null,
    }, scenario.derivedOutcomeRule));
  });
}

describe("시나리오 등급 도달성", () => {
  it("각 시나리오의 보고서 등급은 적어도 하나의 가능한 종료 상태에서 반환된다", () => {
    for (const scenario of SCENARIOS) {
      const declaredGrades = new Set(scenario.mission.gradeCutlines.map((cutline) => cutline.grade));
      const reachedGrades = new Set(terminalFacts(scenario).map((facts) => evaluateGrade(scenario.mission, facts)));

      const unreachableGrades = [...declaredGrades].filter((grade) => !reachedGrades.has(grade));
      expect(unreachableGrades, `${scenario.displayTitle}에 도달할 수 없는 보고서 등급이 있습니다.`).toEqual([]);
    }
  });
});
