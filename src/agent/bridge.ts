/**
 * 에이전트 브리지.
 *
 * 자동 플레이테스트 연구의 1차 결론은 "LLM은 게임 화면을 보지 못한다"이다.
 * 기존 연구가 텍스트 게임이나 상태 API가 있는 게임에 몰려 있는 이유가 그것이다
 * (FSE 2025, Towards LLM-Based Automatic Playtest). 그래서 화면이 지금 무엇을
 * 보여주고 있는지를 기계가 읽을 수 있는 형태로 따로 내보낸다.
 *
 * 규칙 두 가지.
 *  1. 이 브리지는 **읽기 전용**이다. 여기로 경기를 조작할 수 없다. 에이전트도
 *     사람과 똑같이 화면의 버튼을 눌러야 한다. 조작 경로를 따로 열어주면
 *     "에이전트는 되는데 사람은 안 되는" 경로가 생겨 테스트가 거짓말을 한다.
 *  2. 스냅샷은 화면에 실제로 보이는 것만 담는다. 내부 상태를 더 주면 에이전트가
 *     사람이 못 보는 정보로 판단하게 되고, 그 피드백은 사람의 경험이 아니다.
 */

import { useEffect } from "react";

export type AgentScreen = "home" | "match" | "report" | "hallOfFame" | "help" | "notFound";

export interface AgentSnapshot {
  readonly version: 1;
  readonly screen: AgentScreen;
  readonly hash: string;
  /** 화면에서 지금 누를 수 있는 것들의 표시 문구. 에이전트는 이 문구로 클릭한다. */
  readonly affordances: readonly string[];
  readonly headline: string;
  readonly detail: Record<string, string | number | boolean | null>;
  /** 최근 사건 문구. 매치룸과 리포트에서만 채워진다. */
  readonly feed: readonly string[];
}

const EMPTY: AgentSnapshot = {
  version: 1,
  screen: "home",
  hash: "#/",
  affordances: [],
  headline: "",
  detail: {},
  feed: [],
};

let current: AgentSnapshot = EMPTY;

export function publishSnapshot(next: Omit<AgentSnapshot, "version" | "hash">): void {
  current = {
    ...next,
    version: 1,
    hash: typeof window === "undefined" ? "#/" : window.location.hash || "#/",
  };
  install();
}

export function readSnapshot(): AgentSnapshot {
  return current;
}

function install(): void {
  if (typeof window === "undefined") return;
  const target = window as unknown as { __REMATCH__?: { snapshot: () => AgentSnapshot } };
  if (target.__REMATCH__ !== undefined) return;
  target.__REMATCH__ = { snapshot: () => current };
}

/**
 * 화면이 렌더될 때마다 스냅샷을 갱신한다.
 * 의존성 배열을 두지 않는 이유는 화면 상태가 매 tick 바뀌기 때문이다.
 * 발행 자체는 객체 대입 한 번이라 렌더 비용에 영향이 없다.
 */
export function useAgentSnapshot(next: Omit<AgentSnapshot, "version" | "hash">): void {
  useEffect(() => {
    publishSnapshot(next);
  });
}
