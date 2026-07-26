import type { AiResponse, AiState, TacticalDirectives } from "./types";

const AXES = ["defensiveLine", "pressing", "tempo", "attackRoute", "mindset"] as const;

type DirectiveAxis = (typeof AXES)[number];

const AXIS_LABELS: Readonly<Record<DirectiveAxis, string>> = {
  defensiveLine: "수비 라인",
  pressing: "압박 강도",
  tempo: "전개 속도",
  attackRoute: "공격 경로",
  mindset: "공격 성향",
};

/** Returns the most recent directive set that has cleared the AI's observation delay. */
export function observedDirectives(
  ai: AiState,
  history: readonly { readonly minute: number; readonly directives: TacticalDirectives }[],
  minute: number,
): TacticalDirectives | null {
  const latestObservableMinute = minute - ai.observationLagMinutes;
  let latest: { readonly minute: number; readonly directives: TacticalDirectives } | null = null;

  for (const entry of history) {
    if (entry.minute <= latestObservableMinute && (latest === null || entry.minute >= latest.minute)) {
      latest = entry;
    }
  }

  return latest?.directives ?? null;
}

/** A response needs both an unused budget point and an elapsed cooldown. */
export function canRespond(ai: AiState, minute: number): boolean {
  return ai.responseBudget > 0 && minute >= ai.cooldownUntilMinute;
}

/**
 * Selects a bounded tactical answer using a pre-drawn decision value.
 * A counter changes only one axis by one step and names a different exposed axis.
 */
export function chooseResponse(input: {
  readonly ai: AiState;
  readonly observed: TacticalDirectives;
  readonly own: TacticalDirectives;
  readonly minute: number;
  readonly draw: number;
}): AiResponse {
  const target = selectCounterAxis(input.observed, input.own, input.draw);
  const threshold = Math.max(0.2, Math.min(0.8, 0.45 + input.ai.riskTolerance * 0.1));

  if (target === null || input.draw >= threshold) {
    return {
      kind: "holdShape",
      directives: input.own,
      counteredWhat: "대형 유지",
      exposedWeakness: "반응 지연",
    };
  }

  const direction = Math.sign(input.observed[target]);
  const directives: TacticalDirectives = {
    ...input.own,
    [target]: clamp(input.own[target] - direction),
  };
  const exposedAxis = AXES[(AXES.indexOf(target) + 1) % AXES.length]!;

  return {
    kind: "counter",
    directives,
    counteredWhat: `${AXIS_LABELS[target]} 조정`,
    exposedWeakness: `${AXIS_LABELS[exposedAxis]} 공간`,
  };
}

/** Consumes one response budget point and starts the next cooldown without mutating its input. */
export function applyResponse(ai: AiState, minute: number, cooldownMinutes: number): AiState {
  return {
    ...ai,
    responseBudget: Math.max(0, ai.responseBudget - 1),
    cooldownUntilMinute: minute + Math.max(0, cooldownMinutes),
  };
}

/**
 * Measures only the opposing movement against changed user axes.
 * The 0.8 ceiling reserves at least 20% of every intervention's effect, even when
 * directive bounds make the one-step answer appear numerically complete.
 */
export function counterCoverage(userDelta: TacticalDirectives, aiResponse: AiResponse, own: TacticalDirectives): number {
  if (aiResponse.kind !== "counter") return 0;

  let changedAxes = 0;
  let covered = 0;
  for (const axis of AXES) {
    const userChange = userDelta[axis];
    if (userChange === 0) continue;

    changedAxes += 1;
    const opposingMovement = Math.max(0, -Math.sign(userChange) * (aiResponse.directives[axis] - own[axis]));
    covered += Math.min(1, opposingMovement / Math.abs(userChange));
  }

  if (changedAxes === 0) return 0;
  return Math.min(0.8, covered / changedAxes);
}

function selectCounterAxis(observed: TacticalDirectives, own: TacticalDirectives, draw: number): DirectiveAxis | null {
  const candidates = AXES.filter((axis) => observed[axis] !== 0 && canMoveAgainst(own[axis], observed[axis]));
  if (candidates.length === 0) return null;

  let greatestMagnitude = 0;
  for (const axis of candidates) greatestMagnitude = Math.max(greatestMagnitude, Math.abs(observed[axis]));
  const strongest = candidates.filter((axis) => Math.abs(observed[axis]) === greatestMagnitude);
  return strongest[Math.floor(draw * strongest.length) % strongest.length] ?? null;
}

function canMoveAgainst(current: number, observed: number): boolean {
  return observed > 0 ? current > -2 : current < 2;
}

function clamp(value: number): number {
  return Math.max(-2, Math.min(2, value));
}
