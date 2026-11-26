/**
 * 启动动画（「小团子醒来」）的时机规则。
 * 全是纯函数，方便单测；组件只负责把结果接到定时器和 CSS 上。
 */

export type SplashVariant = "full" | "short" | "reduced";

export interface SplashSteps {
  personas: boolean;
  groups: boolean;
  detail: boolean;
}

/**
 * 节奏倍数：完整版所有关键帧的时长和延迟都乘以它。
 * 必须与 globals.css 里 .splash-root 的 --splash-tempo 一致（tests/splash.test.ts 会校验）。
 */
export const SPLASH_TEMPO = 1.5;

export const SPLASH_TIMING = {
  /** 完整版至少播到风车锁定、主 bot 睁眼眨眼、字标浮现（基准 1800ms × 节奏倍数） */
  fullMinMs: Math.round(1800 * SPLASH_TEMPO),
  fullExitMs: 450,
  shortExitMs: 220,
  reducedExitMs: 150,
  skipExitMs: 220,
  /** 数据一直没到时强制退场 */
  timeoutMs: 8000,
  /** 超过这个时间换成「第一次启动会慢一点」 */
  slowHintMs: 3000,
} as const;

export const SPLASH_SEEN_KEY = "personabot-splash-seen";
export const THEME_STORAGE_KEY = "personabot-theme";

export function getSplashVariant(input: {
  seenThisSession: boolean;
  reducedMotion: boolean;
}): SplashVariant {
  if (input.reducedMotion) return "reduced";
  return input.seenThisSession ? "short" : "full";
}

/**
 * 还要再等多少毫秒才开始退场。
 * - 数据没到：等到超时
 * - 数据到了：完整版补足最短时长，其它版本立即退场
 */
export function getExitDelay(input: {
  variant: SplashVariant;
  elapsedMs: number;
  ready: boolean;
}): number {
  const { variant, elapsedMs, ready } = input;
  if (!ready) return Math.max(0, SPLASH_TIMING.timeoutMs - elapsedMs);
  if (variant === "full") return Math.max(0, SPLASH_TIMING.fullMinMs - elapsedMs);
  return 0;
}

export function getExitDuration(variant: SplashVariant, skipped = false): number {
  if (variant === "reduced") return SPLASH_TIMING.reducedExitMs;
  if (skipped) return SPLASH_TIMING.skipExitMs;
  return variant === "full" ? SPLASH_TIMING.fullExitMs : SPLASH_TIMING.shortExitMs;
}

export function countDoneSteps(steps: SplashSteps): number {
  return Number(steps.personas) + Number(steps.groups) + Number(steps.detail);
}

export function getSplashStatusText(steps: SplashSteps, slow: boolean): string {
  if (slow && !steps.detail) return "第一次启动会慢一点，马上就好";
  if (steps.personas && steps.groups) return "快好了…";
  if (steps.personas || steps.groups) return "正在翻开聊天记录…";
  return "正在唤醒 TA 们…";
}

/**
 * 放在 <head> 里同步执行：首帧就用对主题（不闪白），并决定启动动画版本。
 * 任何异常都静默，退回默认的亮色 + 完整版。
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==="dark"||t==="light")d.setAttribute("data-theme",t);}catch(e){}try{d.setAttribute("data-splash",sessionStorage.getItem(${JSON.stringify(
  SPLASH_SEEN_KEY
)})?"short":"full");}catch(e){d.setAttribute("data-splash","full");}d.setAttribute("data-splash-phase","playing");})();`;
