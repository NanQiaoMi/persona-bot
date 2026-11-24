"use client";

import { useSyncExternalStore } from "react";

/**
 * 订阅 CSS 媒体查询。服务端渲染时返回 serverValue，客户端水合后自动切换为真实值，不会产生水合不一致。
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/** 小于 768px：手机 */
export const NARROW_QUERY = "(max-width: 767px)";
/** 小于 1024px：右侧面板改为覆盖式抽屉 */
export const COMPACT_QUERY = "(max-width: 1023px)";
