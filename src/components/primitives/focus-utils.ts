/**
 * 弹窗与抽屉无障碍焦点辅助工具（纯函数可单测）。
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * 计算 Tab / Shift+Tab 在弹窗可聚焦列表中的下一个索引。
 * 返回 -1 表示容器内没有可聚焦元素。
 */
export function getNextFocusIndex(
  currentIndex: number,
  total: number,
  shiftKey: boolean
): number {
  if (total <= 0) return -1;
  if (total === 1) return 0;

  if (shiftKey) {
    if (currentIndex <= 0 || currentIndex >= total) {
      return total - 1;
    }
    return currentIndex - 1;
  }

  if (currentIndex < 0 || currentIndex >= total - 1) {
    return 0;
  }
  return currentIndex + 1;
}

/**
 * 判断按下按键是否应关闭弹窗/抽屉。
 */
export function shouldCloseOnEscape(key: string, closeOnEscape = true): boolean {
  return closeOnEscape && key === "Escape";
}

/**
 * 判断点击遮罩层时是否应关闭（仅当点在遮罩自身而非内容区时关闭）。
 */
export function shouldCloseOnBackdrop(
  isTargetSameAsCurrentTarget: boolean,
  closeOnBackdrop = true
): boolean {
  return closeOnBackdrop && isTargetSameAsCurrentTarget;
}

/**
 * 读取容器内所有可见、可聚焦的元素。
 */
export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}
