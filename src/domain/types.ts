/**
 * REMATCH 도메인 계약.
 *
 * 이 파일은 ralplan 합의(Architect CLEAR / Critic OKAY)에서 BLOCKER로 지적된
 * "스키마가 종료 형식을 표현하지 못해 데이터만 추가로 시나리오 5종이 성립하지 않는다"를
 * 해소하는 규범 계약이다. 다섯 종료 경로가 전부 이 타입으로 표현되어야 한다.
 *
 *   1. 남아공전   regulation 종료 + 조별 진출 판정(DerivedOutcomeRule)
 *   2. 체코전     regulation 종료 + 득점차 목표
 *   3. 결승       regulation → extraTime(비골든골) → shootout 가능
 *   4. 독일-파라과이  regulation → extraTime → shootout 실화
 *   5. 2002 이탈리아전 regulation → extraTime(골든골 = suddenDeath)
 */

// ---------------------------------------------------------------------------
// 팀과 관점
// ---------------------------------------------------------------------------

/** 사용자가 지휘하는 쪽과 상대. 모든 관점 상대적 사실은 이 축으로 표현한다. */
export type Side = "user" | "opponent";

export const otherSide = (s: Side): Side => (s === "user" ? "opponent" : "user");

export interface TeamRef {
  /** 데이터 내부 식별자. 표시명과 분리한다. */
  readonly id: string;
  readonly displayName: string;
  /** 자체 제작 미니멀 그래픽 키. 공식 엠블럼을 참조하지 않는다. */
  readonly crestKey: string;
}

// ---------------------------------------------------------------------------
// 경기 형식과 국면
// ---------------------------------------------------------------------------

/** 경기 형식 상태기의 국면. */
export type Phase = "regulation" | "extraTime" | "shootout" | "finished";

/** 연장 규칙. 2002년은 골든골(suddenDeath), 2026년은 fullExtraTime. */
export type ExtraTimeRule = "none" | "fullExtraTime" | "suddenDeath";

/**
 * 시나리오가 선언하는 경기 형식.
 * 이 선언만 바꾸면 다섯 종료 경로가 데이터로 갈린다.
 */
export interface MatchFormat {
  /** 정규시간 총 분. 통상 90. */
  readonly regulationMinutes: number;
  /** 정규시간 추가시간(분). 알려진 값이 없으면 0. */
  readonly regulationStoppage: number;
  readonly extraTimeRule: ExtraTimeRule;
  /** 연장 총 분(fullExtraTime 30, suddenDeath 상한 30). none이면 0. */
  readonly extraTimeMinutes: number;
  /** 연장 후에도 동점이면 승부차기로 가는가. */
  readonly shootoutOnTie: boolean;
  /** 승부차기 정규 라운드 수. 통상 5. */
  readonly shootoutRegularRounds: number;
}

/** 시계. 국면별로 분을 따로 센다. */
export interface MatchClock {
  readonly phase: Phase;
  /** 현재 국면 내 경과 분. shootout에서는 0. */
  readonly minute: number;
  /** 표시용 절대 분(정규 90 + 연장 경과 등). */
  readonly absoluteMinute: number;
  /** 승부차기 라운드(1부터). shootout이 아니면 null. */
  readonly shootoutRound: number | null;
}

// ---------------------------------------------------------------------------
// 이벤트 유니온 (페널티 시도를 1급으로 포함)
// ---------------------------------------------------------------------------

export type GoalKind = "openPlay" | "header" | "penaltyKick" | "freeKick" | "ownGoal";

export interface GoalEvent {
  readonly type: "goal";
  readonly side: Side;
  readonly scorerId: string;
  readonly assistId?: string;
  readonly kind: GoalKind;
  readonly clock: MatchClock;
}

export interface ChanceEvent {
  readonly type: "chance";
  readonly side: Side;
  readonly shooterId: string;
  /** 0..1. 전환 판정 전의 기대값. */
  readonly quality: number;
  readonly converted: boolean;
  readonly clock: MatchClock;
}

export interface CardEvent {
  readonly type: "card";
  readonly side: Side;
  readonly playerId: string;
  readonly card: "yellow" | "secondYellow" | "red";
  readonly clock: MatchClock;
}

