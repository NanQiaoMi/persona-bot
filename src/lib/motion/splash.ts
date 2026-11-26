/**
 * 启动动画（「角色风车」）的时机规则。
 * 全是纯函数，方便单测；组件只负责把结果接到定时器和 CSS 上。
 *
 * 规则（2026-11-26 用户要求）：每次刷新都完整播放；数据提前到了也要等整段动画播完再进入；
 * 应用内切换路由不重播（由 SplashScreen 的模块级标记控制）。
 */

export type SplashVariant = "full" | "reduced";

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

/**
 * 整段动画在基准节奏下的结束时刻（ms）：
 * 字标最后一个字浮现完 = 1300 + 9×28 + 500 = 2052，再留一小拍定格 → 2200。
 * 与 globals.css 的时间轴注释保持一致。
 */
export const SPLASH_SEQUENCE_BASE_MS = 2200;

export const SPLASH_TIMING = {
  /** 完整版：整段动画（四角出场 → 旋入 → 风车锁定 → 睁眼 → 字标）播完才退场 */
  fullMinMs: Math.round(SPLASH_SEQUENCE_BASE_MS * SPLASH_TEMPO),
  fullExitMs: 450,
  reducedExitMs: 150,
  skipExitMs: 220,
  /** 数据一直没到时强制退场 */
  timeoutMs: 8000,
  /** 超过这个时间换成「第一次启动会慢一点」 */
  slowHintMs: 5000,
} as const;

export const THEME_STORAGE_KEY = "personabot-theme";

export function getSplashVariant(input: { reducedMotion: boolean }): SplashVariant {
  return input.reducedMotion ? "reduced" : "full";
}

/**
 * 还要再等多少毫秒才开始退场。
 * - 数据没到：等到超时（数据比动画慢时，动画播完后进入等待态）
 * - 数据到了：完整版等整段动画播完；减少动态效果版立即退场
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
  return skipped ? SPLASH_TIMING.skipExitMs : SPLASH_TIMING.fullExitMs;
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
 * 放在 <head> 里同步执行：首帧就用对主题（不闪白），并标记启动阶段（工作台先处于待浮现状态）。
 * 任何异常都静默，退回默认的亮色。
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==="dark"||t==="light")d.setAttribute("data-theme",t);}catch(e){}d.setAttribute("data-splash-phase","playing");})();`;
