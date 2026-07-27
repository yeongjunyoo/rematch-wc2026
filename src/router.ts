import { useEffect, useState } from "react";

import { getScenario } from "./data/scenarios";

export type Route =
  | { kind: "home" }
  | { kind: "match"; scenarioId: string; attemptIndex: number }
  | { kind: "report"; scenarioId: string; attemptIndex: number }
  | { kind: "hallOfFame" }
  | { kind: "help" }
  | { kind: "notFound"; raw: string };

/**
 * 해시 라우팅. 정적 배포에서 서버 재작성 없이 직접 진입이 안전해야 한다.
 * 시도 번호는 선택 경로 조각으로 실어 "새 리매치" 링크가 공유 가능한 주소가 된다.
 */
export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#" || hash === "#/") {
    return { kind: "home" };
  }

  const match = /^#\/(match|report)\/([^/]+)(?:\/(\d+))?$/.exec(hash);
  if (match) {
    const [, kind, scenarioId, attempt] = match;
    const scenario = scenarioId === undefined ? undefined : getScenario(scenarioId);
    if (scenarioId === undefined || scenario === undefined) {
      return { kind: "notFound", raw: hash };
    }
    const parsedAttempt = attempt === undefined ? 0 : Number.parseInt(attempt, 10);
    if (!Number.isInteger(parsedAttempt) || parsedAttempt < 0 || parsedAttempt >= scenario.publishedSeedDeck.length) {
      return { kind: "notFound", raw: hash };
    }
    return kind === "match"
      ? { kind: "match", scenarioId, attemptIndex: parsedAttempt }
      : { kind: "report", scenarioId, attemptIndex: parsedAttempt };
  }

  if (hash === "#/hall-of-fame") {
    return { kind: "hallOfFame" };
  }

  if (hash === "#/help") {
    return { kind: "help" };
  }

  return { kind: "notFound", raw: hash };
}

export function routeToHash(route: Route): string {
  switch (route.kind) {
    case "home":
      return "#/";
    case "match":
      return matchHash(route.scenarioId, route.attemptIndex);
    case "report":
      return reportHash(route.scenarioId, route.attemptIndex);
    case "hallOfFame":
      return "#/hall-of-fame";
    case "help":
      return "#/help";
    case "notFound":
      return route.raw;
  }
}

export function matchHash(scenarioId: string, attemptIndex: number): string {
  return attemptIndex === 0 ? `#/match/${scenarioId}` : `#/match/${scenarioId}/${attemptIndex}`;
}

export function reportHash(scenarioId: string, attemptIndex: number): string {
  return attemptIndex === 0 ? `#/report/${scenarioId}` : `#/report/${scenarioId}/${attemptIndex}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const updateRoute = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", updateRoute);
    updateRoute();
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  return route;
}
