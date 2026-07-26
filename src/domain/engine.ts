import { withDerivedOutcome } from "./outcome";
import { otherSide } from "./types";
import type {
  DecidedPhase,
  DerivedOutcomeRule,
  GoalKind,
  GoalEvent,
  MatchClock,
  MatchFormat,
  MatchState,
  PenaltyAttemptEvent,
  PenaltyResult,
  Phase,
  PhaseChangeEvent,
  ShootoutState,
  Side,
  TerminalFacts,
} from "./types";

export function advanceClock(clock: MatchClock, _format: MatchFormat): MatchClock {
  if (clock.phase === "shootout" || clock.phase === "finished") {
    return clock;
  }

  return {
    ...clock,
    minute: clock.minute + 1,
    absoluteMinute: clock.absoluteMinute + 1,
  };
}

// Pass null explicitly when no rule applies; omission is a compile-time error.
export function stepPhase(
  state: MatchState,
  format: MatchFormat,
  derivedOutcomeRule: DerivedOutcomeRule | null,
): { state: MatchState; changed: PhaseChangeEvent | null } {
  if (state.clock.phase === "regulation") {
    if (state.clock.minute < format.regulationMinutes + format.regulationStoppage) {
      return { state, changed: null };
    }

    if (state.userGoals !== state.opponentGoals) {
      return finish(state, "regulationEnded", derivedOutcomeRule);
    }

    if (format.extraTimeRule !== "none") {
      return changePhase(state, "extraTime", "regulationEnded");
    }

    return format.shootoutOnTie
      ? startShootout(state)
      : finish(state, "regulationEnded", derivedOutcomeRule);
  }

  if (state.clock.phase === "extraTime") {
    if (format.extraTimeRule === "suddenDeath" && state.userGoals !== state.opponentGoals) {
      return finish(state, "goldenGoal", derivedOutcomeRule);
    }

    if (state.clock.minute < format.extraTimeMinutes) {
      return { state, changed: null };
    }

    if (state.userGoals !== state.opponentGoals) {
      return finish(state, "extraTimeEnded", derivedOutcomeRule);
    }

    return format.shootoutOnTie
      ? startShootout(state)
      : finish(state, "extraTimeEnded", derivedOutcomeRule);
  }

  return { state, changed: null };
}

// Pass null explicitly when no rule applies; omission is a compile-time error.
export function applyGoal(
  state: MatchState,
  format: MatchFormat,
  goal: { side: Side; scorerId: string; kind: GoalKind; assistId?: string },
  derivedOutcomeRule: DerivedOutcomeRule | null,
): MatchState {
  if (state.clock.phase === "finished" || state.clock.phase === "shootout") {
    return state;
  }

  const event: GoalEvent = {
    type: "goal",
    side: goal.side,
    scorerId: goal.scorerId,
    ...(goal.assistId === undefined ? {} : { assistId: goal.assistId }),
    kind: goal.kind,
    clock: state.clock,
  };
  const scored: MatchState = {
    ...state,
    userGoals: state.userGoals + (goal.side === "user" ? 1 : 0),
    opponentGoals: state.opponentGoals + (goal.side === "opponent" ? 1 : 0),
    events: [...state.events, event],
  };

  if (scored.clock.phase === "extraTime" && format.extraTimeRule === "suddenDeath") {
    return finish(scored, "goldenGoal", derivedOutcomeRule).state;
  }

  return scored;
}

// Pass null explicitly when no rule applies; omission is a compile-time error.
export function applyPenaltyAttempt(
  state: MatchState,
  format: MatchFormat,
  attempt: { side: Side; takerId: string; result: PenaltyResult },
  derivedOutcomeRule: DerivedOutcomeRule | null,
): MatchState {
  if (state.clock.phase !== "shootout" || state.shootout === null) {
    return state;
  }

  const shootout = state.shootout;
  const userAttemptsBefore = shootout.attempts.filter((entry) => entry.side === "user").length;
  const opponentAttemptsBefore = shootout.attempts.length - userAttemptsBefore;
  const nextSide = shootout.nextSide ?? (userAttemptsBefore === opponentAttemptsBefore ? "user" : "opponent");
  if (attempt.side !== nextSide) {
    throw new Error(`Expected ${nextSide} to take the next penalty.`);
  }

  const attemptsBySide = shootout.attempts.filter((entry) => entry.side === attempt.side).length;
  if (!shootout.inSuddenDeath && attemptsBySide >= format.shootoutRegularRounds) {
    throw new Error("Regular shootout rounds are complete for this side.");
  }

  const event: PenaltyAttemptEvent = {
    type: "penaltyAttempt",
    side: attempt.side,
    takerId: attempt.takerId,
    round: state.clock.shootoutRound ?? shootout.completedRounds + 1,
    result: attempt.result,
    clock: state.clock,
  };
  const userScore = shootout.userScore + (attempt.side === "user" && attempt.result === "scored" ? 1 : 0);
  const opponentScore = shootout.opponentScore + (attempt.side === "opponent" && attempt.result === "scored" ? 1 : 0);
  const attempts = [...shootout.attempts, event];
  const userAttempts = attempts.filter((entry) => entry.side === "user").length;
  const opponentAttempts = attempts.filter((entry) => entry.side === "opponent").length;
  const completedRounds = Math.min(userAttempts, opponentAttempts);

  if (!shootout.inSuddenDeath) {
    const userRemaining = Math.max(0, format.shootoutRegularRounds - userAttempts);
    const opponentRemaining = Math.max(0, format.shootoutRegularRounds - opponentAttempts);
    const updated = updateShootout(state, {
      userScore,
      opponentScore,
      completedRounds,
      inSuddenDeath: false,
      nextSide: otherSide(attempt.side),
      attempts,
    });

    if (userScore > opponentScore + opponentRemaining || opponentScore > userScore + userRemaining) {
      return finish(updated, "decided", derivedOutcomeRule).state;
    }

    if (userAttempts === format.shootoutRegularRounds && opponentAttempts === format.shootoutRegularRounds) {
      if (userScore !== opponentScore) {
        return finish(updated, "decided", derivedOutcomeRule).state;
      }

      return {
        ...updated,
        shootout: {
          userScore,
          opponentScore,
          completedRounds: format.shootoutRegularRounds,
          inSuddenDeath: true,
          nextSide: otherSide(attempt.side),
          attempts,
        },
        clock: { ...updated.clock, shootoutRound: format.shootoutRegularRounds + 1 },
      };
    }

    return updated;
  }

  const updated = updateShootout(state, {
    userScore,
    opponentScore,
    completedRounds,
    inSuddenDeath: true,
    nextSide: otherSide(attempt.side),
    attempts,
  });
  if (userAttempts === opponentAttempts && userScore !== opponentScore) {
    return finish(updated, "decided", derivedOutcomeRule).state;
  }

  return updated;
}

