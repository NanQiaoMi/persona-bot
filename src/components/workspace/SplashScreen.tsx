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

const WORDMARK = "PersonaBot".split("");

// 「角色风车」：四位内置角色从四角出场，旋进中心，拼成围着主 bot 的风车标志。
// 顺序 = 左上、右上、右下、左下；ROT 是各自槽位绕中心的旋转角。
const CREW = (["lu-xi", "xia-you", "shen-zhi", "chen-ye"] as const).map((slug, i) => {
  const preset = BUILTIN_MASCOT_PRESETS[slug];
  return {
    slug,
    color: preset.color,
    path: MASCOT_SHAPES.find((s) => s.id === preset.shape)!.path,
    rot: i * 90,
    startDeg: -135 + i * 90,
  };
});

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
          {/* 出场：四个角色从四角弹出，再顺时针旋进中心 */}
          {CREW.map((c, i) => (
            <div
              key={c.slug}
              className="splash-fly"
              style={{ "--a0": `${c.startDeg}deg`, "--i": i } as CSSProperties}
            >
              <div className="splash-fly-arm">
                <div className="splash-fly-upright">
                  <svg viewBox="0 0 64 64" className="splash-fly-body">
                    <path d={c.path} fill={c.color} />
                    <rect x="23.5" y="24" width="5.2" height="11.5" rx="2.6" fill="#fff" />
                    <rect x="35.3" y="24" width="5.2" height="11.5" rx="2.6" fill="#fff" />
                  </svg>
                </div>
              </div>
            </div>
          ))}

          {/* 落定：风车标志（四个角色围着主 bot） */}
          <div className="splash-mark">
            <div className="splash-ripple" />
            <svg viewBox="0 0 120 120" className="splash-mark-svg">
              <g className="splash-spin">
                <g className="splash-orbit">
                  {CREW.map((c, i) => (
                    <g key={c.slug} transform={`rotate(${c.rot} 60 60)`}>
                      <g transform="translate(14 6) scale(0.72)">
                        <g className="splash-piece" style={{ "--i": i } as CSSProperties}>
                          <g className="splash-upright">
                            <path d={c.path} fill={c.color} transform={`rotate(${-c.rot} 32 32)`} />
                          </g>
                        </g>
                      </g>
                    </g>
                  ))}
                </g>
              </g>
              <g className="splash-hub">
                <circle cx="60" cy="60" r="18.5" fill="var(--bg-primary)" />
                <circle cx="60" cy="60" r="15" fill="var(--text-primary)" />
                <g className="splash-eyes">
                  <g className="splash-eyes-blink">
                    <g className="splash-eyes-look">
                      <rect x="52.3" y="55.6" width="4.4" height="8.8" rx="2.2" fill="var(--bg-primary)" />
                      <rect x="63.3" y="55.6" width="4.4" height="8.8" rx="2.2" fill="var(--bg-primary)" />
                    </g>
                  </g>
                </g>
              </g>
            </svg>
          </div>
        </div>

        <div className="splash-wordmark">
          {WORDMARK.map((ch, i) => (
            <span key={i} style={{ "--i": i, "--c": CREW[i % 4].color } as CSSProperties}>
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
