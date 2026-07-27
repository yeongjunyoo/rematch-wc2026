import { useEffect, useMemo, useRef, useState } from "react";
import "../ui/dugout.css";
import type { KeyboardEvent, PointerEvent } from "react";
import { applyPreset, clampDirectives, clampToPitch, fitness, FORMATION_SLOTS, snapToNearestSlot, substitute, swapPlacements } from "../domain/tactics";
import type { FormationPreset, Intervention, Placement, TacticalDirectives } from "../domain/types";
import { diffIntervention } from "../domain/rng";
import { DRAG_HANDLE_STYLE, SCROLL_REGION_STYLE, useDragController } from "../ui/drag";
import { squadFor } from "../ui/squad";

interface DugoutProps {
  scenarioId: string;
  tokenIndex: number;
  /** 개입이 확정될 경기 시각. 헤더가 이 분을 그대로 보여준다. */
  minute: number;
  /**
   * 이 경기에서 이미 쓴 교체 카드 수.
   * 예산의 정본은 확정된 개입들이고 모달은 그 위에 누적만 한다. 모달이 스스로 0부터
   * 세면 다시 열 때마다 예산이 되살아나 경기당 세 장이라는 약속이 깨진다.
   */
  cardsUsedBefore: number;
  initialFormation: FormationPreset;
  initialPlacements: readonly Placement[];
  initialDirectives: TacticalDirectives;
  onConfirm: (intervention: Intervention) => void;
  onClose: () => void;
}