export interface SubstitutionEvent {
  readonly type: "substitution";
  readonly side: Side;
  readonly outId: string;
  readonly inId: string;
  readonly clock: MatchClock;
}

/** 국면 전환. regulation 종료, 연장 개시, 승부차기 개시 등. */
export interface PhaseChangeEvent {
  readonly type: "phaseChange";
  readonly from: Phase;
  readonly to: Phase;
  readonly reason: "regulationEnded" | "extraTimeEnded" | "goldenGoal" | "shootoutStarted" | "decided";
  readonly clock: MatchClock;
}

/** 승부차기 개별 시도. 이벤트 유니온의 1급 멤버다. */
export interface PenaltyAttemptEvent {
  readonly type: "penaltyAttempt";
  readonly side: Side;
  readonly takerId: string;
  readonly round: number;
  readonly result: PenaltyResult;
  readonly clock: MatchClock;
}

export type PenaltyResult = "scored" | "saved" | "missed";

/** 사용자 개입이 확정된 순간도 이벤트로 남긴다. 리플레이와 리포트의 근거가 된다. */
export interface InterventionEvent {
  readonly type: "intervention";
  readonly side: "user";
  readonly tokenIndex: number;
  readonly summary: string;
  readonly clock: MatchClock;
}

/** 상대 AI 감독의 반격. 무엇을 상쇄했고 무엇이 취약해졌는지 둘 다 담는다. */
export interface AiCounterEvent {
  readonly type: "aiCounter";
  readonly side: "opponent";
  readonly counteredWhat: string;
  readonly exposedWeakness: string;
  readonly clock: MatchClock;
}

export type MatchEvent =
  | GoalEvent
  | ChanceEvent
  | CardEvent
  | SubstitutionEvent
  | PhaseChangeEvent
  | PenaltyAttemptEvent
  | InterventionEvent
  | AiCounterEvent;

// ---------------------------------------------------------------------------
// 승부차기 상태
// ---------------------------------------------------------------------------

export interface ShootoutState {
  readonly userScore: number;
  readonly opponentScore: number;
  /** 완료된 라운드 수. */
  readonly completedRounds: number;
  /** 정규 라운드를 모두 소진하고 서든데스에 들어갔는가. */
  readonly inSuddenDeath: boolean;
  /** 다음 페널티를 찰 side. */
  readonly nextSide?: Side;
  readonly attempts: readonly PenaltyAttemptEvent[];
}

// ---------------------------------------------------------------------------
// 관점 상대적 종료 사실
// ---------------------------------------------------------------------------

/** 어느 국면에서 결판났는가. 리포트 카피와 등급 판정이 이걸 읽는다. */
export type DecidedPhase = "regulation" | "extraTime" | "goldenGoal" | "shootout";

/**
 * 경기가 끝난 뒤 확정되는 사실. 전부 사용자 관점으로 표현한다.
 * "누가 이겼나"를 절대 팀 이름이 아니라 user/opponent로 표현해야
 * 아르헨티나 벤치(결승)처럼 사용자가 패배한 쪽을 지휘하는 시나리오가 성립한다.
 */
export interface TerminalFacts {
  readonly userGoals: number;
  readonly opponentGoals: number;
  /** 승부차기까지 갔으면 그 결과. 아니면 null. */
  readonly shootout: ShootoutState | null;
  readonly decidedPhase: DecidedPhase;
  /** 사용자 관점 결과. draw는 승부차기가 없는 형식에서만 나온다. */
  readonly userResult: "win" | "draw" | "loss";
  /** 파생 결과(조별 진출 등). 규칙이 없는 시나리오는 null. */
  readonly derivedOutcome: DerivedOutcome | null;
}

// ---------------------------------------------------------------------------
// 선언적 파생 결과 (범용 순위표 엔진을 쓰지 않는다)
// ---------------------------------------------------------------------------

