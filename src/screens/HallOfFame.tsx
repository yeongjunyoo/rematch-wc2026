import { useState } from "react";

import { clearRecords, loadRecords, recordsAvailable } from "../domain/records";
import { canReplay, parseMatchCode } from "../domain/rng";
import { DATA_VERSION, ENGINE_VERSION } from "../domain/version";
import type { MatchRecord } from "../domain/records";
import { matchHash, reportHash } from "../router";
import { useAgentSnapshot } from "../agent/bridge";

const GRADE_NOTE: Record<string, string> = {
  S: "미션을 완전히 달성했습니다.",
  A: "역사를 바꿨습니다.",
  B: "결과를 끌어올렸습니다.",
  F: "이번에는 역사를 넘지 못했습니다.",
};

function formatDate(savedAt: number): string {
  const date = new Date(savedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 저장된 매치 코드가 지금 엔진에서 재생 가능한가.
 *
 * 코드에 버전을 넣어 둔 이유가 이것이다. 확인하지 않고 링크를 열면 옛 기록이
 * 현재 엔진으로 조용히 다른 경기가 되어 재현 약속이 거짓이 된다.
 */
function replayable(record: MatchRecord): boolean {
  const code = parseMatchCode(record.matchCode);
  if (code === null) return false;
  return canReplay(code, { engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION }).ok;
}

function RecordRow({ record }: { readonly record: MatchRecord }) {
  return (
    <li className="record-row">
      <span className={`record-grade grade-${record.grade}`}>{record.grade}</span>
      <div className="record-body">
        <strong>{record.scenarioTitle}</strong>
        <span>{record.userGoals} 대 {record.opponentGoals}, {GRADE_NOTE[record.grade] ?? ""}</span>
        <code className="match-code">{record.matchCode}</code>
      </div>
      <div className="record-links">
        <span className="record-date">{formatDate(record.savedAt)}</span>
        <a href={reportHash(record.scenarioId, record.attemptIndex)}>리포트</a>
        {replayable(record) ? (
          <a href={matchHash(record.scenarioId, record.attemptIndex)}>다시 보기</a>
        ) : (
          <span className="record-stale">이 버전의 매치 엔진을 사용할 수 없어 재생할 수 없습니다</span>
        )}
      </div>
    </li>
  );
}

export function HallOfFame() {
  const [records, setRecords] = useState(() => loadRecords());
  const available = recordsAvailable();

  useAgentSnapshot({
    screen: "hallOfFame",
    headline: "명예의 전당, 내가 다시 쓴 경기들",
    affordances: records.length === 0 ? ["경기 고르러 가기", "홈으로 돌아가기"] : ["기록 전체 지우기", "홈으로 돌아가기", "도움말과 데이터 안내"],
    detail: { 기록수: records.length, 저장소사용가능: available },
    feed: records.map((record) => `${record.scenarioTitle} ${record.userGoals}대${record.opponentGoals} ${record.grade}등급`),
  });

  return (
    <main className="page narrow-page">
      <header className="screen-header">
        <p className="eyebrow">명예의 전당</p>
        <h1>내가 다시 쓴 경기들</h1>
      </header>

      {!available ? (
        <p className="shell-notice">이 브라우저는 저장소 접근이 막혀 있어 기록을 남길 수 없습니다. 경기와 리포트는 정상 동작합니다.</p>
      ) : null}

      {records.length === 0 ? (
        <section className="report-section">
          <h2>아직 기록이 없습니다</h2>
          <p>경기를 끝까지 진행하면 결과가 이 브라우저에만 저장됩니다. 계정도 서버도 쓰지 않습니다.</p>
          <nav className="screen-nav"><a className="button-link" href="#/">경기 고르러 가기</a></nav>
        </section>
      ) : (
        <section className="report-section">
          <h2>기록 {records.length}건</h2>
          <ol className="record-list">{records.map((record) => <RecordRow key={record.matchCode} record={record} />)}</ol>
          <button type="button" className="text-button" onClick={() => { clearRecords(); setRecords([]); }}>기록 전체 지우기</button>
        </section>
      )}

      <nav className="screen-nav" aria-label="화면 이동">
        <a href="#/">홈으로 돌아가기</a>
        <a href="#/help">도움말과 데이터 안내</a>
      </nav>
    </main>
  );
}
