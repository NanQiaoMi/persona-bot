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
// 顺序 = 左上、右上、右下、左下。
// 性能：所有会动的都是 HTML 包裹层（只动 transform / opacity，走合成线程），
// 里面的 SVG 一律静止，避免 Chrome 每帧在主线程重绘 SVG。
const PIECE_SIZE = 57.6; // 每个角色在风车里的尺寸（px）
// 风车槽位中心（px，相对 150×150 的标志框）：左上、右上、右下、左下
const SLOT_CENTERS: Array<[number, number]> = [
  [46.3, 36.3],
  [113.7, 46.3],
  [103.7, 113.7],
  [36.3, 103.7],
];

const CREW = (["lu-xi", "xia-you", "shen-zhi", "chen-ye"] as const).map((slug, i) => {
  const preset = BUILTIN_MASCOT_PRESETS[slug];
  return {
    slug,
    color: preset.color,
    path: MASCOT_SHAPES.find((s) => s.id === preset.shape)!.path,
    startDeg: -135 + i * 90,
    slot: SLOT_CENTERS[i],
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
}

function readVariant(reducedMotion: boolean): SplashVariant {
  const attr =
    typeof document !== "undefined" ? document.documentElement.getAttribute("data-splash") : null;
  return getSplashVariant({ seenThisSession: attr === "short", reducedMotion });
}

/**
 * 工作台的浮现由 <html data-splash-phase> + CSS 驱动，不经过 React 状态，
 * 这样启动画面退场时不会让整个工作台重新渲染一遍（那会和退场动画抢主线程）。
 */
function setHtmlPhase(phase: SplashPhase, exitMs?: number) {
  const el = document.documentElement;
  if (exitMs !== undefined) el.style.setProperty("--splash-exit", `${exitMs}ms`);
  if (phase === "done") {
    el.removeAttribute("data-splash-phase");
    el.style.removeProperty("--splash-exit");
  } else {
    el.setAttribute("data-splash-phase", phase);
  }
}

function CharacterSvg({ path, color, eyes }: { path: string; color: string; eyes?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="splash-char-svg">
      <path d={path} fill={color} />
      {eyes && (
        <>
          <rect x="23.5" y="24" width="5.2" height="11.5" rx="2.6" fill="#fff" />
          <rect x="35.3" y="24" width="5.2" height="11.5" rx="2.6" fill="#fff" />
        </>
      )}
    </svg>
  );
}

export default function SplashScreen({ ready, steps }: SplashScreenProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<SplashPhase>("playing");
  const [exitMs, setExitMs] = useState<number>(SPLASH_TIMING.fullExitMs);
  const [slow, setSlow] = useState(false);
  const phaseRef = useRef<SplashPhase>("playing");

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
      setHtmlPhase("exiting", duration);
      setExitMs(duration);
      setPhase("exiting");
      window.setTimeout(() => {
        phaseRef.current = "done";
        setHtmlPhase("done");
        setPhase("done");
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
              style={{ transform: `rotate(${c.startDeg}deg)`, "--i": i } as CSSProperties}
            >
              <div className="splash-fly-spin">
                <div className="splash-fly-arm">
                  <div
                    className="splash-fly-upright"
                    style={{ transform: `rotate(${-c.startDeg}deg)` }}
                  >
                    <div className="splash-fly-pop">
                      <CharacterSvg path={c.path} color={c.color} eyes />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 落定：风车标志（四个角色围着主 bot） */}
          <div className="splash-mark">
            <div className="splash-ripple" />
            <div className="splash-spin">
              <div className="splash-orbit">
                {CREW.map((c, i) => (
                  <div
                    key={c.slug}
                    className="splash-slot"
                    style={{
                      left: c.slot[0] - PIECE_SIZE / 2,
                      top: c.slot[1] - PIECE_SIZE / 2,
                      width: PIECE_SIZE,
                      height: PIECE_SIZE,
                    }}
                  >
                    <div className="splash-piece" style={{ "--i": i } as CSSProperties}>
                      <div className="splash-upright">
                        <CharacterSvg path={c.path} color={c.color} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="splash-hub">
              <div className="splash-eyes">
                <div className="splash-eyes-blink">
                  <div className="splash-eyes-look">
                    <span className="splash-eye" />
                    <span className="splash-eye" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="splash-wordmark">
          {WORDMARK.map((ch, i) => (
            <span
              key={i}
              data-ch={ch}
              style={{ "--i": i, "--c": CREW[i % 4].color } as CSSProperties}
            >
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
          <span className="splash-status-text">{getSplashStatusText(steps, slow)}</span>
        </div>
      </div>
    </div>
  );
}

