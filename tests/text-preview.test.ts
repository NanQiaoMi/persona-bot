import { describe, expect, it } from 'vitest';
import { toPlainPreview } from '@/lib/text/preview';

describe('toPlainPreview', () => {
  it('strips markdown, thought, media/burst tags and relay prefixes', () => {
    expect(toPlainPreview('<thought>想想</thought>**艾拉 Ella** 说[BURST]好的 [PHOTO: 自拍]')).toBe('艾拉 Ella 说 好的');
    expect(toPlainPreview('[来自主控 Bot「猫咪的bot」的任务分派] 请调研 AI')).toBe('请调研 AI');
    expect(toPlainPreview('- 第一条\n- `code` 第二条')).toBe('第一条 code 第二条');
    expect(toPlainPreview('看 [链接](https://x.y) 和 ![图](a.png)')).toBe('看 链接 和 [图片]');
  });

  it('truncates long text with an ellipsis and handles empty input', () => {
    expect(toPlainPreview('一'.repeat(100), 10)).toBe(`${'一'.repeat(9)}…`);
    expect(toPlainPreview(undefined)).toBe('');
  });
});
