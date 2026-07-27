/**
 * 경기 루프 종단 시험.
 *
 * 연기 시험(scripts/smoke.mjs)은 화면이 렌더된다는 것까지만 증명한다. 이 파일은
 * 실제 브라우저에서 버튼을 눌러 경기 시계가 흐르고, 개입이 토큰을 소모하고,
 * 다섯 시나리오가 각자의 종료 경로로 끝나 리포트와 기록까지 이어지는지를 본다.
 *
 *   node scripts/e2e.mjs
 *
 * 새 의존성을 쓰지 않는다. Chrome DevTools Protocol을 Node 내장 WebSocket으로 직접 말한다.
 */
import process from "node:process";

import { Page, baseUrlFor, killBrowser, launchBrowser, sleep, startPreview, waitFor } from "./lib/cdp.mjs";

/** REMATCH_BASE를 주면 배포된 주소를 그대로 검사한다. 주지 않으면 로컬 dist를 띄운다. */
const REMOTE = process.env.REMATCH_BASE;
const PREVIEW_PORT = 4179;
const CDP_PORT = 9333;
const BASE = baseUrlFor(PREVIEW_PORT, REMOTE);

const failures = [];
function check(label, condition, detail = "") {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures.push(label);
    console.error(`FAIL ${label} ${detail}`);
  }
}

const server = startPreview(PREVIEW_PORT, REMOTE);
console.log(`검사 대상: ${BASE}`);
let browser = null;

