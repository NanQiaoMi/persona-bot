"use client";

import { useEffect, useState } from "react";

/**
 * 在移动端监听 visualViewport 高度变化（软键盘弹起时缩减容器高度，避免输入框与最新消息被遮挡）。
 */
export function useVisualViewportHeight(enabled: boolean): number | null {
  const [keyboardViewportHeight, setKeyboardViewportHeight] = useState<number | null>(
    null
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.visualViewport) {
      queueMicrotask(() => setKeyboardViewportHeight(null));
      return;
    }

    const vv = window.visualViewport;
    const update = () => {
      const diff = window.innerHeight - vv.height;
      // 只有软键盘明显占去高度 (>80px) 时才覆盖 dvh 高度，避免地址栏微小变化导致重排抖动
      setKeyboardViewportHeight(diff > 80 ? Math.round(vv.height) : null);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return keyboardViewportHeight;
}
