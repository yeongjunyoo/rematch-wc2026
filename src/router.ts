import { useEffect, useState } from "react";

import { getScenario } from "./data/scenarios";

export type Route =
  | { kind: "home" }
  | { kind: "match"; scenarioId: string }
  | { kind: "report"; scenarioId: string }
  | { kind: "help" }
  | { kind: "notFound"; raw: string };

export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#/") {
    return { kind: "home" };
  }

  const match = /^#\/(match|report)\/([^/]+)$/.exec(hash);
  if (match) {
    const [, kind, scenarioId] = match;
    if (!scenarioId || !getScenario(scenarioId)) {
      return { kind: "notFound", raw: hash };
    }
    return kind === "match"
      ? { kind: "match", scenarioId }
      : { kind: "report", scenarioId };
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
      return `#/match/${route.scenarioId}`;
    case "report":
      return `#/report/${route.scenarioId}`;
    case "help":
      return "#/help";
    case "notFound":
      return route.raw;
  }
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
