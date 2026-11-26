import { describe, expect, it } from 'vitest';
import {
  BOOT_SCRIPT,
  countDoneSteps,
  getExitDelay,
  getExitDuration,
  getSplashStatusText,
  getSplashVariant,
  SPLASH_TIMING,
} from '@/lib/motion/splash';

describe('启动动画版本', () => {
  it('会话内第一次是完整版，之后是简短版', () => {
    expect(getSplashVariant({ seenThisSession: false, reducedMotion: false })).toBe('full');
    expect(getSplashVariant({ seenThisSession: true, reducedMotion: false })).toBe('short');
  });

  it('开启减少动态效果时一律用静态版', () => {
    expect(getSplashVariant({ seenThisSession: false, reducedMotion: true })).toBe('reduced');
    expect(getSplashVariant({ seenThisSession: true, reducedMotion: true })).toBe('reduced');
  });
});

describe('退场时机', () => {
  it('完整版数据早到时补足 900ms', () => {
    expect(getExitDelay({ variant: 'full', elapsedMs: 300, ready: true })).toBe(600);
  });

  it('数据晚到时立刻退场，不额外拖延', () => {
    expect(getExitDelay({ variant: 'full', elapsedMs: 1500, ready: true })).toBe(0);
    expect(getExitDelay({ variant: 'short', elapsedMs: 50, ready: true })).toBe(0);
    expect(getExitDelay({ variant: 'reduced', elapsedMs: 50, ready: true })).toBe(0);
  });

  it('数据一直没到时 8 秒强制退场', () => {
    expect(getExitDelay({ variant: 'full', elapsedMs: 2000, ready: false })).toBe(
      SPLASH_TIMING.timeoutMs - 2000
    );
    expect(getExitDelay({ variant: 'short', elapsedMs: 9000, ready: false })).toBe(0);
  });

  it('退场时长按版本区分，跳过时更快', () => {
    expect(getExitDuration('full')).toBe(360);
    expect(getExitDuration('short')).toBe(220);
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

  it('忽略非法主题值', () => {
    expect(run({ theme: 'purple' })['data-theme']).toBeUndefined();
  });

  it('按会话记录决定版本，存储不可用时退回完整版', () => {
    expect(run({})['data-splash']).toBe('full');
    expect(run({ seen: '1' })['data-splash']).toBe('short');
    expect(run({ throwSession: true })['data-splash']).toBe('full');
  });
});
