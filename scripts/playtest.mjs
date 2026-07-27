/**
 * 페르소나 기반 자동 플레이테스트.
 *
 * 독립된 codex 세션을 페르소나마다 스폰해 실제 브라우저로 게임을 플레이시키고,
 * 끝나면 구조화된 피드백을 받는다. 그 피드백이 다음 개선의 입력이 된다.
 *
 *   node scripts/playtest.mjs                     전 페르소나
 *   node scripts/playtest.mjs --persona casual    한 명만
 *   node scripts/playtest.mjs --rounds 2          페르소나당 플레이 라운드 수
 *   REMATCH_BASE=https://... node scripts/playtest.mjs   배포본 대상
 *
 * 설계 근거
 *  - LLM은 게임 화면을 보지 못한다. 그래서 제품이 노출하는 읽기 전용 스냅샷을 준다.
 *  - 행동은 사람과 같은 경로(화면 버튼)로만 한다. 에이전트 전용 조작 경로를 열면
 *    테스트가 사람의 경험을 측정하지 못한다.
 *  - 매 행동마다 모델을 부르면 비용이 폭발한다. 한 번에 여러 수를 받아 실행하고
 *    다시 관측하는 방식으로 호출 수를 한 자리로 유지한다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

import { Page, baseUrlFor, killBrowser, launchBrowser, sleep, startPreview, waitFor } from "./lib/cdp.mjs";

const REMOTE = process.env.REMATCH_BASE;
const PREVIEW_PORT = 4181;
const CDP_PORT = 9335;
const BASE = baseUrlFor(PREVIEW_PORT, REMOTE);
const MAX_TURNS = 8;
const MODEL = process.env.REMATCH_PLAYTEST_MODEL;

const args = process.argv.slice(2);
const onlyPersona = argValue("--persona");
const rounds = Number(argValue("--rounds") ?? "1");

function argValue(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_DIR = resolve("artifacts/playtest", stamp);

const { personas } = JSON.parse(readFileSync(resolve("personas/personas.json"), "utf8"));
const selected = onlyPersona === undefined ? personas : personas.filter((p) => p.id === onlyPersona);
if (selected.length === 0) throw new Error(`그런 페르소나가 없습니다: ${onlyPersona}`);

// 구조화 출력은 strict 모드라 properties의 모든 키가 required에 있어야 한다.
// 선택 값은 required에서 빼는 대신 null을 허용해서 표현한다.
const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reaction: { type: "string", description: "지금 화면을 보고 든 생각. 페르소나의 말투로 한두 문장." },
    actions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["click", "wait", "formation", "directive", "confirm", "close", "quit"] },
          label: { type: ["string", "null"], description: "click이면 누를 버튼 문구, formation이면 4-3-3 같은 프리셋, directive면 축 이름. 없으면 null." },
          value: { type: ["number", "null"], description: "wait이면 밀리초, directive면 -2에서 2 사이 정수. 없으면 null." },
        },
        required: ["kind", "label", "value"],
      },
    },
  },
  required: ["reaction", "actions"],
};

const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["다시 한다", "한 번은 재밌었다", "그냥 그렇다", "금방 나갔다"] },
    firstImpressionSeconds: { type: ["number", "null"], description: "무엇을 하는 게임인지 이해하는 데 걸린 체감 시간(초). 끝내 몰랐으면 null." },
    understoodWhatToDo: { type: "boolean" },
    feltMyDecisionMattered: { type: "boolean" },
    wouldVoteForThis: { type: "boolean" },
    bestMoment: { type: ["string", "null"] },
    worstMoment: { type: ["string", "null"] },
    confusions: { type: "array", items: { type: "string" }, description: "이해가 막힌 지점들" },
    improvements: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["치명", "높음", "중간", "낮음"] },
          area: { type: "string", enum: ["첫인상", "조작", "경기연출", "결과전달", "정보구조", "모바일", "기타"] },
          problem: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["severity", "area", "problem", "suggestion"],
      },
    },
  },
  required: ["verdict", "firstImpressionSeconds", "understoodWhatToDo", "feltMyDecisionMattered", "wouldVoteForThis", "bestMoment", "worstMoment", "confusions", "improvements"],
};

function callCodex(prompt, schema, label) {
  const schemaPath = join(OUT_DIR, `${label}.schema.json`);
  const outPath = join(OUT_DIR, `${label}.out.json`);
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2), "utf8");
  const flags = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-s", "read-only",
    "--output-schema", schemaPath,
    "-o", outPath,
    "--color", "never",
    // 사용자를 흉내내는 일에 최고 추론 강도는 낭비다. 쿼터를 아껴 라운드를 더 돌린다.
    "-c", 'model_reasoning_effort="medium"',
  ];
  if (MODEL !== undefined) flags.push("-m", MODEL);
  // 프롬프트는 argv가 아니라 stdin으로 넘긴다. 수 킬로바이트짜리 한국어 프롬프트를
  // 명령행 인자로 실으면 Windows 인자 길이 제한과 인코딩 문제를 동시에 만난다.
  execFileSync(process.execPath, [codexEntry(), ...flags, "-"], {
    input: prompt,
    stdio: ["pipe", "ignore", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300000,
  });
  if (!existsSync(outPath)) throw new Error(`codex가 ${label} 응답을 남기지 않았습니다.`);
  return JSON.parse(readFileSync(outPath, "utf8"));
}

let cachedCodex;

/**
 * codex의 실제 진입점.
 *
 * Windows 전역 설치는 `.cmd` 래퍼인데 Node 24는 보안 정책상 `.cmd`를 shell 없이
 * 스폰하지 못한다(EINVAL). shell을 켜면 이번엔 줄바꿈과 따옴표가 잔뜩 든 프롬프트가
 * 깨진다. 그래서 래퍼를 건너뛰고 래퍼가 실행하는 js 진입점을 node로 직접 부른다.
 */