/**
 * Architect A2 지적 반영: 범용 대회 엔진(순위표, 득실차, 타이브레이크, 최고 3위 컷라인)은
 * 과설계다. 이 제품에 필요한 것은 출처가 확인된 결과 규칙뿐이므로
 * 승/무/패 3행 truth table을 규범 구현으로 둔다.
 *
 * 남아공전 실화: 한국은 비기기만 해도 진출이었고 0-1 패배로 탈락했다.
 */
export interface DerivedOutcomeRule {
  /** 이 파생 결과가 무엇인지. 예: "16강 진출". */
  readonly label: string;
  /** 승/무/패 각각의 결과. 3행이 전부다. */
  readonly onWin: DerivedOutcome;
  readonly onDraw: DerivedOutcome;
  readonly onLoss: DerivedOutcome;
  /** 이 규칙의 출처. 사실 근거 없는 규칙을 금지한다. */
  readonly sourceNote: string;
}

export interface DerivedOutcome {
  readonly achieved: boolean;
  /** 사용자에게 보여줄 한 줄. */
  readonly statement: string;
}

// ---------------------------------------------------------------------------
// 시드와 재현 계약
// ---------------------------------------------------------------------------

/**
 * Architect M1 지적 반영: 외생 추출과 행동 지문을 분리한다.
 * worldSeed는 시도 단위로 고정되어 분과 팀과 네임스페이스 추출을 지배하고,
 * decision draw만 사용자 행동에 의존한다. 그래서 슬라이더 1클릭이
 * 미래의 모든 난수 스트림을 갈아버리지 않는다.
 */
export interface WorldSeed {
  readonly scenarioId: string;
  /** 공개된 시드 덱에서의 인덱스. 새 리매치는 이 인덱스만 전진한다. */
  readonly attemptIndex: number;
  readonly publishedSeed: string;
  readonly engineVersion: string;
  readonly dataVersion: string;
}

/**
 * 표시되고 재생되는 매치 코드.
 * Architect A3 지적 반영: engine/data 버전과 충돌 안전 체크섬에 결속한다.
 * 참조 버전이 가용하지 않으면 재생을 거부해야 한다.
 */
export interface MatchCode {
  readonly scenarioId: string;
  readonly attemptIndex: number;
  readonly engineVersion: string;
  readonly dataVersion: string;
  /** worldSeed 전체에서 파생한 128비트 체크섬(32 hex). */
  readonly seedChecksum: string;
}

// ---------------------------------------------------------------------------
// 전술과 개입
// ---------------------------------------------------------------------------

/** 팀 지시 5축. 각 값은 -2..+2 정수. 0이 중립이다. */
export interface TacticalDirectives {
  /** 낮음(-2) ↔ 높음(+2) */
  readonly defensiveLine: number;
  /** 소극(-2) ↔ 전방압박(+2) */
  readonly pressing: number;
  /** 점유(-2) ↔ 다이렉트(+2) */
  readonly tempo: number;
  /** 중앙(-2) ↔ 측면(+2) */
  readonly attackRoute: number;
  /** 수비적(-2) ↔ 공격적(+2) */
  readonly mindset: number;
}

export const NEUTRAL_DIRECTIVES: TacticalDirectives = {
  defensiveLine: 0,
  pressing: 0,
  tempo: 0,
  attackRoute: 0,
  mindset: 0,
};

export type FormationPreset = "4-3-3" | "4-2-3-1" | "3-4-3" | "3-5-2" | "5-4-1";

/** 피치 위 좌표. 0..100 정규화(사용자 진영 왼쪽 기준). */
export interface PitchSlot {
  readonly x: number;
  readonly y: number;
}

export interface Placement {
  readonly playerId: string;
  readonly slot: PitchSlot;
}

/** 사용자가 확정한 개입 1건. */
export interface Intervention {
  readonly tokenIndex: number;
  readonly atMinute: number;
  readonly directives: TacticalDirectives;
  readonly formation: FormationPreset;
  readonly placements: readonly Placement[];
  readonly substitutions: readonly { readonly outId: string; readonly inId: string }[];
}

/**
 * Architect M1 지적 반영: no-op 개입은 거부한다.
 * 아무것도 바꾸지 않은 확인이 토큰을 소모하거나 난수를 리롤하면 안 된다.
 */
