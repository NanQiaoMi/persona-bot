"use client";

import { useEffect, useRef, useState } from "react";

export interface TooltipProps {
  content: React.ReactNode;
  placement?: "top" | "bottom";
  delayMs?: number;
  children: React.ReactNode;
}

export function Tooltip({
  content,
  placement = "top",
  delayMs = 400,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTouchRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const show = () => {
    if (pointerTouchRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delayMs);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  const posCls =
    placement === "bottom"
      ? "top-full mt-1.5 left-1/2 -translate-x-1/2"
      : "bottom-full mb-1.5 left-1/2 -translate-x-1/2";

  return (
    <span
      className="relative inline-flex"
      onPointerDown={(e) => {
        pointerTouchRef.current = e.pointerType === "touch";
      }}
      onPointerEnter={(e) => {
        pointerTouchRef.current = e.pointerType === "touch";
        show();
      }}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && content && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-[95] whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--user-capsule)] px-2.5 py-1 text-[11px] font-medium text-[var(--user-capsule-text)] shadow-raised animate-fade-in ${posCls}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
