import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { applyPreset, clampDirectives, clampToPitch, fitness, FORMATION_SLOTS, snapToNearestSlot, substitute, swapPlacements } from "../domain/tactics";
import type { FormationPreset, Intervention, Placement, TacticalDirectives } from "../domain/types";
import { diffIntervention } from "../domain/rng";
import { DRAG_HANDLE_STYLE, SCROLL_REGION_STYLE, useDragController } from "../ui/drag";
import { squadFor } from "../ui/squad";

interface DugoutProps {
  scenarioId: string;
  tokenIndex: number;
  initialFormation: FormationPreset;
  initialPlacements: readonly Placement[];
  initialDirectives: TacticalDirectives;
  onConfirm: (intervention: Intervention) => void;
  onClose: () => void;
}

const FORMATIONS: readonly FormationPreset[] = ["4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "5-4-1"];
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

export function Dugout({ scenarioId, tokenIndex, initialFormation, initialPlacements, initialDirectives, onConfirm, onClose }: DugoutProps) {
  const squad = useMemo(() => squadFor(scenarioId), [scenarioId]);
  const [formation, setFormation] = useState(initialFormation);
  const [placements, setPlacements] = useState<readonly Placement[]>(initialPlacements);
  const [directives, setDirectives] = useState(initialDirectives);
  const [cardsUsed, setCardsUsed] = useState(0);
  const [substitutions, setSubstitutions] = useState<readonly { readonly outId: string; readonly inId: string }[]>([]);
  const [tab, setTab] = useState<"shape" | "directives">("shape");
  const [notice, setNotice] = useState<string | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const drag = useDragController({ activationDistance: 6, touchActivationDelayMs: 180 });
  const players = useMemo(() => new Map([...squad.starters, ...squad.bench].map((player) => [player.id, player])), [squad]);
  const activePlayerId = drag.state.itemId?.replace("bench:", "") ?? null;
  const activePlayer = activePlayerId === null ? undefined : players.get(activePlayerId);

  useEffect(() => {
    setFormation(initialFormation);
    setPlacements(initialPlacements);
    setDirectives(initialDirectives);
    setCardsUsed(0);
    setSubstitutions([]);
    setNotice(null);
  }, [initialDirectives, initialFormation, initialPlacements, scenarioId]);

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

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    const itemId = drag.state.itemId;
    const wasDragging = drag.state.phase === "dragging";
    if (wasDragging && itemId !== null) {
      const point = pointFromEvent(event);
      if (point !== null) {
        const snapped = snapToNearestSlot(point, FORMATION_SLOTS[formation]);
        const target = placements.find((placement) => placement.slot.x === snapped.slot.x && placement.slot.y === snapped.slot.y);
        if (itemId.startsWith("bench:")) {
          if (target === undefined) {
            setNotice("교체할 선수를 찾을 수 없습니다.");
          } else {
            const incomingId = itemId.slice(6);
            const result = substitute(placements, target.playerId, incomingId, cardsUsed, 3);
            if (result.ok) {
              setPlacements(result.placements);
              setCardsUsed(result.cardsUsed);
              setSubstitutions((current) => [...current, { outId: target.playerId, inId: incomingId }]);
              setNotice("교체 카드를 사용했습니다.");
            } else setNotice(`교체할 수 없습니다. ${result.reason}`);
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
    const intervention: Intervention = { tokenIndex, atMinute: 0, directives: clampDirectives(directives), formation, placements, substitutions };
    const previous = { directives: initialDirectives, formation: initialFormation, placements: initialPlacements };
    if (diffIntervention(previous, intervention).isNoOp) {
      setNotice("바뀐 전술이 없습니다. 토큰은 사용하지 않았습니다.");
      return;
    }
    onConfirm(intervention);
  };

  return (
    <section className="dugout-overlay" role="dialog" aria-modal="true" aria-label="더그아웃 전술 편집" onPointerDown={startDrag} onPointerMove={drag.onPointerMove} onPointerUp={finishDrag} onPointerCancel={drag.onPointerCancel} onLostPointerCapture={drag.onLostPointerCapture}>
      <header className="dugout-header"><div><p className="eyebrow">더그아웃</p><h2>개입 {tokenIndex + 1}</h2></div><button type="button" className="text-button" onClick={onClose}>닫기</button></header>
      <div className="dugout-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "shape"} onClick={() => setTab("shape")}>포메이션</button><button type="button" role="tab" aria-selected={tab === "directives"} onClick={() => setTab("directives")}>팀 지시</button></div>
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
              className={`player-token ${isActiveDrag ? "is-dragging" : ""}`}
              style={{
                ...DRAG_HANDLE_STYLE,
                top: `${placement.slot.x}%`,
                left: `${placement.slot.y}%`,
                ...(followTransform === undefined ? {} : { transform: followTransform, zIndex: 3 }),
              }}
              data-drag-item={placement.playerId}
              aria-label={`${player.label}, ${player.position}${player.confirmed ? "" : ", 재구성"}`}
            >
              <span>{player.label}</span>
              <small>{player.position}</small>
            </button>
          );
        })}
      </div>
      <p className="fitness-legend"><i className="fitness-primary" />주 포지션 <i className="fitness-playable" />소화 가능 <i className="fitness-poor" />부적합</p>
      <section className="bench" aria-label="벤치 선수" style={SCROLL_REGION_STYLE}><p>벤치, 교체 카드 {3 - cardsUsed}장</p><div className="bench-scroll">{squad.bench.filter((player) => !placements.some((placement) => placement.playerId === player.id)).map((player) => <button key={player.id} type="button" className="bench-card" style={DRAG_HANDLE_STYLE} data-drag-item={`bench:${player.id}`}>{player.label}<small>{player.position}{player.confirmed ? "" : " 재구성"}</small></button>)}</div></section>
      {tab === "shape" ? <section className="dugout-controls" aria-label="포메이션 프리셋">{FORMATIONS.map((preset) => <button key={preset} type="button" className={formation === preset ? "is-selected" : ""} onClick={() => chooseFormation(preset)}>{preset}</button>)}</section> : <section className="directive-controls" aria-label="팀 지시">{DIRECTIVES.map(({ key, label, low, high }) => <label key={key}><span>{label}<b>{directives[key]}</b></span><small>{low} <em>{high}</em></small><input type="range" min="-2" max="2" step="1" value={directives[key]} onChange={(event) => setDirectives((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</section>}
      {notice === null ? null : <p className="dugout-notice" role="status">{notice}</p>}
      <footer className="dugout-actions"><button type="button" className="text-button" onClick={onClose}>취소</button><button type="button" className="button-link" onClick={confirm}>개입 확정</button></footer>
    </section>
  );
}
