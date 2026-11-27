import { describe, expect, it } from 'vitest';
import { tidyPersonaTake } from '@/components/workspace/PageArtifactCard';

describe('tidyPersonaTake', () => {
  it('removes markdown bold and heading markers', () => {
    expect(tidyPersonaTake('## 小结\n\n今天**最值得**聊的是芯片')).toBe('小结\n\n今天最值得聊的是芯片');
  });

  it('drops a paragraph that is only the start of the next one (streaming repeat)', () => {
    const raw = '我刚刚重新翻了今天的科技新闻，发现 11 月 27 日\n\n我刚刚重新翻了今天的科技新闻，发现 11 月 27 日有几条挺值得聊的\n\n先说芯片';
    expect(tidyPersonaTake(raw)).toBe('我刚刚重新翻了今天的科技新闻，发现 11 月 27 日有几条挺值得聊的\n\n先说芯片');
  });

  it('drops exact consecutive duplicates but keeps distinct paragraphs', () => {
    expect(tidyPersonaTake('甲\n\n甲\n\n乙')).toBe('甲\n\n乙');
    expect(tidyPersonaTake('')).toBe('');
  });
});
