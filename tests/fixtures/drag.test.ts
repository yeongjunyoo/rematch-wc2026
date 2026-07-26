import { describe, expect, it } from "vitest";
import {
  initialDragState,
  reduceDrag,
} from "../../src/ui/drag";
import type { DragConfig, DragEventIn, DragState } from "../../src/ui/drag";

const config: DragConfig = {
  activationDistance: 8,
  touchActivationDelayMs: 250,
};

function reduce(state: DragState, event: DragEventIn, nowMs: number) {
  return reduceDrag(state, event, config, nowMs);
}

describe("drag state machine", () => {
  it("activates a mouse drag after the distance and commits it on pointer up", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 1, x: 10, y: 10, itemId: "player-1", pointerType: "mouse" },
      0,
    );
    const dragging = reduce(pending.state, { type: "move", pointerId: 1, x: 19, y: 10 }, 10);
    const completed = reduce(dragging.state, { type: "up", pointerId: 1, x: 19, y: 10 }, 20);

    expect(dragging.state.phase).toBe("dragging");
    expect(completed.committed).toBe(true);
    expect(completed.state.phase).toBe("idle");
  });

  it("returns a short touch to idle without committing", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 2, x: 20, y: 20, itemId: "player-2", pointerType: "touch" },
      100,
    );
    const completed = reduce(pending.state, { type: "up", pointerId: 2, x: 22, y: 20 }, 200);

    expect(completed.committed).toBe(false);
    expect(completed.state.phase).toBe("idle");
  });

  it("activates a touch drag after its delay", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 3, x: 20, y: 20, itemId: "player-3", pointerType: "touch" },
      100,
    );
    const dragging = reduce(pending.state, { type: "move", pointerId: 3, x: 21, y: 20 }, 350);

    expect(dragging.state.phase).toBe("dragging");
  });

  it("cancels a vertically dominant pending touch to yield scrolling", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 4, x: 20, y: 20, itemId: "player-4", pointerType: "touch" },
      0,
    );
    const cancelled = reduce(pending.state, { type: "move", pointerId: 4, x: 22, y: 30 }, 10);

    expect(cancelled.state.phase).toBe("cancelled");
    expect(cancelled.committed).toBe(false);
  });

  it("ignores movement and release from another pointer", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 5, x: 20, y: 20, itemId: "player-5", pointerType: "mouse" },
      0,
    );
    const movedByOtherPointer = reduce(
      pending.state,
      { type: "move", pointerId: 6, x: 80, y: 20 },
      10,
    );
    const releasedByOtherPointer = reduce(
      movedByOtherPointer.state,
      { type: "up", pointerId: 6, x: 80, y: 20 },
      20,
    );

    expect(movedByOtherPointer.state).toBe(pending.state);
    expect(releasedByOtherPointer.state).toBe(pending.state);
    expect(releasedByOtherPointer.committed).toBe(false);
  });

  it("cancels a drag without committing and ignores later movement", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 7, x: 20, y: 20, itemId: "player-7", pointerType: "mouse" },
      0,
    );
    const dragging = reduce(pending.state, { type: "move", pointerId: 7, x: 30, y: 20 }, 10);
    const cancelled = reduce(dragging.state, { type: "cancel", pointerId: 7 }, 20);
    const laterMove = reduce(cancelled.state, { type: "move", pointerId: 7, x: 90, y: 90 }, 30);

    expect(cancelled.committed).toBe(false);
    expect(laterMove.state).toBe(cancelled.state);
  });

  it("tracks displacement from the drag start", () => {
    const pending = reduce(
      initialDragState(),
      { type: "down", pointerId: 8, x: 40, y: 50, itemId: "player-8", pointerType: "mouse" },
      0,
    );
    const dragging = reduce(pending.state, { type: "move", pointerId: 8, x: 51, y: 43 }, 10);
    const movedAgain = reduce(dragging.state, { type: "move", pointerId: 8, x: 55, y: 47 }, 20);

    expect(movedAgain.state).toMatchObject({ dx: 15, dy: -3, lastX: 55, lastY: 47 });
  });

  it("does not mutate the supplied state", () => {
    const state = initialDragState();
    const before = structuredClone(state);

    reduce(
      state,
      { type: "down", pointerId: 9, x: 20, y: 20, itemId: "player-9", pointerType: "mouse" },
      0,
    );

    expect(state).toEqual(before);
  });
});
