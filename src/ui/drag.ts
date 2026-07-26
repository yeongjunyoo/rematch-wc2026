import { useCallback, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

export type DragPhase = "idle" | "pending" | "dragging" | "cancelled";

export interface DragState {
  phase: DragPhase;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dx: number;
  dy: number;
  itemId: string | null;
  startedAtMs: number;
  pointerType: "mouse" | "touch" | "pen" | null;
}

export type DragEventIn =
  | {
      type: "down";
      pointerId: number;
      x: number;
      y: number;
      itemId: string;
      pointerType: "mouse" | "touch" | "pen";
    }
  | { type: "move"; pointerId: number; x: number; y: number }
  | { type: "up"; pointerId: number; x: number; y: number }
  | { type: "cancel"; pointerId: number };

export interface DragConfig {
  activationDistance: number;
  touchActivationDelayMs: number;
}

export interface DragResult {
  state: DragState;
  committed: boolean;
}

export const DRAG_HANDLE_STYLE: CSSProperties = {
  touchAction: "none",
};

export const SCROLL_REGION_STYLE: CSSProperties = {
  touchAction: "pan-y",
};

// Sliders must stay outside drag activators so they do not inherit touch-action: none.

export function initialDragState(): DragState {
  return {
    phase: "idle",
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dx: 0,
    dy: 0,
    itemId: null,
    startedAtMs: 0,
    pointerType: null,
  };
}

function isTrackedPointer(state: DragState, pointerId: number): boolean {
  return state.pointerId === null || state.pointerId === pointerId;
}

function withPosition(state: DragState, x: number, y: number): DragState {
  return {
    ...state,
    lastX: x,
    lastY: y,
    dx: x - state.startX,
    dy: y - state.startY,
  };
}

export function reduceDrag(
  state: DragState,
  event: DragEventIn,
  config: DragConfig,
  nowMs: number,
): DragResult {
  if (event.type === "down") {
    if (state.phase === "pending" || state.phase === "dragging") {
      return { state, committed: false };
    }

    return {
      state: {
        phase: "pending",
        pointerId: event.pointerId,
        startX: event.x,
        startY: event.y,
        lastX: event.x,
        lastY: event.y,
        dx: 0,
        dy: 0,
        itemId: event.itemId,
        startedAtMs: nowMs,
        pointerType: event.pointerType,
      },
      committed: false,
    };
  }

  if (!isTrackedPointer(state, event.pointerId)) {
    return { state, committed: false };
  }

  if (event.type === "cancel") {
    return {
      state: { ...state, phase: "cancelled" },
      committed: false,
    };
  }

  if (state.phase === "idle" || state.phase === "cancelled") {
    return { state, committed: false };
  }

  if (event.type === "move") {
    const next = withPosition(state, event.x, event.y);

    if (state.phase === "dragging") {
      return { state: next, committed: false };
    }

    if (Math.abs(next.dy) > Math.abs(next.dx) * 1.5) {
      return {
        state: { ...next, phase: "cancelled" },
        committed: false,
      };
    }

    const movedFarEnough = Math.hypot(next.dx, next.dy) > config.activationDistance;
    const touchDelayElapsed =
      state.pointerType === "touch" && nowMs - state.startedAtMs >= config.touchActivationDelayMs;

    if (movedFarEnough || touchDelayElapsed) {
      return {
        state: { ...next, phase: "dragging" },
        committed: false,
      };
    }

    return { state: next, committed: false };
  }

  const committed = state.phase === "dragging";
  return {
    state: initialDragState(),
    committed,
  };
}

export interface DragController {
  state: DragState;
  onPointerDown: (event: PointerEvent<HTMLElement>, itemId: string) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

export function useDragController(config: DragConfig): DragController {
  const stateRef = useRef<DragState>(initialDragState());
  const [state, setState] = useState<DragState>(stateRef.current);

  const dispatch = useCallback(
    (event: DragEventIn, nowMs: number): DragResult => {
      const result = reduceDrag(stateRef.current, event, config, nowMs);
      stateRef.current = result.state;
      setState(result.state);
      return result;
    },
    [config],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, itemId: string): void => {
      dispatch(
        {
          type: "down",
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          itemId,
          pointerType: event.pointerType as "mouse" | "touch" | "pen",
        },
        event.timeStamp,
      );
    },
    [dispatch],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>): void => {
      const ownsPointer = stateRef.current.pointerId === event.pointerId;
      const result = dispatch(
        { type: "move", pointerId: event.pointerId, x: event.clientX, y: event.clientY },
        event.timeStamp,
      );

      if (ownsPointer && result.state.phase === "dragging") {
        event.preventDefault();
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
    },
    [dispatch],
  );

  const releasePointerCapture = useCallback((event: PointerEvent<HTMLElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>): void => {
      const ownsPointer = stateRef.current.pointerId === event.pointerId;
      const wasDragging = ownsPointer && stateRef.current.phase === "dragging";
      dispatch(
        { type: "up", pointerId: event.pointerId, x: event.clientX, y: event.clientY },
        event.timeStamp,
      );
      if (wasDragging) {
        event.preventDefault();
        releasePointerCapture(event);
      }
    },
    [dispatch, releasePointerCapture],
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>): void => {
      const ownsPointer = stateRef.current.pointerId === event.pointerId;
      const wasDragging = ownsPointer && stateRef.current.phase === "dragging";
      dispatch({ type: "cancel", pointerId: event.pointerId }, event.timeStamp);
      if (wasDragging) {
        releasePointerCapture(event);
      }
    },
    [dispatch, releasePointerCapture],
  );

  return { state, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
