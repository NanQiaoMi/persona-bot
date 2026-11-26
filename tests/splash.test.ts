import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  BOOT_SCRIPT,
  countDoneSteps,
  getExitDelay,
  getExitDuration,
  getSplashStatusText,
  getSplashVariant,
  SPLASH_SEQUENCE_BASE_MS,
  SPLASH_TEMPO,
  SPLASH_TIMING,
} from '@/lib/motion/splash';

describe('启动动画版本', () => {
  it('默认完整版；开启减少动态效果时用静态版', () => {
    expect(getSplashVariant({ reducedMotion: false })).toBe('full');
    expect(getSplashVariant({ reducedMotion: true })).toBe('reduced');
  });
});

describe('退场时机', () => {
  it('数据早到也要等整段动画播完（基准 2200ms × 节奏倍数）', () => {
    expect(SPLASH_TIMING.fullMinMs).toBe(3300);
    expect(getExitDelay({ variant: 'full', elapsedMs: 300, ready: true })).toBe(3000);
    expect(getExitDelay({ variant: 'full', elapsedMs: 3299, ready: true })).toBe(1);
  });

  it('整段时长覆盖字标最后一个字浮现完', () => {
    // 字标：基准延迟 1300ms + 第 10 个字 9×28ms + 时长 500ms
    expect(SPLASH_SEQUENCE_BASE_MS).toBeGreaterThanOrEqual(1300 + 9 * 28 + 500);
  });

  it('CSS 里的节奏倍数与 TS 常量一致', () => {
    const css = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');
    const m = css.match(/--splash-tempo:\s*([\d.]+)/);
    expect(m && Number(m[1])).toBe(SPLASH_TEMPO);
  });

  it('动画播完后数据才到：数据一到就退场', () => {
    expect(getExitDelay({ variant: 'full', elapsedMs: 4000, ready: true })).toBe(0);
  });

  it('减少动态效果版数据到了立即退场', () => {
    expect(getExitDelay({ variant: 'reduced', elapsedMs: 50, ready: true })).toBe(0);
  });

  it('数据一直没到时 8 秒强制退场', () => {
    expect(getExitDelay({ variant: 'full', elapsedMs: 2000, ready: false })).toBe(
      SPLASH_TIMING.timeoutMs - 2000
    );
    expect(getExitDelay({ variant: 'full', elapsedMs: 9000, ready: false })).toBe(0);
  });

  it('退场时长按版本区分，跳过时更快', () => {
    expect(getExitDuration('full')).toBe(450);
    expect(getExitDuration('reduced')).toBe(150);
    expect(getExitDuration('full', true)).toBe(220);
    expect(getExitDuration('reduced', true)).toBe(150);
  });
});

describe('状态文案与真实进度', () => {
  const none = { personas: false, groups: false, detail: false };

  it('随加载步骤变化', () => {
    expect(getSplashStatusText(none, false)).toBe('正在唤醒 TA 们…');
    expect(getSplashStatusText({ ...none, personas: true }, false)).toBe('正在翻开聊天记录…');
    expect(getSplashStatusText({ ...none, personas: true, groups: true }, false)).toBe('快好了…');
  });

  it('超过 3 秒还没好时换成安抚文案', () => {
    expect(getSplashStatusText(none, true)).toBe('第一次启动会慢一点，马上就好');
    expect(getSplashStatusText({ personas: true, groups: true, detail: true }, true)).toBe('快好了…');
  });

  it('统计完成步骤数', () => {
    expect(countDoneSteps(none)).toBe(0);
    expect(countDoneSteps({ personas: true, groups: false, detail: true })).toBe(2);
  });
});

describe('<head> 启动脚本', () => {
  function run(storage: { theme?: string | null; seen?: string | null; throwSession?: boolean }) {
    const attrs: Record<string, string> = {};
    const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const localStorage = { getItem: () => storage.theme ?? null };
    const sessionStorage = {
      getItem: () => {
        if (storage.throwSession) throw new Error('blocked');
        return storage.seen ?? null;
      },
    };
    new Function('document', 'localStorage', 'sessionStorage', BOOT_SCRIPT)(
      document,
      localStorage,
      sessionStorage
    );
    return attrs;
  }

  it('首帧应用已保存的暗色主题', () => {
    expect(run({ theme: 'dark' })['data-theme']).toBe('dark');
  });

  it('首帧就标记启动阶段，让工作台在启动画面下方先处于待浮现状态', () => {
    expect(run({})['data-splash-phase']).toBe('playing');
    expect(run({ throwSession: true })['data-splash-phase']).toBe('playing');
  });

  it('忽略非法主题值', () => {
    expect(run({ theme: 'purple' })['data-theme']).toBeUndefined();
  });

  it('不再读写会话记录：每次刷新都完整重播', () => {
    const attrs = run({ seen: '1' });
    expect(attrs['data-splash']).toBeUndefined();
    expect(attrs['data-splash-phase']).toBe('playing');
    expect(BOOT_SCRIPT).not.toContain('sessionStorage');
  });
});

describe('什么时候挂载启动画面', () => {
  it('整页加载（服务端 HTML 带着启动画面）时播放；应用内切换路由过来时不播', async () => {
    const { shouldShowSplash } = await import('@/components/workspace/SplashScreen');
    const g = globalThis as { document?: unknown };
    const original = g.document;
    try {
      g.document = { querySelector: (sel: string) => (sel === '.splash-root' ? {} : null) };
      expect(shouldShowSplash()).toBe(true);
      g.document = { querySelector: () => null };
      expect(shouldShowSplash()).toBe(false);
      delete g.document;
      expect(shouldShowSplash()).toBe(true); // 服务端渲染时输出启动画面
    } finally {
      g.document = original;
    }
  });
});
