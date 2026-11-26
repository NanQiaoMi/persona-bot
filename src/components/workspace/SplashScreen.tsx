"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  countDoneSteps,
  getExitDelay,
  getExitDuration,
  getSplashStatusText,
  getSplashVariant,
  SPLASH_SEEN_KEY,
  SPLASH_TIMING,
  type SplashSteps,
  type SplashVariant,
} from "@/lib/motion/splash";
import { BUILTIN_MASCOT_PRESETS, MASCOT_SHAPES } from "./mascot-palette";

const BODY_PATH = MASCOT_SHAPES.find((s) => s.id === "circle")!.path;
const WORDMARK = "PersonaBot".split("");

// 4 位内置角色的颜色从四个方向飞进团子
const DOT_SLUGS = ["lu-xi", "xia-you", "shen-zhi", "chen-ye"] as const;
const DOT_OFFSETS = [
  { x: -64, y: -36 },
  { x: 62, y: -44 },
  { x: 58, y: 40 },
  { x: -60, y: 46 },
];
const DOTS = DOT_SLUGS.map((slug, i) => ({
  color: BUILTIN_MASCOT_PRESETS[slug].color,
  ...DOT_OFFSETS[i],
  delay: 600 + i * 60,
}));

export type SplashPhase = "playing" | "exiting" | "done";

// 整个页面生命周期只播一次：客户端路由切换（如 / → /chat/x）不会再出现
let playedThisPageLoad = false;

export function hasSplashPlayed(): boolean {
  return playedThisPageLoad;
}

interface SplashScreenProps {
  ready: boolean;
  steps: SplashSteps;
  onPhaseChange: (phase: SplashPhase) => void;
}

function readVariant(reducedMotion: boolean): SplashVariant {
  const attr =
    typeof document !== "undefined" ? document.documentElement.getAttribute("data-splash") : null;
  return getSplashVariant({ seenThisSession: attr === "short", reducedMotion });
}

export default function SplashScreen({ ready, steps, onPhaseChange }: SplashScreenProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<SplashPhase>("playing");
  const [exitMs, setExitMs] = useState<number>(SPLASH_TIMING.fullExitMs);
  const [slow, setSlow] = useState(false);
  const phaseRef = useRef<SplashPhase>("playing");
  const onPhaseChangeRef = useRef(onPhaseChange);

  useEffect(() => {
    onPhaseChangeRef.current = onPhaseChange;
  }, [onPhaseChange]);

  const startExit = useCallback(
    (skipped: boolean) => {
      if (phaseRef.current !== "playing") return;
      const duration = getExitDuration(readVariant(reducedMotion), skipped);
      phaseRef.current = "exiting";
      playedThisPageLoad = true;
      try {
        window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
      } catch {
        // 隐私模式等存储不可用时忽略，下次仍放完整版
      }
      setExitMs(duration);
      setPhase("exiting");
      onPhaseChangeRef.current("exiting");
      window.setTimeout(() => {
        phaseRef.current = "done";
        setPhase("done");
        onPhaseChangeRef.current("done");
        if (typeof performance !== "undefined" && performance.mark) {
          performance.mark("splash:exit-end");
        }
      }, duration + 40);
    },
    [reducedMotion]
  );

  // 数据就绪（或超时）后按规则安排退场
  useEffect(() => {
    if (phaseRef.current !== "playing") return;
    const delay = getExitDelay({
      variant: readVariant(reducedMotion),
      elapsedMs: performance.now(),
      ready,
    });
    const timer = window.setTimeout(() => startExit(false), delay);
    return () => window.clearTimeout(timer);
  }, [ready, reducedMotion, startExit]);

  useEffect(() => {
    const remaining = SPLASH_TIMING.slowHintMs - performance.now();
    const timer = window.setTimeout(() => setSlow(true), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, []);

  // 任意键跳过
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = () => startExit(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startExit]);

  if (phase === "done") return null;

  const done = countDoneSteps(steps);
  const stepFlags = [steps.personas, steps.groups, steps.detail];

  return (
    <div
      className="splash-root"
      data-state={phase}
      style={{ "--splash-exit": `${exitMs}ms` } as CSSProperties}
      role="status"
      aria-live="polite"
      onPointerDown={() => startExit(true)}
    >
      <span className="sr-only">
        PersonaBot 正在加载：{getSplashStatusText(steps, slow)}（{done}/3）
      </span>
      <div className="splash-glow" aria-hidden="true" />

      <div className="splash-stage" aria-hidden="true">
        <div className="splash-mascot">
          {DOTS.map((dot) => (
            <span
              key={dot.color}
              className="splash-dot"
              style={
                {
                  "--dot-color": dot.color,
                  "--dot-x": `${dot.x}px`,
                  "--dot-y": `${dot.y}px`,
                  animationDelay: `${dot.delay}ms`,
                } as CSSProperties
              }
            />
          ))}
          <svg viewBox="0 0 64 64" className="splash-blob">
            <g className="splash-blob-drop">
              <g className="splash-blob-body">
                <path d={BODY_PATH} fill="var(--text-primary)" />
                <g className="splash-eyes">
                  <g className="splash-eyes-blink">
                    <g className="splash-eyes-look">
                      <rect x="23.5" y="24" width="5.2" height="11.5" rx="2.6" fill="var(--bg-primary)" />
                      <rect x="35.3" y="24" width="5.2" height="11.5" rx="2.6" fill="var(--bg-primary)" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </div>

        <div className="splash-wordmark">
          {WORDMARK.map((ch, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties}>
              {ch}
            </span>
          ))}
        </div>

        <div className="splash-status">
          <span className="splash-steps">
            {stepFlags.map((on, i) => (
              <span key={i} className="splash-step" data-on={on ? "true" : "false"} />
            ))}
          </span>
          <span className="animate-text-shimmer">{getSplashStatusText(steps, slow)}</span>
        </div>
      </div>
    </div>
  );
}
