import { useAgentSnapshot } from "./agent/bridge";
import { HallOfFame } from "./screens/HallOfFame";
import { Help } from "./screens/Help";
import { Home } from "./screens/Home";
import { MatchRoom } from "./screens/MatchRoom";
import { Report } from "./screens/Report";
import { useRoute } from "./router";

export function App() {
  const route = useRoute();

  switch (route.kind) {
    case "home":
      return <Home />;
    case "match":
      return <MatchRoom key={`${route.scenarioId}:${route.attemptIndex}`} scenarioId={route.scenarioId} attemptIndex={route.attemptIndex} />;
    case "report":
      return <Report key={`${route.scenarioId}:${route.attemptIndex}`} scenarioId={route.scenarioId} attemptIndex={route.attemptIndex} />;
    case "hallOfFame":
      return <HallOfFame />;
    case "help":
      return <Help />;
    case "notFound":
      return <NotFound raw={route.raw} />;
  }
}

function NotFound({ raw }: { readonly raw: string }) {
  useAgentSnapshot({
    screen: "notFound",
    headline: "요청한 화면이 없습니다",
    affordances: ["홈으로 돌아가기", "도움말 보기"],
    detail: { 입력한주소: raw || "빈 해시" },
    feed: [],
  });

  return (
    <main className="page narrow-page">
      <p className="eyebrow">경로를 찾을 수 없습니다</p>
      <h1>요청한 화면이 없습니다.</h1>
      <p>입력한 주소: {raw || "빈 해시"}</p>
      <p>주소를 잘못 입력했거나, 없는 경기 또는 없는 시도 번호를 가리키고 있습니다.</p>
      <nav className="screen-nav">
        <a className="button-link" href="#/">홈으로 돌아가기</a>
        <a href="#/help">도움말 보기</a>
      </nav>
    </main>
  );
}