export interface InterventionDiff {
  readonly changedDirectives: readonly (keyof TacticalDirectives)[];
  readonly formationChanged: boolean;
  readonly movedPlayerIds: readonly string[];
  readonly substitutionCount: number;
  readonly isNoOp: boolean;
}

// ---------------------------------------------------------------------------
// 상대 AI 상태
// ---------------------------------------------------------------------------

/**
 * Architect M2 지적 반영: AI에 예산과 쿨다운과 정보 제한을 부여한다.
 * 모든 개입이 즉시 상쇄되면 토큰 시스템이 재미를 상실한다.
 */
export interface AiState {
  /** 남은 반격 횟수. */
  readonly responseBudget: number;
  /** 다음 반격이 가능해지는 절대 분. */
  readonly cooldownUntilMinute: number;
  /** AI가 마지막으로 관측한 사용자 지시. 지연 관측이라 최신이 아닐 수 있다. */
  readonly lastObserved: TacticalDirectives | null;
  /** 관측 지연(분). 이 시간이 지나야 사용자 변경을 인지한다. */
  readonly observationLagMinutes: number;
  readonly riskTolerance: number;
}

export type AiResponseKind = "counter" | "holdShape";

export interface AiResponse {
  readonly kind: AiResponseKind;
  readonly directives: TacticalDirectives;
  readonly counteredWhat: string;
  /** 반격이 여는 다른 약점. 항상 비어 있으면 안 된다(균형 테스트가 단언). */
  readonly exposedWeakness: string;
}

// ---------------------------------------------------------------------------
// 경기 상태
// ---------------------------------------------------------------------------

export interface MatchState {
  readonly clock: MatchClock;
  readonly userGoals: number;
  readonly opponentGoals: number;
  readonly shootout: ShootoutState | null;
  readonly events: readonly MatchEvent[];
  readonly tokensRemaining: number;
  readonly userDirectives: TacticalDirectives;
  readonly opponentDirectives: TacticalDirectives;
  readonly ai: AiState;
  /** 국면이 finished면 반드시 채워진다. */
  readonly terminal: TerminalFacts | null;
}

// ---------------------------------------------------------------------------
// 시나리오 선언
// ---------------------------------------------------------------------------

export type Grade = "S" | "A" | "B" | "F";

export interface MissionGoal {
  /** 사용자에게 보여줄 미션 문구. */
  readonly brief: string;
  /** 등급 커트라인 판정. terminal facts만 읽는 순수 함수로 구현한다. */
  readonly gradeCutlines: readonly GradeCutline[];
}

export interface GradeCutline {
  readonly grade: Grade;
  /** 이 등급을 받기 위한 조건 서술(구현은 outcome.ts의 평가기가 담당). */
  readonly requirement: GradeRequirement;
}

export type GradeRequirement =
  | { readonly kind: "derivedAchieved" }
  | { readonly kind: "userResult"; readonly result: "win" | "draw" | "loss" }
  | { readonly kind: "goalDifferenceAtLeast"; readonly value: number }
  | { readonly kind: "decidedBy"; readonly phase: DecidedPhase }
  | { readonly kind: "always" };

export interface ScenarioDeclaration {
  readonly id: string;
  readonly displayTitle: string;
  /** 실제 역사 요약. 리포트에서 대비로 쓴다. */
  readonly historyNote: string;
  readonly format: MatchFormat;
  readonly userTeam: TeamRef;
  readonly opponentTeam: TeamRef;
  /** 사용자가 이어받는 시점(절대 분). */
  readonly interventionStartMinute: number;
  /** 이어받는 시점의 스코어. */
  readonly startingUserGoals: number;
  readonly startingOpponentGoals: number;
  readonly mission: MissionGoal;
  readonly derivedOutcomeRule: DerivedOutcomeRule | null;
  /** 실제 역사의 종료 사실. 비교 리포트의 기준선. */
  readonly actualTerminal: TerminalFacts;
  /** 공개 시드 덱. 새 리매치는 이 배열을 인덱스로 전진한다. */
  readonly publishedSeedDeck: readonly string[];
}