const FORMATIONS: readonly FormationPreset[] = ["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "5-4-1"];
type DugoutTab = "shape" | "directives";
const DIRECTIVES: readonly { readonly key: keyof TacticalDirectives; readonly label: string; readonly low: string; readonly high: string }[] = [
  { key: "defensiveLine", label: "수비 라인", low: "낮게", high: "높게" },
  { key: "pressing", label: "압박 강도", low: "소극", high: "전방 압박" },
  { key: "tempo", label: "템포", low: "점유", high: "다이렉트" },
  { key: "attackRoute", label: "공격 루트", low: "중앙", high: "측면" },
  { key: "mindset", label: "마인드셋", low: "수비", high: "공격" },
];

function PitchLines() {
  return <svg className="dugout-pitch-lines" viewBox="0 0 100 100" aria-hidden="true"><rect x="2" y="2" width="96" height="96" rx="2" /><path d="M50 2v96M2 20h16v60H2M98 20H82v60h16M2 37h7v26H2M98 37h-7v26h7" /><circle cx="50" cy="50" r="11" /></svg>;
}

export function Dugout({ scenarioId, tokenIndex, minute, cardsUsedBefore, initialFormation, initialPlacements, initialDirectives, onConfirm, onClose }: DugoutProps) {
  const squad = useMemo(() => squadFor(scenarioId), [scenarioId]);
  const [formation, setFormation] = useState(initialFormation);
  const [placements, setPlacements] = useState<readonly Placement[]>(initialPlacements);
  const [directives, setDirectives] = useState(initialDirectives);
  const [cardsUsed, setCardsUsed] = useState(cardsUsedBefore);
  const [substitutions, setSubstitutions] = useState<readonly { readonly outId: string; readonly inId: string }[]>([]);
  const [tab, setTab] = useState<DugoutTab>("shape");
  // 벤치에서 고른 선수. 탭 두 번으로 교체하는 경로의 중간 상태다.
  const [selectedBenchId, setSelectedBenchId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  // 드래그가 끝나면 브라우저가 click을 한 번 더 쏜다. 그걸 탭으로 오인하면 교체가 두 번 일어난다.
  const suppressClick = useRef(false);
  const drag = useDragController({ activationDistance: 6, touchActivationDelayMs: 180 });
  const players = useMemo(() => new Map([...squad.starters, ...squad.bench].map((player) => [player.id, player])), [squad]);
  const activePlayerId = drag.state.itemId?.replace("bench:", "") ?? null;
  const activePlayer = activePlayerId === null ? undefined : players.get(activePlayerId);
  const cardsRemaining = Math.max(0, 3 - cardsUsed);
  const benchPlayers = squad.bench.filter((player) => !placements.some((placement) => placement.playerId === player.id));
  const statusGuide = cardsRemaining === 0
    ? "교체 카드를 모두 사용했습니다. 포메이션과 팀 지시는 바꿀 수 있습니다."
    : selectedBenchId === null
      ? "교체하려면 아래 벤치에서 넣을 선수를 먼저 누르세요. 그다음 피치에서 뺄 선수를 누르면 교체됩니다."
      : "벤치 선수를 골랐습니다. 피치에서 뺄 선수를 누르세요.";

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => { previouslyFocusedRef.current?.focus(); };
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (focusable === undefined || focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: DugoutTab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextIndex = currentTab === "shape" ? 1 : 0;
    const nextTab: DugoutTab = nextIndex === 0 ? "shape" : "directives";
    setTab(nextTab);
    tabRefs.current[nextIndex]?.focus();
  };

  useEffect(() => {
    setFormation(initialFormation);
    setPlacements(initialPlacements);
    setDirectives(initialDirectives);
    setCardsUsed(cardsUsedBefore);
    setSubstitutions([]);
    setSelectedBenchId(null);
    setNotice(null);
  }, [cardsUsedBefore, initialDirectives, initialFormation, initialPlacements, scenarioId]);

  const pointFromEvent = (event: PointerEvent<HTMLElement>) => {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (rect === undefined) return null;
    return clampToPitch({ x: ((event.clientY - rect.top) / rect.height) * 100, y: ((event.clientX - rect.left) / rect.width) * 100 }, 3);
  };

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-drag-item]") : null;
    const itemId = target?.dataset.dragItem;
    if (itemId !== undefined) drag.onPointerDown(event, itemId);
  };

  /**
   * 교체 실행. 드래그 경로와 탭 경로가 같은 함수를 부른다.
   * 두 벌로 두면 한쪽만 규칙을 지키게 되고, 실제로 이 제품에서는 드래그 경로만 존재해서
   * 자동 플레이테스트의 축구 팬이 벤치 선수를 세 번 고르고도 넣지 못한 채 이탈했다.
   */
  const runSubstitution = (outId: string, inId: string) => {
    const result = substitute(placements, outId, inId, cardsUsed, 3);
    if (!result.ok) {
      setNotice(`교체할 수 없습니다. ${result.reason}`);
      return;
    }
    setPlacements(result.placements);
    setCardsUsed(result.cardsUsed);
    setSubstitutions((current) => [...current, { outId, inId }]);
    setSelectedBenchId(null);
    const incoming = players.get(inId);
    const outgoing = players.get(outId);
    setNotice(`${incoming?.label ?? "선수"}를 넣고 ${outgoing?.label ?? "선수"}를 뺐습니다. 교체 카드를 사용했습니다.`);
  };

  /**
   * 탭 경로. 벤치 선수를 누르면 고르고, 그 상태에서 피치 선수를 누르면 교체한다.
   * 드래그만으로는 모바일과 키보드 사용자에게 교체 경로가 닫혀 있다.
   */
  const handleTap = (itemId: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (itemId.startsWith("bench:")) {
      const benchId = itemId.slice(6);
      if (selectedBenchId === benchId) {
        setSelectedBenchId(null);
        setNotice(null);
        return;
      }
      setSelectedBenchId(benchId);
      setNotice(null);
      return;
    }
    if (selectedBenchId === null) {
      setNotice("먼저 벤치에서 넣을 선수를 고르세요.");
      return;
    }
    runSubstitution(itemId, selectedBenchId);
  };

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    const itemId = drag.state.itemId;
    const wasDragging = drag.state.phase === "dragging";
    if (wasDragging) suppressClick.current = true;
    if (wasDragging && itemId !== null) {
      const point = pointFromEvent(event);
      if (point !== null) {
        const snapped = snapToNearestSlot(point, FORMATION_SLOTS[formation]);
        const target = placements.find((placement) => placement.slot.x === snapped.slot.x && placement.slot.y === snapped.slot.y);
        if (itemId.startsWith("bench:")) {
          if (target === undefined) {
            setNotice("교체할 선수를 찾을 수 없습니다.");
          } else {
            runSubstitution(target.playerId, itemId.slice(6));
          }
        } else if (target !== undefined && target.playerId !== itemId) {
          setPlacements(swapPlacements(placements, itemId, target.playerId));
        } else {
          setPlacements((current) => current.map((placement) => placement.playerId === itemId ? { playerId: itemId, slot: snapped.slot } : placement));
        }
      }
    }
    drag.onPointerUp(event);
  };

  const chooseFormation = (next: FormationPreset) => {
    setFormation(next);
    setPlacements(applyPreset(next, placements.map((placement) => placement.playerId)));
  };

  const confirm = () => {
    // 벤치 선수만 고르고 뺄 선수를 안 고른 채 확정하면, 사용자는 교체했다고 믿지만 아무 일도 안 일어난다.
    // 자동 플레이테스트의 축구 팬이 정확히 이 상태로 경기를 끝까지 보고 배신감을 느꼈다.
    if (selectedBenchId !== null) {
      setNotice(`${players.get(selectedBenchId)?.label ?? "선수"}를 넣을 자리를 아직 고르지 않았습니다. 피치에서 뺄 선수를 누르거나 다시 눌러 선택을 해제하세요.`);
      return;
    }
    const intervention: Intervention = { tokenIndex, atMinute: 0, directives: clampDirectives(directives), formation, placements, substitutions };
    const previous = { directives: initialDirectives, formation: initialFormation, placements: initialPlacements };
    if (diffIntervention(previous, intervention).isNoOp) {
      setNotice("바뀐 전술이 없습니다. 토큰은 사용하지 않았습니다.");
      return;
    }
    onConfirm(intervention);
  };

  return (
    <section ref={dialogRef} className="dugout-overlay" role="dialog" aria-modal="true" tabIndex={-1} aria-label="더그아웃 전술 편집" onKeyDown={handleDialogKeyDown} onPointerDown={startDrag} onPointerMove={drag.onPointerMove} onPointerUp={finishDrag} onPointerCancel={drag.onPointerCancel} onLostPointerCapture={drag.onLostPointerCapture}>
      <header className="dugout-header"><div><p className="eyebrow">더그아웃, {minute}분</p><h2>개입 {tokenIndex + 1}</h2></div><button ref={closeButtonRef} type="button" className="text-button" onClick={onClose}>닫기</button></header>
      <p className="dg-status-guide" role="status">{statusGuide}</p>
      <section className="bench" aria-label="벤치 선수" style={SCROLL_REGION_STYLE}>
        <p>벤치, 교체 카드 {cardsRemaining}장{cardsRemaining > 0 ? ". 누르면 넣을 선수로 선택됩니다" : ""}</p>
        <div className="dg-bench-scroll-frame">
          <div className="bench-scroll">{benchPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className={`bench-card ${selectedBenchId === player.id ? "is-selected" : ""} ${player.confirmed ? "dg-bench-card--confirmed" : ""}`}
              style={DRAG_HANDLE_STYLE}
              data-drag-item={`bench:${player.id}`}
              onClick={() => handleTap(`bench:${player.id}`)}
              aria-pressed={selectedBenchId === player.id}
              aria-label={`${player.label}, ${player.position}${player.confirmed ? ", 확인됨" : ", 재구성"}. 눌러서 넣을 선수로 고르기`}
            >
              <span className="dg-bench-card__name">{player.label}{player.confirmed ? <span className="dg-bench-card__badge">확인됨</span> : null}</span>
              <small>{player.position}{player.confirmed ? "" : " 재구성"}</small>
            </button>
          ))}</div>
        </div>
      </section>
      <div ref={pitchRef} className="dugout-pitch">
        <PitchLines />
        {FORMATION_SLOTS[formation].map((slot, index) => {
          const fitnessClass = drag.state.phase === "dragging" && activePlayer !== undefined
            ? `fitness-${fitness(activePlayer.position, slot)}`
            : "";
          return <span key={`${slot.x}-${slot.y}`} className={`slot-marker ${fitnessClass}`} style={{ top: `${slot.x}%`, left: `${slot.y}%` }} aria-label={`배치 가능 슬롯 ${index + 1}`} />;
        })}
        {placements.map((placement) => {
          const player = players.get(placement.playerId);
          if (player === undefined) return null;
          // 드래그 중인 토큰은 손가락이나 커서를 실시간으로 따라가야 한다. 추종이 없으면
          // 배치가 확정될 때까지 화면이 멈춘 것처럼 보여 실기에서 고장으로 느껴진다.
          // 위치 자체는 슬롯 퍼센트로 두고 누적 이동량만 transform으로 얹는다.
          const isActiveDrag = drag.state.phase === "dragging" && drag.state.itemId === placement.playerId;
          const followTransform = isActiveDrag
            ? `translate(-50%, -50%) translate(${drag.state.dx}px, ${drag.state.dy}px)`
            : undefined;
          return (
            <button
              key={placement.playerId}
              type="button"
              className={`player-token ${isActiveDrag ? "is-dragging" : ""} ${selectedBenchId === null ? "" : "is-swap-target"}`}
              style={{
                ...DRAG_HANDLE_STYLE,
                top: `${placement.slot.x}%`,
                left: `${placement.slot.y}%`,
                ...(followTransform === undefined ? {} : { transform: followTransform, zIndex: 3 }),
              }}
              data-drag-item={placement.playerId}
              onClick={() => handleTap(placement.playerId)}
              aria-label={selectedBenchId === null
                ? `${player.label}, ${player.position}${player.confirmed ? "" : ", 재구성"}`
                : `${player.label}를 빼고 ${players.get(selectedBenchId)?.label ?? "선수"}를 넣기`}
            >
              <span>{player.label}</span>
              <small>{player.position}</small>
            </button>
          );
        })}
      </div>
      <div className="dugout-tabs" role="tablist"><button ref={(element) => { tabRefs.current[0] = element; }} id="dugout-tab-shape" type="button" role="tab" aria-selected={tab === "shape"} aria-controls="dugout-panel-shape" tabIndex={tab === "shape" ? 0 : -1} onClick={() => setTab("shape")} onKeyDown={(event) => handleTabKeyDown(event, "shape")}>포메이션</button><button ref={(element) => { tabRefs.current[1] = element; }} id="dugout-tab-directives" type="button" role="tab" aria-selected={tab === "directives"} aria-controls="dugout-panel-directives" tabIndex={tab === "directives" ? 0 : -1} onClick={() => setTab("directives")} onKeyDown={(event) => handleTabKeyDown(event, "directives")}>팀 지시</button></div>
      {tab === "shape" ? <section id="dugout-panel-shape" className="dugout-controls" role="tabpanel" aria-labelledby="dugout-tab-shape" tabIndex={0} aria-label="포메이션 프리셋">{FORMATIONS.map((preset) => <button key={preset} type="button" className={formation === preset ? "is-selected" : ""} onClick={() => chooseFormation(preset)}>{preset}</button>)}</section> : <section id="dugout-panel-directives" className="directive-controls" role="tabpanel" aria-labelledby="dugout-tab-directives" tabIndex={0} aria-label="팀 지시">{DIRECTIVES.map(({ key, label, low, high }) => <label key={key}><span>{label}<b>{directives[key]}</b></span><small>{low} <em>{high}</em></small><input type="range" min="-2" max="2" step="1" value={directives[key]} onChange={(event) => setDirectives((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</section>}
      <p className="fitness-legend"><i className="fitness-primary" />주 포지션 <i className="fitness-playable" />소화 가능 <i className="fitness-poor" />부적합</p>
      {notice === null ? null : <p className="dugout-notice" role="status">{notice}</p>}
      <footer className="dugout-actions"><button type="button" className="text-button" onClick={onClose}>취소</button><button type="button" className="button-link" onClick={confirm}>개입 확정</button></footer>
    </section>
  );
}
