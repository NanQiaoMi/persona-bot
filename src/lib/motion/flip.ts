/**
 * 轻量 FLIP（First-Last-Invert-Play）列表重排动画工具。
 * 仅驱动 transform，不触发布局回流，并支持长列表与减少动态效果自动降级。
 */

export interface RectLike {
  left: number;
  top: number;
}

/**
 * 计算旧位置到新位置的反向偏移量。
 */
export function computeFlipDelta(
  prev: RectLike,
  next: RectLike
): { dx: number; dy: number } {
  return {
    dx: Math.round(prev.left - next.left),
    dy: Math.round(prev.top - next.top),
  };
}

/**
 * 判断是否允许运行 FLIP 重排动画。
 */
export function shouldAnimateFlip(
  itemCount: number,
  reducedMotion: boolean,
  maxItems = 50
): boolean {
  if (reducedMotion) return false;
  if (itemCount <= 1 || itemCount > maxItems) return false;
  return true;
}

/**
 * 在列表重排前采集带 data-flip-id 元素的位置。
 */
export function capturePositions(
  container: HTMLElement | null,
  selector = "[data-flip-id]"
): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (!container) return map;
  const items = container.querySelectorAll<HTMLElement>(selector);
  items.forEach((el) => {
    const id = el.dataset.flipId;
    if (id) {
      map.set(id, el.getBoundingClientRect());
    }
  });
  return map;
}

/**
 * 在 DOM 更新后播放 FLIP 过渡动画，仅改动 transform，结束后清理内联样式。
 */
export function playFlip(
  container: HTMLElement | null,
  prevRects: Map<string, DOMRect>,
  options: {
    selector?: string;
    durationMs?: number;
    easing?: string;
    reducedMotion?: boolean;
    maxItems?: number;
  } = {}
): void {
  if (!container || prevRects.size === 0) return;

  const {
    selector = "[data-flip-id]",
    durationMs = 260,
    easing = "cubic-bezier(0.22, 1, 0.36, 1)",
    reducedMotion = false,
    maxItems = 50,
  } = options;

  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));
  if (!shouldAnimateFlip(elements.length, reducedMotion, maxItems)) return;

  const animatedEls: HTMLElement[] = [];

  for (const el of elements) {
    const id = el.dataset.flipId;
    if (!id) continue;
    const prevRect = prevRects.get(id);
    if (!prevRect) continue;

    const nextRect = el.getBoundingClientRect();
    const { dx, dy } = computeFlipDelta(prevRect, nextRect);
    if (dx === 0 && dy === 0) continue;

    el.style.transition = "none";
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    animatedEls.push(el);
  }

  if (animatedEls.length === 0) return;

  // 强制一次几何读取以提交初始反向位移
  void container.offsetHeight;

  window.requestAnimationFrame(() => {
    for (const el of animatedEls) {
      el.style.transition = `transform ${durationMs}ms ${easing}`;
      el.style.transform = "translate3d(0, 0, 0)";

      const cleanup = () => {
        el.style.transition = "";
        el.style.transform = "";
        el.removeEventListener("transitionend", cleanup);
      };
      el.addEventListener("transitionend", cleanup, { once: true });
      window.setTimeout(cleanup, durationMs + 60);
    }
  });
}
