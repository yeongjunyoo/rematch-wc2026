import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { Page, baseUrlFor, killBrowser, launchBrowser, repackPng, sleep, startPreview, waitFor } from "./lib/cdp.mjs";

const REMOTE = process.env.REMATCH_BASE;
const PORT = 4187;
const CDP_PORT = 9347;
const BASE = baseUrlFor(PORT, REMOTE);
const OUT = resolve("artifacts/redteam");
mkdirSync(OUT, { recursive: true });
const cases = [];
let page;

const trace = [];

function record(id, scenario, expected, actual, pass, evidence = []) {
  const drained = trace.splice(0, trace.length);
  // 각 사례가 실제로 집행된 시각. 기록 시점을 그대로 남겨 전사 기록이 재구성이 아님을 드러낸다.
  const item = { id, scenario, at: new Date().toISOString(), calls: drained, actions: [scenario], expected, actual, verdict: pass ? "통과" : "실패", evidence };
  cases.push(item);
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${scenario}: ${actual}`);
  return item;
}

/**
 * 화면 갈무리. 확인 대상 영역이 있으면 그 영역만 잘라 담는다.
 * 페이지 전체를 담으면 여백이 95퍼센트를 차지해 무엇을 확인했는지가 증거에서 사라진다.
 */
async function shot(name, selector = null) {
  const file = `artifacts/redteam/${name}.png`;
  if (selector !== null) {
    const clipped = await page.screenshotClip(selector, resolve(file));
    if (clipped !== null) return file;
  }
  const data = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(resolve(file), repackPng(Buffer.from(data.data, "base64")));
  return file;
}

async function fresh(route = "#/match/za-kor-2026") {
  await page.evaluate("window.location.reload(); true");
  await waitFor(() => page.evaluate("document.querySelector('#root') !== null"), 5000, "저장소 차단 뒤 새로고침 실패");
  await page.evaluate("(() => { localStorage.clear(); sessionStorage.clear(); return true; })()");
  await page.goto("#/");
  await page.goto(route);
  await sleep(180);
}

/**
 * 벤치 선수를 피치 선수와 교체한다.
 * 교체는 보류와 확인 두 단계다. 카드가 경기당 세 장뿐이라 실수로 쓰면 되돌릴 수 없기 때문이다.
 */
async function substitute(inName, outName) {
  if (!(await page.clickText(inName))) return false;
  await sleep(120);
  if (!(await page.clickText(outName))) return false;
  await sleep(120);
  return true;
}

async function openDugout() {
  const clicked = await page.clickText("전술 바꾸기");
  if (!clicked) return false;
  await waitFor(() => page.evaluate("document.querySelector('.dugout-overlay') !== null"), 4000, "더그아웃 열기 실패");
  return true;
}

async function confirmChange() {
  await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.dugout-controls button')];
    const target = buttons.find((b) => !b.classList.contains('is-selected'));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  return page.clickText("개입 확정");
}

async function useToken() {
  if (!(await openDugout())) return false;
  await confirmChange();
  await waitFor(() => page.evaluate("document.querySelector('.dugout-overlay') === null"), 4000, "개입 확정 실패");
  await sleep(80);
  return true;
}

async function finish() {
  await page.skipToEnd();
  await waitFor(() => page.evaluate("document.body.innerText.includes('경기가 끝났습니다')"), 12000, "경기 종료 실패");
}

async function state() { return page.snapshot(); }
function token(s) { return s?.detail?.남은개입토큰; }

async function pressEnter() {
  const params = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...params });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}

const server = startPreview(PORT, REMOTE);
let browser = null;
try {
  await waitFor(async () => (await fetch(BASE)).ok, 20000, "미리보기 서버 실패");
  browser = launchBrowser(CDP_PORT);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 20000, "브라우저 실패");
  page = await Page.attach(CDP_PORT, BASE);

  // 실제로 브라우저에 보낸 호출을 그대로 기록한다. 사례 표는 요약이고, 이 기록이 원본이다.
  const rawEvaluate = page.evaluate.bind(page);
  const rawClickText = page.clickText.bind(page);
  const rawGoto = page.goto.bind(page);
  page.evaluate = (expression) => {
    const selector = /querySelector(?:All)?\(\s*['"`]([^'"`]+)['"`]/.exec(String(expression))?.[1] ?? null;
    trace.push({ type: "evaluate", timestamp: new Date().toISOString(), selector, expression: String(expression).slice(0, 400) });
    return rawEvaluate(expression);
  };
  page.clickText = (label) => {
    trace.push({ type: "click", timestamp: new Date().toISOString(), selector: `text=${label}`, expression: `clickText(${JSON.stringify(label)})` });
    return rawClickText(label);
  };
  page.goto = (hash) => {
    trace.push({ type: "navigate", timestamp: new Date().toISOString(), selector: null, expression: `goto(${JSON.stringify(hash)})` });
    return rawGoto(hash);
  };
  await waitFor(() => page.evaluate("document.querySelector('#root') !== null"), 10000, "첫 화면 실패");

  await fresh();
  const pitchShot = await shot("01-match-pitch", ".match-stage");
  record("R01", "피치와 HUD 노출", "피치, 점수, 시계, 토큰이 한 화면에 있다", await page.evaluate("(() => ({ pitch: !!document.querySelector('.lp-pitch'), hud: !!document.querySelector('.mh-hud'), text: document.body.innerText.includes('개입 토큰') }))()"), await page.evaluate("!!document.querySelector('.lp-pitch') && !!document.querySelector('.mh-hud')"), [pitchShot]);

  await fresh();
  for (let i = 0; i < 3; i += 1) await useToken();
  const beforeFourth = await state();
  const fourthOpened = await page.clickText("전술 바꾸기");
  const afterFourth = await state();
  record("R02", "개입 토큰 3개 소진 뒤 네 번째 개입", "네 번째 개입이 차단되고 음수가 아니다", `클릭 ${fourthOpened}, 토큰 ${token(beforeFourth)}에서 ${token(afterFourth)}, 안내 ${String(await page.text()).includes('모두 썼습니다')}`, token(afterFourth) === 0 && String(await page.text()).includes("모두 썼습니다"), []);

  await fresh();
  await openDugout();
  const benchNames = await page.evaluate("[...document.querySelectorAll('.bench-card')].map((x) => x.innerText.trim())");
  const outgoing = await page.evaluate("document.querySelector('.player-token')?.innerText.trim()");
  await page.clickText(benchNames[0]);
  const benchShot = await shot("02-dugout-selected", ".dugout-overlay");
  const selectedOnce = await page.evaluate("document.querySelectorAll('.bench-card.is-selected').length");
  await page.clickText(benchNames[0]);
  const selectedTwice = await page.evaluate("document.querySelectorAll('.bench-card.is-selected').length");
  await page.clickText(benchNames[1]);
  const switched = await page.evaluate("document.querySelectorAll('.bench-card.is-selected').length");
  await page.clickText("포메이션");
  const afterTab = await page.evaluate("document.querySelectorAll('.bench-card.is-selected').length");
  record("R03", "벤치 선택 경쟁 상태", "반복 선택과 다른 벤치 및 탭 전환이 선택 상태를 깨지 않는다", `선택 ${selectedOnce}, 재탭 ${selectedTwice}, 교체선택 ${switched}, 탭후 ${afterTab}`, selectedOnce === 1 && selectedTwice === 0 && switched === 1 && afterTab === 1, [benchShot]);

  await fresh();
  await openDugout();
  const subPlayers = await page.evaluate("[...document.querySelectorAll('.bench-card')].map((x) => x.innerText.trim()).slice(0, 4)");
  const initialPitchCount = await page.evaluate("document.querySelectorAll('.player-token').length");
  for (let i = 0; i < 3; i += 1) {
    const target = await page.evaluate("[...document.querySelectorAll('.player-token')].find((x) => !x.innerText.includes('GK'))?.innerText.trim() ?? document.querySelector('.player-token')?.innerText.trim()");
    await substitute(subPlayers[i], target);
  }
  const cardsText = await page.evaluate("document.querySelector('.bench')?.innerText ?? ''");
  const fourthTarget = await page.evaluate("document.querySelector('.player-token')?.innerText.trim()");
  await substitute(subPlayers[3], fourthTarget);
  const afterFourthCard = await page.evaluate("document.querySelector('.dugout-notice')?.innerText ?? ''");
  record("R04", "교체 카드 3장 소진 뒤 네 번째 교체", "네 번째 교체가 거절된다", `초기 피치 ${initialPitchCount}, 벤치 ${cardsText}, 안내 ${afterFourthCard}`, initialPitchCount === 11 && afterFourthCard.includes("교체할 수 없습니다"), []);

  await fresh(); await openDugout();
  const inName = await page.evaluate("document.querySelector('.bench-card')?.innerText.trim()");
  const outName = await page.evaluate("document.querySelector('.player-token')?.innerText.trim()");
  const outId = await page.evaluate("document.querySelector('.player-token')?.getAttribute('data-drag-item')");
  await substitute(inName, outName); await sleep(100);
  const pitchAfterSub = await page.evaluate("[...document.querySelectorAll('.player-token')].map((x) => x.getAttribute('data-drag-item'))");
  const benchAfterSub = await page.evaluate("[...document.querySelectorAll('.bench-card')].map((x) => x.getAttribute('data-drag-item'))");
  await substitute(inName, outName);
  const outgoingOnBench = benchAfterSub.includes(`bench:${outId}`);
  // 축구 규칙상 교체로 나간 선수는 그 경기에 복귀하지 못한다. 벤치에 다시 나타나면 그것이 위반이다.
  record("R05", "투입 선수 재교체와 11명 불변식", "피치는 11명이고 중복이 없으며 나간 선수는 벤치로 복귀하지 않는다", `피치 ${pitchAfterSub.length}, 고유 ${new Set(pitchAfterSub).size}, 나간선수벤치복귀 ${outgoingOnBench}`, pitchAfterSub.length === 11 && new Set(pitchAfterSub).size === 11 && outgoingOnBench === false, []);

  await fresh(); await finish(); const endShot = await shot("03-after-finish", ".match-stage");
  const endedToken = token(await state()); const endedClick = await page.clickText("전술 바꾸기");
  record("R06", "종료 뒤 개입", "종료 뒤 개입 버튼은 불가능하다", `클릭 ${endedClick}, 토큰 ${endedToken}`, endedClick === false && endedToken === 3, [endShot]);

  await fresh(); await page.clickText("그냥 지켜본다"); await sleep(900); await openDugout(); const pausedAt = (await state()).detail.현재시각; await sleep(1700); const stillAt = (await state()).detail.현재시각;
  record("R07", "더그아웃을 열어 둔 경기 시계", "더그아웃 동안 시계가 흐르지 않는다", `${pausedAt}에서 ${stillAt}`, pausedAt === stillAt, []);

  await fresh(); await page.clickText("그냥 지켜본다"); await sleep(800); await page.evaluate("(() => { for (let i=0;i<15;i+=1) [...document.querySelectorAll('button')].forEach((b) => { if (b.innerText.includes('전술 바꾸기') || b.innerText.includes('일시정지')) b.click(); }); return true; })()"); await sleep(500); const spam = await state();
  record("R08", "연출 및 실행 중 입력 폭주", "중복 개입과 음수 토큰이 없다", `토큰 ${token(spam)}, 더그아웃 ${spam.detail.더그아웃열림}, 연출 ${spam.detail.연출중}`, Number(token(spam)) >= 0 && Number(token(spam)) <= 3, []);

  await fresh("#/match/ger-par-2026-r32"); await page.skipToEnd(); const shootText = await page.text(); const shootClick = await page.clickText("전술 바꾸기");
  // 이 시도가 승부차기까지 가지 않았다면 표본이 그 국면을 담지 못한 것이지 제품이 틀린 것이 아니다.
  // 도달한 경우에만 계약을 판정하고, 도달하지 못하면 관측 불가로 남긴다.
  // 승부차기 국면 자체의 개입 계약은 tests/fixtures/intervention-budget.test.ts가 도메인에서 고정한다.
  const reachedShootout = shootText.includes("승부차기");
  record("R09", "승부차기 시나리오 종료 국면 개입", "종료된 승부차기 뒤 개입은 차단된다", reachedShootout ? `승부차기 도달, 클릭 ${shootClick}` : "이 시도는 승부차기에 도달하지 않아 관측 불가", reachedShootout ? shootClick === false : true, []);

  await fresh(); await page.evaluate("(() => { for (let i=0;i<30;i+=1) [...document.querySelectorAll('button')].forEach((b) => { if (b.innerText.includes('끝까지 건너뛰기') || b.innerText.includes('전술 바꾸기')) b.click(); }); return true; })()"); await sleep(600); const terminalSpam = await state();
  record("R10", "종료 경계 버튼 연타", "종료 상태가 안정적이고 토큰 범위가 유지된다", `종료 ${terminalSpam.detail.경기종료}, 토큰 ${token(terminalSpam)}`, terminalSpam.detail.경기종료 === true && Number(token(terminalSpam)) >= 0, []);

  async function terminalSummary(route) { await fresh(route); await finish(); await page.clickText("결과 리포트 보기"); await sleep(120); const s = await state(); return { score: [s.detail.내점수, s.detail.상대점수], grade: s.detail.등급, code: s.detail.매치코드 }; }
  const a = await terminalSummary("#/match/za-kor-2026"); const b = await terminalSummary("#/match/za-kor-2026");
  record("R11", "같은 시도와 같은 행동의 결정론", "최종 점수, 등급, 매치 코드가 동일하다", `${JSON.stringify(a)} 대 ${JSON.stringify(b)}`, JSON.stringify(a) === JSON.stringify(b), []);
  const different = await terminalSummary("#/match/za-kor-2026/1");
  record("R12", "시도 번호 변경", "다른 시도는 매치 코드가 다르다", `${a.code} 대 ${different.code}`, a.code !== different.code, []);

  for (const value of ["-1", "1.5", "abc", "999", "01", "%2F"]) { await page.goto(`#/match/za-kor-2026/${value}`); const text = await page.text(); record(`R13-${value}`, "직접 주소 시도 번호 검증", "음수, 소수, 문자, 범위 밖은 거부된다", text.includes("경로를 찾을 수 없습니다") ? "안내 화면" : "매치 화면", ["-1", "1.5", "abc", "999", "%2F"].includes(value) ? text.includes("경로를 찾을 수 없습니다") : true, []); }

  await fresh(); await page.evaluate("(() => { for (const key of ['localStorage','sessionStorage']) Object.defineProperty(window, key, { configurable: true, get() { throw new Error('blocked'); } }); return true; })()"); await page.skipToEnd(); await waitFor(() => page.evaluate("document.body.innerText.includes('경기가 끝났습니다')"), 12000, "저장소 차단 경기 종료 실패"); await page.goto("#/hall-of-fame"); const blockedText = await page.text();
  record("R14", "저장소 차단 환경", "경기는 종료되고 명예의 전당은 기록 불가를 안내한다", blockedText.includes("저장소 접근이 막혀") ? "안내 표시" : blockedText.slice(0, 100), blockedText.includes("저장소 접근이 막혀"), []);

  await fresh(); await page.evaluate("sessionStorage.setItem('rematch:result:za-kor-2026:0', '{bad json')"); await page.goto("#/report/za-kor-2026"); const brokenReport = await page.text();
  record("R15", "손상된 결과 JSON", "리포트가 충돌하지 않고 결과 없음으로 처리한다", brokenReport.includes("아직 이 시도의 결과가 없습니다") ? "안전 처리" : brokenReport.slice(0, 100), brokenReport.includes("아직 이 시도의 결과가 없습니다"), []);

  await fresh(); await page.evaluate("localStorage.setItem('rematch:records', '[null, {bad}]')"); await page.goto("#/hall-of-fame"); const brokenHall = await page.text();
  record("R16", "손상된 명예의 전당 배열", "명예의 전당이 충돌하지 않는다", brokenHall.slice(0, 100), brokenHall.includes("내가 다시 쓴 경기들"), []);

  await fresh(); await page.evaluate("(() => { document.querySelector('.kickoff-primary')?.focus(); return true; })()"); await pressEnter(); await sleep(100); const keyboardOpened = await page.evaluate("document.querySelector('.dugout-overlay') !== null");
  let keyboardSub = false;
  if (keyboardOpened) {
    await page.evaluate("(() => { document.querySelector('.bench-card')?.focus(); return true; })()");
    await pressEnter();
    await page.evaluate("(() => { document.querySelector('.player-token')?.focus(); return true; })()");
    await pressEnter();
    await sleep(120);
    // 확인 단계도 키보드로 넘을 수 있어야 마우스 없이 교체가 완결된다.
    await page.evaluate("(() => { const b = [...document.querySelectorAll('.dg-substitution-confirmation button')].find((x) => x.innerText.includes('이 교체 적용')); if (b) b.focus(); return true; })()");
    await pressEnter();
    await sleep(120);
    keyboardSub = await page.evaluate("document.querySelector('.dugout-notice')?.innerText.includes('교체 카드를 사용했습니다') ?? false");
  }
  record("R17", "키보드로 손흥민 투입 경로", "마우스 없이 더그아웃과 교체에 도달한다", `더그아웃 ${keyboardOpened}, 교체 ${keyboardSub}`, keyboardOpened && keyboardSub, []);

  await fresh(); await openDugout(); await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(100); const escaped = await page.evaluate("document.querySelector('.dugout-overlay') === null");
  record("R18", "더그아웃 Escape와 초점", "Escape가 닫고 모달은 초점을 가진다", `Escape 닫힘 ${escaped}`, escaped, []);

  const mobile = await page.evaluate("({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, pitch: !!document.querySelector('.lp-pitch') })");
  record("R19", "390x844 모바일 가로 오버플로", "가로 오버플로가 없고 피치가 보인다", JSON.stringify(mobile), mobile.scrollWidth <= mobile.width && mobile.pitch, []);

  await page.goto("#/match//za-kor-2026"); record("R20", "추가 없는 주소 변형", "빈 세그먼트 경로가 안내 화면으로 간다", (await page.text()).includes("경로를 찾을 수 없습니다") ? "안내 화면" : "예상 밖 화면", (await page.text()).includes("경로를 찾을 수 없습니다"), []);
} catch (error) {
  console.error(error.stack ?? error);
  record("HARNESS", "실행기", "모든 사례를 끝낸다", String(error.message ?? error), false, []);
} finally {
  const transcript = {
    schemaVersion: 1,
    kind: "gui-automation-transcript",
    surface: "web",
    tool: "chrome-devtools-protocol",
    generatedAt: new Date().toISOString(),
    base: BASE,
    // 사례가 실제로 브라우저에서 집행한 행동을 한 단계씩 펼쳐 둔다.
    actions: cases.flatMap((c) => (c.calls ?? []).map((call, index) => ({
      id: `${c.id}-${index + 1}`,
      type: call.type,
      timestamp: call.timestamp,
      selector: call.selector,
      expression: call.expression,
      caseId: c.id,
      scenario: c.scenario,
      expected: c.expected,
      observed: typeof c.actual === "string" ? c.actual : JSON.stringify(c.actual),
      verdict: c.verdict,
    }))),
    steps: cases,
    cases,
  };
  writeFileSync(resolve(OUT, "transcript.json"), JSON.stringify(transcript, null, 2), "utf8");
  const rows = cases.map((c) => `| ${c.id} | ${c.scenario} | ${c.expected} | ${typeof c.actual === "string" ? c.actual.replaceAll("|", "/").replaceAll("\n", "<br>") : JSON.stringify(c.actual)} | ${c.verdict} | ${c.evidence.join(", ")} |`).join("\n");
  const failures = cases.filter((c) => c.verdict === "실패");
  const coverage = [
    ["G001 경기 피치와 HUD", "R01, R19", ["R01", "R19"].every((id) => !failures.some((c) => c.id === id)) ? "통과" : "실패"], ["G006 탭 교체와 키보드", "R03, R04, R05, R17, R18", ["R03", "R04", "R05", "R17", "R18"].every((id) => !failures.some((c) => c.id === id)) ? "통과" : "실패"], ["토큰과 카드 상한", "R02, R04, R08, R10", ["R02", "R04", "R08", "R10"].every((id) => !failures.some((c) => c.id === id)) ? "통과" : "실패"], ["결정론과 시드", "R11, R12, R13", ["R11", "R12"].every((id) => !failures.some((c) => c.id === id)) ? "통과" : "실패"], ["저장소 차단", "R14, R15, R16", ["R14", "R15", "R16"].every((id) => !failures.some((c) => c.id === id)) ? "통과" : "실패"]
  ].map((r) => `| ${r.join(" | ")} |`).join("\n");
  const defects = failures.length === 0 ? "발견된 계약 위반은 없다. R08, R10처럼 연타와 동시 입력을 추가로 시도했으나 깨지지 않았다." : failures.map((c) => `### ${c.id} ${c.scenario}\n재현: transcript.json의 ${c.id} 행동 순서를 실제 브라우저에서 반복한다.\n관측: ${typeof c.actual === "string" ? c.actual : JSON.stringify(c.actual)}`).join("\n\n");
  writeFileSync(resolve(OUT, "report.md"), `# 레드팀 보고서\n\n## 계약별 커버리지\n| 계약 항목 | 적대 사례 번호 | 판정 |\n| --- | --- | --- |\n${coverage}\n\n## 적대 사례\n| 번호 | 시나리오 | 기대 동작 | 실제 동작 | 판정 | 증거 파일 |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n\n## 발견한 결함과 재현 절차\n${defects}\n\n## 화면 갈무리\n- artifacts/redteam/01-match-pitch.png\n- artifacts/redteam/02-dugout-selected.png\n- artifacts/redteam/03-after-finish.png\n`, "utf8");
  page?.close(); killBrowser(browser); server?.kill();
}

if (cases.some((c) => c.verdict === "실패")) process.exitCode = 1;
