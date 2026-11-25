import { describe, expect, it } from 'vitest';
import { buildGroupSystemDirective } from '@/lib/group/director';
import { normalizeGroupBursts } from '@/lib/group/group-orchestrator';

describe('normalizeGroupBursts 去掉本人名字前缀', () => {
  it('单行带全角冒号前缀时去掉名字', () => {
    expect(
      normalizeGroupBursts(['苏念：？？？你是困到把洗衣机当咖啡机了吗'], '', '苏念')
    ).toEqual(['？？？你是困到把洗衣机当咖啡机了吗']);
  });

  it('半角冒号和前后空格也能认出来', () => {
    expect(normalizeGroupBursts(['  苏念 : 行吧'], '', '苏念')).toEqual(['行吧']);
  });

  it('带空格的全名和空格前的第一段名字都会去掉', () => {
    expect(normalizeGroupBursts(['陆凛 Zero：……'], '', '陆凛 Zero')).toEqual(['……']);
    expect(normalizeGroupBursts(['陆凛：收到'], '', '陆凛 Zero')).toEqual(['收到']);
    expect(normalizeGroupBursts(['陆凛Zero:嗯'], '', '陆凛 Zero')).toEqual(['嗯']);
  });

  it('一个气泡里多行都带本人前缀时拆成多个气泡，最多 2 个', () => {
    expect(
      normalizeGroupBursts(['苏念：第一句\n苏念：第二句\n苏念：第三句'], '', '苏念')
    ).toEqual(['第一句', '第二句']);
  });

  it('多行拆分时，不带前缀的续行跟着上一条', () => {
    expect(
      normalizeGroupBursts(['苏念：你看\n这个\n苏念：离谱吧'], '', '苏念')
    ).toEqual(['你看\n这个', '离谱吧']);
  });

  it('去掉前缀后为空的气泡直接丢掉', () => {
    expect(normalizeGroupBursts(['苏念：', '苏念： 真的假的'], '', '苏念')).toEqual(['真的假的']);
  });

  it('不误删别人的名字前缀和正文里的名字', () => {
    expect(normalizeGroupBursts(['艾拉：你说呢'], '', '苏念')).toEqual(['艾拉：你说呢']);
    expect(normalizeGroupBursts(['苏念觉得不行'], '', '苏念')).toEqual(['苏念觉得不行']);
  });

  it('没有 bursts 时从 content 按空行切分后再去前缀', () => {
    expect(normalizeGroupBursts(undefined, '苏念：哈\n\n苏念：好', '苏念')).toEqual(['哈', '好']);
  });
});

describe('buildGroupSystemDirective', () => {
  it('提醒回复时不要加自己的名字前缀', () => {
    const d = buildGroupSystemDirective({
      groupName: '测试群',
      speakerName: '苏念',
      otherMemberNames: ['艾拉'],
    });
    expect(d).toContain('不要加自己的名字前缀');
    expect(d).toContain('苏念：');
  });
});
