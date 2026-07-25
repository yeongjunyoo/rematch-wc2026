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
      return <MatchRoom scenarioId={route.scenarioId} />;
    case "report":
      return <Report scenarioId={route.scenarioId} />;
    case "help":
      return <Help />;
    case "notFound":
      return (
        <main className="page narrow-page">
          <p className="eyebrow">경로를 찾을 수 없습니다</p>
          <h1>요청한 화면이 없습니다.</h1>
          <p>입력한 주소: {route.raw || "빈 해시"}</p>
          <a className="button-link" href="#/">홈으로 돌아가기</a>
        </main>
      );
  }
}
