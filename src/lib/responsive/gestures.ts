/**
 * 移动端触控手势判定辅助函数（纯函数可单测）。
 */

export type BottomSheetSnap = "half" | "full";

/**
 * 判断左边缘右滑手势是否应打开左侧侧栏抽屉。
 */
export function shouldOpenLeftDrawerBySwipe(
  startX: number,
  dx: number,
  dy: number
): boolean {
  return startX <= 28 && dx >= 52 && Math.abs(dy) <= 44;
}

/**
 * 判断在打开的左侧抽屉内左滑是否应关闭抽屉。
 */
export function shouldCloseLeftDrawerBySwipe(dx: number, dy: number): boolean {
  return dx <= -52 && Math.abs(dy) <= 44;
}

/**
 * 根据底部弹层当前停靠状态和拖拽垂直位移 dy (>0 向下拉，<0 向上推) 计算下一状态。
 */
export function resolveBottomSheetSnap(
  currentSnap: BottomSheetSnap,
  dy: number
): "closed" | BottomSheetSnap {
  if (currentSnap === "half") {
    if (dy > 80) return "closed";
    if (dy < -60) return "full";
    return "half";
  }

  // currentSnap === "full"
  if (dy > 160) return "closed";
  if (dy > 70) return "half";
  return "full";
}