let page;
try {
  await waitFor(async () => (await fetch(BASE)).ok, 20000, "미리보기 서버가 뜨지 않았습니다");
  browser = launchBrowser(CDP_PORT);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 20000, "브라우저 디버깅 포트가 열리지 않았습니다");

  page = await Page.attach(CDP_PORT, BASE);
  await waitFor(() => page.evaluate(`document.querySelector("#root") !== null`), 10000, "첫 화면 로드 실패");

  // 1. 흐르는 경기 시계
  await page.goto("#/match/za-kor-2026");
  check("매치룸이 63분에서 멈춰 시작한다", (await page.text()).includes("63분"));
  check("4배속을 고를 수 있다", await page.clickText("4배속"));
  check("경기를 재개할 수 있다", await page.clickText("경기 재개"));
  // 시계는 마크업이 아니라 제품이 노출하는 스냅샷에서 읽는다. 화면 구조가 바뀌어도 계약은 그대로다.
  const clockNow = async () => (await page.snapshot())?.detail?.현재시각 ?? "";
  await waitFor(async () => !String(await clockNow()).startsWith("63"), 12000, "경기 시계가 흐르지 않았습니다");
  const advanced = String(await clockNow());
  check("경기 시계가 실제로 전진한다", advanced !== "63분", advanced);
  // 개입 없이 진행하면 3분 뒤 게임이 결정을 요구하며 멈춘다. 그 계약을 먼저 확인하고 이어간다.
  await waitFor(() => page.evaluate('document.querySelector(".decision-prompt") !== null'), 12000, "결정 요구가 뜨지 않았습니다");
  check("개입 없이 진행하면 게임이 결정을 요구한다", true);
  check("결정 요구 중에는 건너뛰기가 잠긴다", await page.evaluate('document.querySelector(".mh-skip-button")?.disabled === true'));
  check("이대로 본다로 빠져나올 수 있다", await page.clickText("이대로 본다"));
  await waitFor(() => page.evaluate(`document.querySelectorAll(".event-feed li").length > 0`), 15000, "경기 피드가 채워지지 않았습니다");
  check("경기 피드에 장면이 쌓인다", await page.evaluate(`document.querySelectorAll(".event-feed li").length > 0`));

  // 2. 개입이 토큰을 소모한다
  // 토큰 잔량도 마크업이 아니라 스냅샷 계약에서 읽는다.
  const tokensLeft = async () => (await page.snapshot())?.detail?.남은개입토큰;

  check("일시정지할 수 있다", await page.clickText("일시정지"));
  check("더그아웃이 열린다", await page.clickText("전술 바꾸기"));
  await waitFor(() => page.evaluate(`document.querySelector(".dugout-overlay") !== null`), 5000, "더그아웃이 열리지 않았습니다");
  // 탭 두 번으로 교체가 되는지. 드래그만 되던 시절 축구 팬 페르소나가 손흥민을 못 넣고 이탈했다.
  check("벤치 선수를 눌러 고를 수 있다", await page.clickText("손흥민"));
  // 안내 정본은 더그아웃 상단의 상태 한 줄이다. 문구가 두 곳으로 갈리면 사용자가 무엇을 믿을지 모른다.
  await waitFor(() => page.evaluate('(document.querySelector(".dg-status-guide")?.innerText ?? "").includes("뺄 선수를 누르세요")'), 4000, "벤치 선택 안내가 뜨지 않았습니다");
  const tokensBeforeIncompleteSubstitution = await tokensLeft();
  check("미완성 교체를 확정할 수 있다", await page.clickText("개입 확정"));
  await waitFor(() => page.evaluate('(document.querySelector(".dugout-notice")?.innerText ?? "").includes("자리를 아직 고르지 않았습니다")'), 4000, "미완성 교체 안내가 뜨지 않았습니다");
  check("미완성 교체 뒤 더그아웃이 열린 채 남는다", await page.evaluate(`document.querySelector(".dugout-overlay") !== null`));
  check("미완성 교체에 토큰이 소모되지 않는다", (await tokensLeft()) === tokensBeforeIncompleteSubstitution);
  check("피치 선수를 눌러 교체한다", await page.clickText("오현규"));
  await waitFor(() => page.evaluate('(document.querySelector(".dugout-notice")?.innerText ?? "").includes("교체 카드를 사용했습니다")'), 4000, "교체가 성립하지 않았습니다");
  check("손흥민이 실제로 투입된다", await page.evaluate('[...document.querySelectorAll(".player-token")].some((node) => node.innerText.includes("손흥민"))'));

  check("팀 지시 탭으로 이동한다", await page.clickText("팀 지시"));
  await page.evaluate(`(() => {
    const slider = document.querySelector(".directive-controls input[type=range]");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(slider, "2");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  check("개입을 확정한다", await page.clickText("개입 확정"));
  await waitFor(() => page.evaluate(`document.querySelector(".dugout-overlay") === null`), 5000, "더그아웃이 닫히지 않았습니다");
  await waitFor(async () => (await tokensLeft()) === 2, 5000, "개입 토큰이 소모되지 않았습니다");
  check("개입 토큰이 하나 줄어든다", (await tokensLeft()) === 2);
  // 개입을 확정하면 경기가 스스로 재개된다. 킥오프 배너는 이미 사라졌으므로 그냥 지켜본다는 없다.
  check("개입 확정이 경기를 자동으로 재개한다", (await page.snapshot())?.detail?.재생중 === true);
  const substitutionInFeed = async () => (await page.snapshot())?.feed.some((event) => event.includes("손흥민") && event.includes("오현규")) ?? false;
  await waitFor(substitutionInFeed, 12000, "경기 피드에 교체 사건이 쌓이지 않았습니다");
  check("경기 피드가 들어간 선수와 나간 선수 이름을 남긴다", await substitutionInFeed());
  check("교체 뒤 일시정지할 수 있다", await page.clickText("일시정지"));

  // 3. 바꾼 게 없으면 토큰을 쓰지 않는다
  check("더그아웃을 다시 연다", await page.clickText("전술 바꾸기"));
  await waitFor(() => page.evaluate(`document.querySelector(".dugout-overlay") !== null`), 5000, "더그아웃 재열기 실패");
  check("변화 없는 확정은 거절된다", await page.clickText("개입 확정"));
  await waitFor(() => page.evaluate(`(document.querySelector(".dugout-notice")?.innerText ?? "").includes("바뀐 전술이 없습니다")`), 5000, "no-op 안내가 뜨지 않았습니다");
  check("변화 없는 확정에 토큰이 소모되지 않는다", (await tokensLeft()) === 2);
  await page.clickText("취소");

  // 4. 다섯 시나리오가 각자의 종료 경로로 끝난다
  const scenarios = ["za-kor-2026", "kor-cze-2026", "esp-arg-2026-final", "ger-par-2026-r32", "kor-ita-2002"];
  for (const scenarioId of scenarios) {
    await page.goto(`#/match/${scenarioId}`);
    await page.skipToEnd();
    await waitFor(() => page.evaluate(`document.body.innerText.includes("경기가 끝났습니다")`), 15000, `${scenarioId} 경기가 끝나지 않았습니다`);

    await page.clickText("결과 리포트 보기");
    await waitFor(() => page.evaluate(`document.body.innerText.includes("등급")`), 5000, `${scenarioId} 리포트가 등급을 보여주지 않았습니다`);
    const report = await page.text();
    check(`${scenarioId} 리포트가 나의 결과를 보여준다`, report.includes("나의 결과"));
    check(`${scenarioId} 리포트가 등급을 판정한다`, /[SABF] 등급/.test(report));
    check(`${scenarioId} 리포트가 매치 코드를 남긴다`, report.includes("매치 코드"));
  }

  // 5. 저장소가 막혀도 방금 끝낸 경기의 리포트가 결과를 받는다.
  //    예전에는 sessionStorage 쓰기 실패를 삼켜서 이미 플레이한 사용자에게 아직 플레이하지 않았다고 말했다.
  await page.goto("#/match/kor-cze-2026");
  await page.evaluate(`(() => {
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); }, clear() { throw new Error("blocked"); }, key() { throw new Error("blocked"); }, get length() { throw new Error("blocked"); } };
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => blocked });
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => blocked });
    return true;
  })()`);
  await page.goto("#/match/kor-cze-2026");
  await page.skipToEnd();
  await waitFor(() => page.evaluate('document.body.innerText.includes("경기가 끝났습니다")'), 15000, "저장소 차단 상태에서 경기가 끝나지 않았습니다");
  await page.clickText("결과 리포트 보기");
  await waitFor(() => page.evaluate('document.body.innerText.includes("나의 결과")'), 6000, "저장소 차단 상태에서 리포트가 결과를 받지 못했습니다");
  check("저장소가 막혀도 리포트가 결과를 받는다", await page.evaluate('document.body.innerText.includes("나의 결과") && !document.body.innerText.includes("아직 이 시도의 결과가 없습니다")'));
  await page.evaluate('(() => { window.location.reload(); return true; })()');
  await sleep(1200);

  // 6. 기록이 남는다
  await page.goto("#/hall-of-fame");
  const hall = await page.text();
  check("명예의 전당이 다섯 경기를 모두 기록한다", /기록 5건/.test(hall), hall.split("\n").slice(0, 6).join(" | "));

  // 6. 없는 주소는 안내 화면으로 떨어진다
  await page.goto("#/match/za-kor-2026/99");
  check("없는 시도 번호는 안내 화면으로 간다", (await page.text()).includes("경로를 찾을 수 없습니다"));
} finally {
  page?.close();
  killBrowser(browser);
  server?.kill();
}

if (failures.length > 0) {
  console.error(`\n종단 시험 실패 ${failures.length}건.`);
  process.exit(1);
}
console.log("\n경기 루프가 다섯 시나리오 전부에서 끝까지 이어집니다.");
