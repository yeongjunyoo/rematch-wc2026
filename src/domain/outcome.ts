import type {
  DerivedOutcome,
  DerivedOutcomeRule,
  Grade,
  GradeRequirement,
  MissionGoal,
  TerminalFacts,
} from "./types";

type UserResult = "win" | "draw" | "loss";

/** 승무패 세 행으로 선언된 파생 결과를 고른다. */
export function evaluateDerivedOutcome(
  rule: DerivedOutcomeRule,
  userResult: UserResult,
): DerivedOutcome {
  switch (userResult) {
    case "win":
      return rule.onWin;
    case "draw":
      return rule.onDraw;
    case "loss":
      return rule.onLoss;
  }
}

/** 종료 사실에 시나리오의 파생 결과를 불변으로 붙인다. */
export function withDerivedOutcome(
  facts: TerminalFacts,
  rule: DerivedOutcomeRule | null,
): TerminalFacts {
  if (rule === null) {
    return facts;
  }

  return {
    ...facts,
    derivedOutcome: evaluateDerivedOutcome(rule, facts.userResult),
  };
}

/** 선언 순서의 첫 충족 커트라인으로 미션 등급을 정한다. */
export function evaluateGrade(mission: MissionGoal, facts: TerminalFacts): Grade {
  for (const cutline of mission.gradeCutlines) {
    if (meetsRequirement(cutline.requirement, facts)) {
      return cutline.grade;
    }
  }

  return "F";
}

function meetsRequirement(requirement: GradeRequirement, facts: TerminalFacts): boolean {
  switch (requirement.kind) {
    case "derivedAchieved":
      return facts.derivedOutcome?.achieved === true;
    case "userResult":
      return facts.userResult === requirement.result;
    case "goalDifferenceAtLeast":
      return facts.userGoals - facts.opponentGoals >= requirement.value;
    case "decidedBy":
      return facts.decidedPhase === requirement.phase;
    case "always":
      return true;
  }
}

/** 실제 결과와 사용자 결과를 관점 상대적으로 비교한다. */
export function compareToHistory(
  actual: TerminalFacts,
  mine: TerminalFacts,
): { changed: boolean; headline: string; deltaGoals: number } {
  const changed =
    actual.userResult !== mine.userResult ||
    actual.derivedOutcome?.achieved !== mine.derivedOutcome?.achieved;
  const deltaGoals =
    mine.userGoals - mine.opponentGoals - (actual.userGoals - actual.opponentGoals);

  return {
    changed,
    headline: changed
      ? "당신의 선택이 경기의 기억을 새롭게 썼습니다."
      : "당신은 그날의 결과를 정면으로 마주했습니다.",
    deltaGoals,
  };
}
