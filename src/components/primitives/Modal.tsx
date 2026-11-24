"use client";

import { useEffect, useId, useRef } from "react";
import {
  getFocusableElements,
  getNextFocusIndex,
  shouldCloseOnBackdrop,
  shouldCloseOnEscape,
} from "./focus-utils";
import { IconButton } from "./IconButton";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  role?: "dialog" | "alertdialog";
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  hideCloseButton?: boolean;
  alignTop?: boolean;
  className?: string;
  bodyClassName?: string;
  zIndexClass?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "sm:max-w-[380px]",
  md: "sm:max-w-[460px]",
  lg: "sm:max-w-[600px]",
  xl: "sm:max-w-[740px]",
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  role = "dialog",
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  alignTop = false,
  className = "",
  bodyClassName = "",
  zIndexClass = "z-[90]",
  ariaLabel,
  children,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
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
        if (focusables.length === 0) {
          e.preventDefault();
          container.focus();
          return;
        }
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

  const verticalAlign = alignTop
    ? "items-start pt-[8vh] sm:pt-[12vh]"
    : "items-end sm:items-center";

  const panelRadius = alignTop
    ? "rounded-[var(--r-xl)] mx-3 sm:mx-0"
    : "rounded-t-[var(--r-xl)] sm:rounded-[var(--r-xl)]";

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex justify-center ${verticalAlign} bg-black/35 backdrop-blur-[3px] sm:p-4 animate-fade-in`}
      onClick={(e) => {
        if (shouldCloseOnBackdrop(e.target === e.currentTarget, closeOnBackdrop)) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${SIZE_CLASSES[size]} ${panelRadius} max-h-[90dvh] flex flex-col overflow-hidden bg-surface-overlay backdrop-blur-2xl border border-[var(--border-subtle)] shadow-overlay outline-none animate-popover-in ${className}`}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--border-subtle)] shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={titleId}
                  className="text-[16px] font-semibold text-primary leading-snug"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1 text-[12px] text-secondary leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <IconButton label="关闭弹窗" size={32} onClick={onClose}>
                <span aria-hidden="true" className="text-[13px]">
                  ✕
                </span>
              </IconButton>
            )}
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
