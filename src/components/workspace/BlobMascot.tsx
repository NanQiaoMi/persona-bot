"use client";

import { useEffect, useRef, useState } from "react";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  getMascotConfigForPersona,
  MASCOT_COLORS,
  MASCOT_SHAPES,
  MascotShapeId,
} from "./mascot-palette";

export { getMascotConfigForPersona, MASCOT_COLORS, MASCOT_SHAPES };
export type { MascotShapeId };

// Shared singleton mouse pointer tracker so all mascots track cursor with 1 global listener
type PointerListener = (pos: { x: number; y: number } | null) => void;
const pointerListeners = new Set<PointerListener>();
let globalPointerAttached = false;
let lastPointerPos: { x: number; y: number } | null = null;

function subscribePointer(fn: PointerListener): () => void {
  pointerListeners.add(fn);
  if (!globalPointerAttached && typeof window !== "undefined") {
    globalPointerAttached = true;
    window.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        lastPointerPos = { x: e.clientX, y: e.clientY };
        pointerListeners.forEach((cb) => cb(lastPointerPos));
      },
      { passive: true }
    );
    window.addEventListener(
      "pointerleave",
      () => {
        lastPointerPos = null;
        pointerListeners.forEach((cb) => cb(null));
      },
      { passive: true }
    );
  }
  if (lastPointerPos) fn(lastPointerPos);
  return () => {
    pointerListeners.delete(fn);
  };
}

interface BlobMascotProps {
  shape?: MascotShapeId;
  color?: string;
  image?: string;
  size?: number;
  showOnlineDot?: boolean;
  trackPointer?: boolean;
  animated?: boolean;
  state?: "idle" | "thinking" | "working";
  blinkDelayMs?: number;
  className?: string;
}

export default function BlobMascot({
  shape = "circle",
  color = "#1683FF",
  image,
  size = 32,
  showOnlineDot = false,
  trackPointer = true,
  animated = true,
  state = "idle",
  blinkDelayMs = 0,
  className = "",
}: BlobMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const isVisible = useDocumentVisible();
  const reducedMotion = useReducedMotion();
  const effectiveAnimated = animated && isVisible && !reducedMotion;

  useEffect(() => {
    if (!trackPointer || image || !isVisible || reducedMotion) return;
    return subscribePointer((pos) => {
      const el = containerRef.current;
      if (!el || !pos) {
        setEyeOffset({ x: 0, y: 0 });
        return;
      }
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) {
        setEyeOffset({ x: 0, y: 0 });
        return;
      }
      const factor = Math.min(1, dist / 240);
      const maxX = 6.2;
      const maxY = 4.6;
      setEyeOffset({
        x: Number(((dx / dist) * maxX * factor).toFixed(2)),
        y: Number(((dy / dist) * maxY * factor).toFixed(2)),
      });
    });
  }, [trackPointer, image, isVisible, reducedMotion]);

  if (image) {
    return (
      <div
        ref={containerRef}
        className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="avatar"
          className={`w-full h-full rounded-full object-cover border border-black/10 ${
            state === "working" ? "animate-blob-work" : ""
          }`}
        />
        {showOnlineDot && (
          <span
            className="absolute bottom-0 right-0 rounded-full bg-[#2563EB] ring-2 ring-[var(--bg-secondary)]"
            style={{
              width: Math.max(8, Math.round(size * 0.22)),
              height: Math.max(8, Math.round(size * 0.22)),
            }}
          />
        )}
      </div>
    );
  }

  const shapeDef =
    MASCOT_SHAPES.find((s) => s.id === shape) || MASCOT_SHAPES[0];

  const isWorking = state === "working" || state === "thinking";
  const bodyAnimClass = effectiveAnimated
    ? isWorking
      ? "animate-blob-work"
      : "animate-blob-breathe"
    : "";

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center shrink-0 blob-interactive ${className}`}
      style={{ width: size, height: size }}
    >
      {isWorking && effectiveAnimated && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full blur-md animate-aura-pulse pointer-events-none"
          style={{ backgroundColor: color }}
        />
      )}
      <svg viewBox="0 0 64 64" className="relative w-full h-full overflow-visible">
        <g className={`blob-body-layer ${bodyAnimClass}`}>
          {/* Pure Flat Solid Matte Vector Silhouette */}
          <path d={shapeDef.path} fill={color} />

          {/* Pointer-Tracking White Pill Eyes (asymmetric pulsing when working/thinking) */}
          <g
            style={{
              transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`,
              transition: "transform var(--motion-fast) var(--ease-spring)",
            }}
          >
            <g
              className={effectiveAnimated && !isWorking ? "animate-blob-blink" : ""}
              style={{ animationDelay: `${blinkDelayMs}ms` }}
            >
              <g className={isWorking && effectiveAnimated ? "animate-eye-left" : ""}>
                <rect
                  x="23.5"
                  y="24"
                  width="5.2"
                  height="11.5"
                  rx="2.6"
                  fill="#FFFFFF"
                />
              </g>
              <g className={isWorking && effectiveAnimated ? "animate-eye-right" : ""}>
                <rect
                  x="35.3"
                  y="24"
                  width="5.2"
                  height="11.5"
                  rx="2.6"
                  fill="#FFFFFF"
                />
              </g>
            </g>
          </g>
        </g>
      </svg>

      {showOnlineDot && (
        <span
          className="absolute bottom-0.5 right-0.5 rounded-full bg-[#2563EB] ring-2 ring-[var(--bg-secondary)]"
          style={{
            width: Math.max(8, Math.round(size * 0.21)),
            height: Math.max(8, Math.round(size * 0.21)),
          }}
        />
      )}
    </div>
  );
}
