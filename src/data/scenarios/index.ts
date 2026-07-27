import type { ScenarioDeclaration } from "../../domain/types";

// 근거 없는 실제 명단을 주장하지 않으면서 상대 전력을 결정적으로 유지한다.

const SOUTH_AFRICA_KOREA: ScenarioDeclaration = {
  id: "za-kor-2026",
  displayTitle: "남아공 1대0 대한민국",
  historyNote: "2026년 6월 24일 63분 타펠로 마세코가 오른쪽에서 받은 뒤 왼발 낮은 슛으로 결승골을 넣어 남아공이 1대0으로 이겼습니다. 한국은 조 3위로 탈락했고 남아공은 사상 처음으로 월드컵 녹아웃에 진출했습니다.",
  format: {
    regulationMinutes: 90,
    regulationStoppage: 0,
    extraTimeRule: "none",
    extraTimeMinutes: 0,
    shootoutOnTie: false,
    shootoutRegularRounds: 5,
  },
  userTeam: { id: "kor", displayName: "대한민국", crestKey: "kr-minimal" },
  opponentTeam: { id: "za", displayName: "남아공", crestKey: "za-minimal" },
  opponentFormation: "4-2-3-1",
  interventionStartMinute: 63,
  startingUserGoals: 0,
  startingOpponentGoals: 1,
  mission: {
    brief: "손흥민이 벤치에서 지켜보는 63분, 동점을 만들어 진출을 지켜내세요.",
    gradeCutlines: [
      { grade: "S", requirement: { kind: "derivedAchieved" } },
      { grade: "A", requirement: { kind: "userResult", result: "win" } },
      { grade: "B", requirement: { kind: "userResult", result: "draw" } },
    ],
  },
  derivedOutcomeRule: {
    label: "녹아웃 진출",
    onWin: { achieved: true, statement: "녹아웃 진출을 확정했습니다." },
    onDraw: { achieved: true, statement: "녹아웃 진출을 지켜냈습니다." },
    onLoss: { achieved: false, statement: "녹아웃 진출에 실패했습니다." },
    sourceNote: "비기기만 해도 진출이었던 조별 최종전",
  },
  actualTerminal: {
    userGoals: 0,
    opponentGoals: 1,
    shootout: null,
    decidedPhase: "regulation",
    userResult: "loss",
    derivedOutcome: { achieved: false, statement: "녹아웃 진출에 실패했습니다." },
  },
  publishedSeedDeck: ["za-kor-2026-01", "za-kor-2026-02", "za-kor-2026-03", "za-kor-2026-04", "za-kor-2026-05", "za-kor-2026-06", "za-kor-2026-07", "za-kor-2026-08"],
};

const KOREA_CZECHIA: ScenarioDeclaration = {
  id: "kor-cze-2026",
  displayTitle: "대한민국 2대1 체코",
  historyNote: "2026년 6월 11일 59분 라디슬라프 크레이치가 선제골을 넣었지만 67분 황인범이 동점골을 넣었고 80분 오현규가 역전골을 넣었습니다. 82분 김승규는 아담 흘로제크의 슛을 막아 2대1 승리를 지켰습니다.",
  format: {
    regulationMinutes: 90,
    regulationStoppage: 0,
    extraTimeRule: "none",
    extraTimeMinutes: 0,
    shootoutOnTie: false,
    shootoutRegularRounds: 5,
  },
  userTeam: { id: "kor", displayName: "대한민국", crestKey: "kr-minimal" },
  opponentTeam: { id: "cze", displayName: "체코", crestKey: "cz-minimal" },
  opponentFormation: "4-3-3",
  interventionStartMinute: 67,
  startingUserGoals: 1,
  startingOpponentGoals: 1,
  mission: {
    brief: "성공한 승부수를 더 크게 만들어 세 골 차 승리를 완성하세요.",
    gradeCutlines: [
      { grade: "S", requirement: { kind: "goalDifferenceAtLeast", value: 3 } },
      { grade: "A", requirement: { kind: "goalDifferenceAtLeast", value: 2 } },
      { grade: "B", requirement: { kind: "userResult", result: "win" } },
    ],
  },
  derivedOutcomeRule: null,
  actualTerminal: { userGoals: 2, opponentGoals: 1, shootout: null, decidedPhase: "regulation", userResult: "win", derivedOutcome: null },
  publishedSeedDeck: ["kor-cze-2026-01", "kor-cze-2026-02", "kor-cze-2026-03", "kor-cze-2026-04", "kor-cze-2026-05", "kor-cze-2026-06", "kor-cze-2026-07", "kor-cze-2026-08"],
};