function codexEntry() {
  if (cachedCodex !== undefined) return cachedCodex;
  const explicit = process.env.REMATCH_CODEX_ENTRY;
  if (explicit !== undefined && existsSync(explicit)) { cachedCodex = explicit; return cachedCodex; }
  const candidate = join(process.env.APPDATA ?? "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  if (!existsSync(candidate)) throw new Error(`codex 진입점을 찾지 못했습니다: ${candidate}. REMATCH_CODEX_ENTRY로 지정하세요.`);
  cachedCodex = candidate;
  return cachedCodex;
}

function personaBlock(persona) {
  return [
    `너는 이 웹 게임을 처음 열어본 사람이다. 아래 인물이 되어 행동하고 반응하라.`,
    ``,
    `이름: ${persona.name}`,
    `동기 유형: ${persona.brainhex}`,
    `목적: ${persona.goal}`,
    `행동 양식: ${persona.behavior}`,
    `인내심: ${persona.tolerance}`,
    `중요하게 보는 것: ${persona.cares.join(", ")}`,
    `신경 쓰지 않는 것: ${persona.ignores.join(", ")}`,
    ``,
    `너는 개발자가 아니라 사용자다. 코드나 기술을 논평하지 말고, 화면을 보고 느낀 것만 말하라.`,
    `이 인물이라면 안 읽었을 텍스트는 읽지 않은 것처럼 행동하라.`,
  ].join("\n");
}

async function applyAction(page, action) {
  switch (action.kind) {
    case "click":
      return { ok: await page.clickText(action.label ?? ""), note: `click ${action.label}` };
    case "wait":
      await sleep(Math.min(6000, Math.max(200, action.value ?? 1200)));
      return { ok: true, note: `wait ${action.value ?? 1200}ms` };
    case "formation":
      return {
        ok: await page.evaluate(`(() => {
          const shape = [...document.querySelectorAll(".dugout-tabs button")].find((b) => b.innerText.includes("포메이션"));
          if (shape) shape.click();
          const target = [...document.querySelectorAll(".dugout-controls button")].find((b) => b.innerText.trim() === ${JSON.stringify(action.label ?? "")});
          if (!target) return false;
          target.click();
          return true;
        })()`),
        note: `formation ${action.label}`,
      };
    case "directive":
      return {
        ok: await page.evaluate(`(() => {
          const tab = [...document.querySelectorAll(".dugout-tabs button")].find((b) => b.innerText.includes("지시"));
          if (tab) tab.click();
          const labels = [...document.querySelectorAll(".directive-controls label")];
          const found = labels.find((l) => l.innerText.includes(${JSON.stringify(action.label ?? "")})) ?? labels[0];
          if (!found) return false;
          const slider = found.querySelector("input[type=range]");
          if (!slider) return false;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(slider, String(${Math.round(action.value ?? 2)}));
          slider.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        })()`),
        note: `directive ${action.label}=${action.value}`,
      };
    case "confirm":
      return { ok: await page.clickText("개입 확정"), note: "confirm" };
    case "close":
      return { ok: await page.clickText("닫기"), note: "close" };
    case "quit":
      return { ok: true, note: "quit", quit: true };
    default:
      return { ok: false, note: `알 수 없는 행동 ${action.kind}` };
  }
}

async function playOnce(page, persona, round) {
  await page.evaluate('(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} return true; })()');
  await page.goto("#/");
  await sleep(400);

  const transcript = [];
  let quit = false;

  for (let turn = 0; turn < MAX_TURNS && !quit; turn += 1) {
    const snapshot = await page.snapshot();
    if (snapshot === null) throw new Error("제품이 스냅샷을 노출하지 않습니다.");
    const visible = await page.text();

    const prompt = [
      personaBlock(persona),
      ``,
      `지금까지 네가 한 것:`,
      transcript.length === 0 ? "(아직 없음. 방금 사이트를 열었다.)" : transcript.map((entry, index) => `${index + 1}. ${entry}`).join("\n"),
      ``,
      `지금 화면(기계가 읽은 구조):`,
      JSON.stringify(snapshot, null, 2),
      ``,
      `지금 화면에 실제로 보이는 글자:`,
      visible.slice(0, 2600),
      ``,
      `이 인물로서 다음에 할 행동을 최대 4개까지 정하라.`,
      `- click: affordances에 있는 문구를 그대로 label에 넣는다.`,
      `- wait: 경기를 지켜보고 싶을 때. value는 밀리초.`,
      `- formation / directive / confirm / close: 더그아웃이 열려 있을 때만 의미가 있다.`,
      `- quit: 이 인물이라면 지금 나갈 것 같으면 이걸 넣어라. 참고 봐주지 마라.`,
      `reaction에는 지금 화면을 보고 든 생각을 이 인물의 말투로 한두 문장 적어라.`,
    ].join("\n");

    const decision = callCodex(prompt, ACTION_SCHEMA, `${persona.id}-r${round}-t${turn}-action`);
    transcript.push(`[반응] ${decision.reaction}`);

    for (const action of decision.actions ?? []) {
      const applied = await applyAction(page, action);
      transcript.push(`[행동] ${applied.note} → ${applied.ok ? "됨" : "안 됨"}`);
      if (applied.quit === true) { quit = true; break; }
      await sleep(action.kind === "wait" ? 0 : 550);
    }
  }

  return transcript;
}

const server = startPreview(PREVIEW_PORT, REMOTE);
let browser = null;
let page = null;
mkdirSync(OUT_DIR, { recursive: true });
const results = [];

try {
  await waitFor(async () => (await fetch(BASE)).ok, 20000, "미리보기 서버가 뜨지 않았습니다");
  browser = launchBrowser(CDP_PORT);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 20000, "브라우저 디버깅 포트가 열리지 않았습니다");
  page = await Page.attach(CDP_PORT, BASE);
  await waitFor(() => page.evaluate('document.querySelector("#root") !== null'), 10000, "첫 화면 로드 실패");

  for (const persona of selected) {
    for (let round = 0; round < rounds; round += 1) {
      console.log(`\n=== ${persona.name} (${persona.id}) 라운드 ${round + 1} ===`);
      const transcript = await playOnce(page, persona, round);
      for (const line of transcript) console.log("  " + line);

      const feedbackPrompt = [
        personaBlock(persona),
        ``,
        `너는 방금 이 게임을 해봤다. 아래가 네가 실제로 겪은 것이다.`,
        ``,
        transcript.join("\n"),
        ``,
        `마지막 화면:`,
        JSON.stringify(await page.snapshot(), null, 2),
        ``,
        `이제 이 인물로서 솔직하게 평가하라. 개발자를 배려하지 마라.`,
        `improvements에는 네가 실제로 겪은 문제만 적어라. 겪지 않은 일반론은 적지 마라.`,
        `severity가 "치명"인 것은 이 인물이 그것 때문에 게임을 그만두게 되는 문제만이다.`,
      ].join("\n");

      const feedback = callCodex(feedbackPrompt, FEEDBACK_SCHEMA, `${persona.id}-r${round}-feedback`);
      results.push({ persona: persona.id, personaName: persona.name, round: round + 1, transcript, feedback });
      console.log(`  판정: ${feedback.verdict} / 투표: ${feedback.wouldVoteForThis ? "한다" : "안 한다"} / 개선 ${feedback.improvements.length}건`);
    }
  }
} finally {
  page?.close();
  killBrowser(browser);
  server?.kill();
}

writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify({ base: BASE, at: stamp, results }, null, 2), "utf8");

const lines = [`# 자동 플레이테스트 ${stamp}`, ``, `대상: ${BASE}`, ``];
const all = results.flatMap((entry) => entry.feedback.improvements.map((item) => ({ ...item, persona: entry.personaName })));
const order = { 치명: 0, 높음: 1, 중간: 2, 낮음: 3 };
all.sort((a, b) => order[a.severity] - order[b.severity]);

lines.push(`## 판정 요약`, ``, `| 페르소나 | 판정 | 할 일을 알았나 | 내 결정이 통했나 | 투표하겠나 |`, `|---|---|---|---|---|`);
for (const entry of results) {
  const f = entry.feedback;
  lines.push(`| ${entry.personaName} | ${f.verdict} | ${f.understoodWhatToDo ? "예" : "아니오"} | ${f.feltMyDecisionMattered ? "예" : "아니오"} | ${f.wouldVoteForThis ? "예" : "아니오"} |`);
}
lines.push(``, `## 개선 요구 (심각도순)`, ``, `| 심각도 | 영역 | 문제 | 제안 | 제기한 페르소나 |`, `|---|---|---|---|---|`);
for (const item of all) {
  lines.push(`| ${item.severity} | ${item.area} | ${item.problem} | ${item.suggestion} | ${item.persona} |`);
}
lines.push(``, `## 원문 반응`, ``);
for (const entry of results) {
  lines.push(`### ${entry.personaName}`, ``, `- 최고 순간: ${entry.feedback.bestMoment ?? "없음"}`, `- 최악 순간: ${entry.feedback.worstMoment ?? "없음"}`, `- 막힌 곳: ${(entry.feedback.confusions ?? []).join(" / ") || "없음"}`, ``);
}
writeFileSync(join(OUT_DIR, "report.md"), lines.join("\n"), "utf8");

console.log(`\n결과: ${join(OUT_DIR, "report.md")}`);
console.log(`치명 ${all.filter((i) => i.severity === "치명").length}건 / 높음 ${all.filter((i) => i.severity === "높음").length}건`);
