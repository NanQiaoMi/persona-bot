"use client";
import { thumbUrl } from "@/lib/media/thumb-url";

import { useEffect, useRef } from "react";
import {
  getMascotConfigForPersona,
  MASCOT_COLORS,
  MASCOT_SHAPES,
  MascotShapeId,
} from "./mascot-palette";

export { getMascotConfigForPersona, MASCOT_COLORS, MASCOT_SHAPES };
export type { MascotShapeId };

// 全局只挂一个指针监听；鼠标移动再快，也按动画帧合并成每帧最多通知一次
type PointerListener = (pos: { x: number; y: number } | null) => void;
const pointerListeners = new Set<PointerListener>();
let globalPointerAttached = false;
let lastPointerPos: { x: number; y: number } | null = null;
let pointerFrame: number | null = null;

function flushPointer() {
  pointerFrame = null;
  pointerListeners.forEach((cb) => cb(lastPointerPos));
}

function queuePointerFlush() {
  if (pointerFrame !== null) return;
  pointerFrame = requestAnimationFrame(flushPointer);
}

function subscribePointer(fn: PointerListener): () => void {
  pointerListeners.add(fn);
  if (!globalPointerAttached && typeof window !== "undefined") {
    globalPointerAttached = true;
    window.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        lastPointerPos = { x: e.clientX, y: e.clientY };
        queuePointerFlush();
      },
      { passive: true }
    );
    window.addEventListener(
      "pointerleave",
      () => {
        lastPointerPos = null;
        queuePointerFlush();
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
  // 眼睛跟随鼠标：直接改这一层的 transform，不经过 React 状态，鼠标移动不会触发重画
  const eyesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!trackPointer || image) return;
    let last = "";
    const apply = (x: number, y: number) => {
      const next = `translate(${x}px, ${y}px)`;
      if (next === last || !eyesRef.current) return;
      last = next;
      eyesRef.current.style.transform = next;
    };
    return subscribePointer((pos) => {
      const el = containerRef.current;
      if (!el || !pos) {
        apply(0, 0);
        return;
      }
      const rect = el.getBoundingClientRect();
      // 不在屏幕上（被滚走 / 折叠）就不用算
      if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) {
        apply(0, 0);
        return;
      }
      const factor = Math.min(1, dist / 240);
      const maxX = 6.2;
      const maxY = 4.6;
      apply(
        Number(((dx / dist) * maxX * factor).toFixed(1)),
        Number(((dy / dist) * maxY * factor).toFixed(1))
      );
    });
  }, [trackPointer, image]);

  if (image) {
    return (
      <div
        ref={containerRef}
        className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(image)}
          alt="avatar"
          loading="lazy"
          decoding="async"
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
  const bodyAnimClass = animated
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
      {isWorking && animated && (
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
          {/* 眼睛放在各形状自己的「脸」中心（默认眼睛中心是 32, 29.75） */}
          <g transform={`translate(${shapeDef.eye[0] - 32} ${shapeDef.eye[1] - 29.75})`}>
            <g
              ref={eyesRef}
              style={{
                transform: "translate(0px, 0px)",
                transition: "transform 90ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <g
                className={animated && !isWorking ? "animate-blob-blink" : ""}
                style={{ animationDelay: `${blinkDelayMs}ms` }}
              >
                <g className={isWorking ? "animate-eye-left" : ""}>
                  <rect
                    x="23.5"
                    y="24"
                    width="5.2"
                    height="11.5"
                    rx="2.6"
                    fill="#FFFFFF"
                  />
                </g>
                <g className={isWorking ? "animate-eye-right" : ""}>
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