const SPAIN_ARGENTINA_FINAL: ScenarioDeclaration = {
  id: "esp-arg-2026-final",
  displayTitle: "스페인 1대0 아르헨티나",
  historyNote: "2026년 7월 19일 메트라이프 스타디움 결승에서 아르헨티나는 정규시간 슈팅 없이 0대0을 맞았고 엔소 페르난데스가 추가시간에 퇴장당했습니다. 연장 후반 시작 무렵 페란 토레스가 니코 윌리엄스의 헤더 백패스를 받아 결승골을 넣었고 에밀리아노 마르티네스는 11세이브를 기록했습니다.",
  format: {
    regulationMinutes: 90,
    regulationStoppage: 0,
    extraTimeRule: "fullExtraTime",
    extraTimeMinutes: 30,
    shootoutOnTie: true,
    shootoutRegularRounds: 5,
  },
  userTeam: { id: "arg", displayName: "아르헨티나", crestKey: "ar-minimal" },
  opponentTeam: { id: "esp", displayName: "스페인", crestKey: "es-minimal" },
  opponentFormation: "4-3-3",
  interventionStartMinute: 90,
  startingUserGoals: 0,
  startingOpponentGoals: 0,
  mission: {
    brief: "10명으로 맞는 연장에서 아르헨티나의 결승을 다시 설계하세요.",
    gradeCutlines: [
      { grade: "S", requirement: { kind: "userResult", result: "win" } },
      { grade: "A", requirement: { kind: "decidedBy", phase: "extraTime" } },
      { grade: "B", requirement: { kind: "userResult", result: "loss" } },
    ],
  },
  derivedOutcomeRule: null,
  actualTerminal: { userGoals: 0, opponentGoals: 1, shootout: null, decidedPhase: "extraTime", userResult: "loss", derivedOutcome: null },
  publishedSeedDeck: ["esp-arg-2026-final-01", "esp-arg-2026-final-02", "esp-arg-2026-final-03", "esp-arg-2026-final-04", "esp-arg-2026-final-05", "esp-arg-2026-final-06", "esp-arg-2026-final-07", "esp-arg-2026-final-08"],
};

const GERMANY_PARAGUAY: ScenarioDeclaration = {
  id: "ger-par-2026-r32",
  displayTitle: "독일 1대1 파라과이",
  historyNote: "파라과이는 훌리오 엔시소의 헤더로 앞섰고 카이 하베르츠가 52분 동점골을 넣었습니다. 연장전 조너선 타의 헤더는 취소됐고 올랜도 힐은 하베르츠와 닉 볼테마데의 킥을 막았습니다. 호세 카날레가 서든데스 첫 킥을 결정해 파라과이가 승부차기 4대3으로 이겼습니다.",
  format: {
    regulationMinutes: 90,
    regulationStoppage: 0,
    extraTimeRule: "fullExtraTime",
    extraTimeMinutes: 30,
    shootoutOnTie: true,
    shootoutRegularRounds: 5,
  },
  userTeam: { id: "ger", displayName: "독일", crestKey: "de-minimal" },
  opponentTeam: { id: "par", displayName: "파라과이", crestKey: "py-minimal" },
  opponentFormation: "4-3-3",
  interventionStartMinute: 52,
  startingUserGoals: 1,
  startingOpponentGoals: 1,
  mission: {
    brief: "독일의 첫 월드컵 승부차기 패배를 막아 녹아웃 진출을 지키세요.",
    gradeCutlines: [
      { grade: "S", requirement: { kind: "userResult", result: "win" } },
      { grade: "A", requirement: { kind: "decidedBy", phase: "shootout" } },
      { grade: "B", requirement: { kind: "userResult", result: "loss" } },
    ],
  },
  derivedOutcomeRule: null,
  actualTerminal: {
    userGoals: 1,
    opponentGoals: 1,
    shootout: { userScore: 3, opponentScore: 4, completedRounds: 6, inSuddenDeath: true, attempts: [] },
    decidedPhase: "shootout",
    userResult: "loss",
    derivedOutcome: null,
  },
  publishedSeedDeck: ["ger-par-2026-r32-01", "ger-par-2026-r32-02", "ger-par-2026-r32-03", "ger-par-2026-r32-04", "ger-par-2026-r32-05", "ger-par-2026-r32-06", "ger-par-2026-r32-07", "ger-par-2026-r32-08"],
};

const KOREA_ITALY_2002: ScenarioDeclaration = {
  id: "kor-ita-2002",
  displayTitle: "대한민국 2대1 이탈리아",
  historyNote: "2002년 6월 18일 대전 16강전은 정규시간 1대1 뒤 연장으로 이어졌고 대한민국이 골든골로 2대1 승리를 거뒀습니다.",
  format: {
    regulationMinutes: 90,
    regulationStoppage: 0,
    extraTimeRule: "suddenDeath",
    extraTimeMinutes: 30,
    shootoutOnTie: true,
    shootoutRegularRounds: 5,
  },
  userTeam: { id: "kor", displayName: "대한민국", crestKey: "kr-minimal" },
  opponentTeam: { id: "ita", displayName: "이탈리아", crestKey: "it-minimal" },
  opponentFormation: "5-4-1",
  interventionStartMinute: 90,
  startingUserGoals: 1,
  startingOpponentGoals: 1,
  mission: {
    brief: "헌정의 승리를 정규시간 안에 끝내세요.",
    gradeCutlines: [
      { grade: "S", requirement: { kind: "goalDifferenceAtLeast", value: 2 } },
      { grade: "A", requirement: { kind: "decidedBy", phase: "regulation" } },
      { grade: "B", requirement: { kind: "userResult", result: "win" } },
    ],
  },
  derivedOutcomeRule: null,
  actualTerminal: { userGoals: 2, opponentGoals: 1, shootout: null, decidedPhase: "goldenGoal", userResult: "win", derivedOutcome: null },
  publishedSeedDeck: ["kor-ita-2002-01", "kor-ita-2002-02", "kor-ita-2002-03", "kor-ita-2002-04", "kor-ita-2002-05", "kor-ita-2002-06", "kor-ita-2002-07", "kor-ita-2002-08"],
};

export const SCENARIOS: readonly ScenarioDeclaration[] = [
  SOUTH_AFRICA_KOREA,
  KOREA_CZECHIA,
  SPAIN_ARGENTINA_FINAL,
  GERMANY_PARAGUAY,
  KOREA_ITALY_2002,
];

export function getScenario(id: string): ScenarioDeclaration | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