export function deriveTerminalFacts(
  state: MatchState,
  scenario: { derivedOutcomeRule: DerivedOutcomeRule | null },
): TerminalFacts {
  const decidedPhase = findDecidedPhase(state);
  const shootout = state.shootout;
  const userResult = shootout !== null && shootout.userScore !== shootout.opponentScore
    ? (shootout.userScore > shootout.opponentScore ? "win" : "loss")
    : state.userGoals === state.opponentGoals
      ? "draw"
      : state.userGoals > state.opponentGoals
        ? "win"
        : "loss";
  return withDerivedOutcome({
    userGoals: state.userGoals,
    opponentGoals: state.opponentGoals,
    shootout,
    decidedPhase,
    userResult,
    derivedOutcome: null,
  }, scenario.derivedOutcomeRule);
}

function changePhase(
  state: MatchState,
  to: Exclude<Phase, "finished" | "shootout">,
  reason: PhaseChangeEvent["reason"],
): { state: MatchState; changed: PhaseChangeEvent } {
  const clock: MatchClock = {
    phase: to,
    minute: 0,
    absoluteMinute: state.clock.absoluteMinute,
    shootoutRound: null,
  };
  const changed: PhaseChangeEvent = { type: "phaseChange", from: state.clock.phase, to, reason, clock };
  return { state: { ...state, clock, events: [...state.events, changed] }, changed };
}

function startShootout(state: MatchState): { state: MatchState; changed: PhaseChangeEvent } {
  const clock: MatchClock = {
    phase: "shootout",
    minute: 0,
    absoluteMinute: state.clock.absoluteMinute,
    shootoutRound: 1,
  };
  const changed: PhaseChangeEvent = {
    type: "phaseChange",
    from: state.clock.phase,
    to: "shootout",
    reason: "shootoutStarted",
    clock,
  };
  const shootout: ShootoutState = {
    userScore: 0,
    opponentScore: 0,
    completedRounds: 0,
    inSuddenDeath: false,
    nextSide: "user",
    attempts: [],
  };
  return { state: { ...state, clock, shootout, events: [...state.events, changed] }, changed };
}

function updateShootout(state: MatchState, shootout: ShootoutState): MatchState {
  const nextRound = shootout.completedRounds + 1;
  return {
    ...state,
    shootout,
    clock: { ...state.clock, shootoutRound: nextRound },
    events: [...state.events, shootout.attempts[shootout.attempts.length - 1]!],
  };
}

function finish(
  state: MatchState,
  reason: PhaseChangeEvent["reason"],
  derivedOutcomeRule: DerivedOutcomeRule | null,
): { state: MatchState; changed: PhaseChangeEvent } {
  const clock: MatchClock = {
    phase: "finished",
    minute: state.clock.minute,
    absoluteMinute: state.clock.absoluteMinute,
    shootoutRound: null,
  };
  const changed: PhaseChangeEvent = { type: "phaseChange", from: state.clock.phase, to: "finished", reason, clock };
  const completed = { ...state, clock, events: [...state.events, changed] };
  return {
    state: { ...completed, terminal: deriveTerminalFacts(completed, { derivedOutcomeRule }) },
    changed,
  };
}

function findDecidedPhase(state: MatchState): DecidedPhase {
  const finalChange = [...state.events].reverse().find(
    (event): event is PhaseChangeEvent => event.type === "phaseChange" && event.to === "finished",
  );
  if (finalChange?.reason === "goldenGoal") {
    return "goldenGoal";
  }
  if (finalChange?.reason === "extraTimeEnded") {
    return "extraTime";
  }
  if (finalChange?.reason === "decided" || state.shootout !== null) {
    return "shootout";
  }
  return "regulation";
}
