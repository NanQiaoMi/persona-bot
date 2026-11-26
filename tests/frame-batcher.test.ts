import { describe, expect, it, vi } from "vitest";
import { createFrameBatcher, defaultFrameScheduler, type Scheduler } from "@/lib/chat/frame-batcher";

function manualScheduler() {
  const callbacks: Array<() => void> = [];
  const cancelled = new Set<() => void>();
  const schedule: Scheduler = (cb) => {
    callbacks.push(cb);
    return () => cancelled.add(cb);
  };
  const tick = () => {
    const pending = callbacks.splice(0);
    pending.forEach((cb) => {
      if (!cancelled.has(cb)) cb();
    });
  };
  return { schedule, tick, scheduledCount: () => callbacks.length };
}

describe("createFrameBatcher", () => {
  it("merges several updates in one frame into a single apply, in order", () => {
    let state = { text: "" };
    const apply = vi.fn((fn: (s: typeof state) => typeof state) => {
      state = fn(state);
    });
    const s = manualScheduler();
    const batcher = createFrameBatcher(apply, s.schedule);

    batcher.push((p) => ({ text: p.text + "a" }));
    batcher.push((p) => ({ text: p.text + "b" }));
    batcher.push((p) => ({ text: p.text + "c" }));
    expect(apply).not.toHaveBeenCalled();
    expect(s.scheduledCount()).toBe(1);

    s.tick();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(state.text).toBe("abc");
  });

  it("flush applies immediately and cancels the scheduled frame", () => {
    let state = 0;
    const apply = vi.fn((fn: (s: number) => number) => {
      state = fn(state);
    });
    const s = manualScheduler();
    const batcher = createFrameBatcher(apply, s.schedule);

    batcher.push((p) => p + 1);
    batcher.flush();
    expect(state).toBe(1);
    s.tick();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing queued does not apply", () => {
    const apply = vi.fn();
    const batcher = createFrameBatcher(apply, manualScheduler().schedule);
    batcher.flush();
    expect(apply).not.toHaveBeenCalled();
  });

  it("cancel drops queued updates", () => {
    const apply = vi.fn();
    const s = manualScheduler();
    const batcher = createFrameBatcher(apply, s.schedule);
    batcher.push((p) => p);
    batcher.cancel();
    s.tick();
    expect(apply).not.toHaveBeenCalled();
  });

  it("schedules a new frame after the previous one flushed", () => {
    let state = 0;
    const s = manualScheduler();
    const batcher = createFrameBatcher<number>((fn) => {
      state = fn(state);
    }, s.schedule);
    batcher.push((p) => p + 1);
    s.tick();
    batcher.push((p) => p + 10);
    expect(s.scheduledCount()).toBe(1);
    s.tick();
    expect(state).toBe(11);
  });
});

describe("defaultFrameScheduler", () => {
  it("falls back to a timer when no animation frame fires", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    defaultFrameScheduler(cb);
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("cancel prevents the callback", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const cancel = defaultFrameScheduler(cb);
    cancel();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
