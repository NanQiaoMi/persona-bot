"use client";

import { useEffect, useId, useRef } from "react";
import {
  getFocusableElements,
  getNextFocusIndex,
  shouldCloseOnBackdrop,
  shouldCloseOnEscape,
} from "./focus-utils";

export type SheetSide = "left" | "right" | "bottom";

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  side?: SheetSide;
  ariaLabel: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  zIndexClass?: string;
  children: React.ReactNode;
}

const SIDE_CONTAINER: Record<SheetSide, string> = {
  left: "justify-start items-stretch",
  right: "justify-end items-stretch",
  bottom: "justify-center items-end",
};

const SIDE_PANEL: Record<SheetSide, string> = {
  left: "h-full w-[min(86vw,320px)] max-w-full animate-drawer-left",
  right: "h-full w-[min(90vw,360px)] max-w-full animate-drawer-right",
  bottom:
    "w-full max-h-[88dvh] rounded-t-[var(--r-xl)] border-t border-[var(--border-subtle)] bg-surface-base animate-drawer-bottom overflow-y-auto",
};

export function Sheet({
  isOpen,
  onClose,
  side = "left",
  ariaLabel,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = "",
  zIndexClass = "z-50",
  children,
}: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const rafId = window.requestAnimationFrame(() => {
      const container = panelRef.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return;
      const focusables = getFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldCloseOnEscape(e.key, closeOnEscape)) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const container = panelRef.current;
        if (!container) return;
        const focusables = getFocusableElements(container);
        if (focusables.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const currentIndex = active ? focusables.indexOf(active) : -1;
        const nextIndex = getNextFocusIndex(currentIndex, focusables.length, e.shiftKey);
        if (nextIndex >= 0 && focusables[nextIndex]) {
          e.preventDefault();
          focusables[nextIndex].focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex ${SIDE_CONTAINER[side]} bg-black/35 backdrop-blur-[2px] animate-fade-in`}
      onClick={(e) => {
        if (shouldCloseOnBackdrop(e.target === e.currentTarget, closeOnBackdrop)) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-describedby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative shadow-overlay outline-none ${SIDE_PANEL[side]} ${className}`}
      >
        <span id={titleId} className="sr-only">
          {ariaLabel}
        </span>
        {children}
      </div>
    </div>
  );
}
