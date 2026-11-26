/**
 * 把一帧内的多次 state 更新合成一次：流式回复每来一个字都 setState 会让页面每秒重画几十上百次，
 * 合并后每帧最多重画一次，看起来一样流畅，CPU 少很多。
 */
export type Updater<S> = (prev: S) => S;
export type CancelFn = () => void;
export type Scheduler = (cb: () => void) => CancelFn;

/** 默认调度：下一帧执行；页面在后台时浏览器会暂停动画帧，用 100ms 定时器兜底，保证仍会刷新 */
export const defaultFrameScheduler: Scheduler = (cb) => {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cancel();
    cb();
  };
  const raf =
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : null;
  const timer = setTimeout(run, 100);
  const cancel = () => {
    if (raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    clearTimeout(timer);
  };
  return () => {
    done = true;
    cancel();
  };
};

export interface FrameBatcher<S> {
  /** 排队一个更新，本帧结束时与其它更新按顺序合并后一次性提交 */
  push: (updater: Updater<S>) => void;
  /** 立刻提交已排队的更新（需要和别的 setState 保持先后顺序时调用） */
  flush: () => void;
  /** 丢弃已排队、尚未提交的更新 */
  cancel: () => void;
}

export function createFrameBatcher<S>(
  apply: (updater: Updater<S>) => void,
  schedule: Scheduler = defaultFrameScheduler
): FrameBatcher<S> {
  let queue: Updater<S>[] = [];
  let cancelScheduled: CancelFn | null = null;

  const flush = () => {
    if (cancelScheduled) {
      cancelScheduled();
      cancelScheduled = null;
    }
    if (queue.length === 0) return;
    const pending = queue;
    queue = [];
    apply((prev) => pending.reduce((acc, fn) => fn(acc), prev));
  };

  return {
    push(updater) {
      queue.push(updater);
      if (!cancelScheduled) {
        cancelScheduled = schedule(() => {
          cancelScheduled = null;
          flush();
        });
      }
    },
    flush,
    cancel() {
      if (cancelScheduled) {
        cancelScheduled();
        cancelScheduled = null;
      }
      queue = [];
    },
  };
}
