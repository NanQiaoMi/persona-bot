import { describe, expect, it } from 'vitest';
import {
  parseStructuredModelOutput,
  splitLiveBursts,
  stripMarkupTags,
} from '@/lib/grok/stream-orchestrator';

describe('模型夹带的界面标记不再原样显示', () => {
  const raw = '<text color="secondary" size="xs">困困但认真营业</text>啧，又来验收啦';

  it('开头的状态行当作心情，正文里不再出现标签', () => {
    const r = parseStructuredModelOutput(raw);
    expect(r.mood).toBe('困困但认真营业');
    expect(r.bursts).toEqual(['啧，又来验收啦']);
    expect(r.cleanReply).not.toContain('<');
  });

  it('已有 [MOOD] 时保留原心情，状态行直接去掉', () => {
    const r = parseStructuredModelOutput(`[MOOD: 毒舌在线]${raw}[BURST]我可没说不陪你`);
    expect(r.mood).toBe('毒舌在线');
    expect(r.bursts).toEqual(['啧，又来验收啦', '我可没说不陪你']);
  });

  it('其他位置的标签只去标签、保留文字；<thought> 不受影响', () => {
    expect(splitLiveBursts('今天<b>真的</b>好累<br/>想睡觉')).toEqual(['今天真的好累想睡觉']);
    const r = parseStructuredModelOutput('<thought>他又来了</thought>嗯<span style="x">哼</span>');
    expect(r.thought).toBe('他又来了');
    expect(r.bursts).toEqual(['嗯哼']);
  });

  it('流式输出到一半时不闪出标签或状态文字', () => {
    expect(splitLiveBursts('<text color="secondary" size="xs">困困但')).toEqual([]);
    expect(splitLiveBursts('<text color="secondary" size="xs">困困但认真营业</te')).toEqual([]);
    expect(splitLiveBursts('<text color="seco')).toEqual([]);
    expect(splitLiveBursts(`${raw}，这次`)).toEqual(['啧，又来验收啦，这次']);
    expect(splitLiveBursts('好呀<sp')).toEqual(['好呀']);
  });

  it('普通的小于号、颜文字不误删', () => {
    expect(stripMarkupTags('爱你<3')).toBe('爱你<3');
    expect(stripMarkupTags('1<2 所以呢')).toBe('1<2 所以呢');
    expect(stripMarkupTags('(>_<) 好吧')).toBe('(>_<) 好吧');
  });
});
