import type { DecidedPhase, Grade } from "./types";

/**
 * 명예의 전당 기록.
 *
 * 브라우저 저장소만 쓴다. 서버도 계정도 없으므로 심사자가 가입 없이 바로 남긴다.
 * 저장소가 막힌 환경(사생활 보호 모드, 저장 용량 초과)에서도 경기 자체는
 * 계속되어야 하므로 모든 접근을 실패 허용으로 감싼다.
 */
export interface MatchRecord {
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly attemptIndex: number;
  readonly matchCode: string;
  readonly grade: Grade;
  readonly userGoals: number;
  readonly opponentGoals: number;
  readonly decidedPhase: DecidedPhase;
  readonly derivedAchieved: boolean | null;
  readonly savedAt: number;
}

const STORAGE_KEY = "rematch:hall-of-fame:v1";
const MAX_RECORDS = 50;

export function loadRecords(): readonly MatchRecord[] {
  const raw = readRaw();
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

/** 같은 매치 코드는 한 번만 남긴다. 같은 경기를 다시 본다고 기록이 불어나면 안 된다. */
export function saveRecord(record: MatchRecord): readonly MatchRecord[] {
  const existing = loadRecords().filter((candidate) => candidate.matchCode !== record.matchCode);
  const next = [record, ...existing].slice(0, MAX_RECORDS);
  writeRaw(JSON.stringify(next));
  return next;
}

export function clearRecords(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 지우는 환경에서도 화면은 계속 동작한다.
  }
}

/** 기록이 실제로 남는 환경인지. 남지 않으면 화면이 그 사실을 정직하게 알린다. */
export function recordsAvailable(): boolean {
  try {
    const probe = `${STORAGE_KEY}:probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function bestGrade(records: readonly MatchRecord[], scenarioId: string): Grade | null {
  const order: readonly Grade[] = ["S", "A", "B", "F"];
  const mine = records.filter((record) => record.scenarioId === scenarioId);
  if (mine.length === 0) return null;
  return order.find((grade) => mine.some((record) => record.grade === grade)) ?? null;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 저장 실패는 경기 진행을 막지 않는다.
  }
}

function isRecord(value: unknown): value is MatchRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MatchRecord>;
  return typeof candidate.scenarioId === "string"
    && typeof candidate.matchCode === "string"
    && typeof candidate.grade === "string"
    && typeof candidate.attemptIndex === "number"
    && typeof candidate.userGoals === "number"
    && typeof candidate.opponentGoals === "number"
    && typeof candidate.savedAt === "number";
}
