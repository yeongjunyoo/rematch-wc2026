import type { Intervention, MatchEvent, MatchState } from "../domain/types";

/**
 * 끝난 경기를 결과 리포트로 넘기는 단일 경로.
 *
 * 이전에는 `sessionStorage` 하나에만 의존했고 쓰기 실패를 조용히 삼켰다. 저장소가
 * 막힌 브라우저에서는 방금 경기를 끝낸 사용자가 리포트에서 "아직 플레이하지 않음"을
 * 보게 됐다. 이미 한 일을 안 했다고 말하는 셈이다.
 *
 * 그래서 같은 화면 세션의 메모리를 정본으로 두고 저장소는 새로고침을 견디기 위한
 * 사본으로만 쓴다. 저장이 실패해도 리포트는 결과를 받고, 저장이 되면 새로고침 뒤에도 남는다.
 */
export interface StoredMatchResult {
  readonly state: MatchState;
  readonly timeline: readonly MatchEvent[];
  /** 이 결과를 만든 확정 개입. 없으면 개입 내역을 복원할 수 없는 예전 저장본이다. */
  readonly interventions?: readonly Intervention[];
  readonly matchCode?: string;
  readonly attemptIndex?: number;
}

/** 저장소가 막혔는지. 화면이 그 사실을 정직하게 알릴 때 쓴다. */
export interface RecallOutcome {
  readonly result: StoredMatchResult | null;
  readonly source: "memory" | "storage" | "none";
}

const memory = new Map<string, StoredMatchResult>();

function keyFor(scenarioId: string, attemptIndex: number): string {
  return `rematch:result:${scenarioId}:${attemptIndex}`;
}

export function rememberResult(scenarioId: string, attemptIndex: number, result: StoredMatchResult): void {
  const key = keyFor(scenarioId, attemptIndex);
  memory.set(key, result);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    // 저장소가 막혀도 메모리 정본이 남아 있으므로 이번 세션의 리포트는 정상 동작한다.
  }
}

export function recallResult(scenarioId: string, attemptIndex: number): RecallOutcome {
  const key = keyFor(scenarioId, attemptIndex);
  const remembered = memory.get(key);
  if (remembered !== undefined && remembered.state.terminal !== null) {
    return { result: remembered, source: "memory" };
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return { result: null, source: "none" };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed) || !("timeline" in parsed)) {
      return { result: null, source: "none" };
    }
    const candidate = parsed as StoredMatchResult;
    if (candidate.state.terminal === null) return { result: null, source: "none" };
    if (!Array.isArray(candidate.timeline)) return { result: null, source: "none" };
    return { result: candidate, source: "storage" };
  } catch {
    return { result: null, source: "none" };
  }
}

/** 시험이 세션 간 오염 없이 돌 수 있게 한다. 제품 화면은 부르지 않는다. */
export function forgetAllResults(): void {
  memory.clear();
}
