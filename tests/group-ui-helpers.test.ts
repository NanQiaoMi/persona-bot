import { describe, expect, it } from 'vitest';
import { splitMentions } from '@/components/workspace/GroupMessageRow';

describe('splitMentions', () => {
  it('returns a single plain segment for text without mentions', () => {
    expect(splitMentions('你好呀', ['夏柚'])).toEqual([{ text: '你好呀', mention: false }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitMentions('', ['夏柚'])).toEqual([]);
  });

  it('splits a known mention from the following plain text', () => {
    expect(splitMentions('@夏柚 你来', ['夏柚', '鹿汐'])).toEqual([
      { text: '@夏柚', mention: true },
      { text: ' 你来', mention: false },
    ]);
  });

  it('always treats @群主 as a mention, even when not in names', () => {
    expect(splitMentions('@群主 在吗', [])).toEqual([
      { text: '@群主', mention: true },
      { text: ' 在吗', mention: false },
    ]);
  });

  it('leaves unknown @names as plain text', () => {
    expect(splitMentions('@张三 你好', ['夏柚'])).toEqual([
      { text: '@张三 你好', mention: false },
    ]);
  });

  it('prefers the longest matching name', () => {
    expect(splitMentions('@陈野 出来', ['陈', '陈野'])).toEqual([
      { text: '@陈野', mention: true },
      { text: ' 出来', mention: false },
    ]);
  });

  it('matches names case-insensitively', () => {
    expect(splitMentions('@alice hi', ['Alice'])).toEqual([
      { text: '@alice', mention: true },
      { text: ' hi', mention: false },
    ]);
  });

  it('handles multiple mentions in one text', () => {
    expect(splitMentions('@夏柚 和 @鹿汐 都来', ['夏柚', '鹿汐'])).toEqual([
      { text: '@夏柚', mention: true },
      { text: ' 和 ', mention: false },
      { text: '@鹿汐', mention: true },
      { text: ' 都来', mention: false },
    ]);
  });

  it('does not treat an email-like address as a mention unless the part matches a name', () => {
    expect(splitMentions('mail a@b.com', ['夏柚'])).toEqual([
      { text: 'mail a@b.com', mention: false },
    ]);
    expect(splitMentions('mail a@b.com', ['b'])).toEqual([
      { text: 'mail a', mention: false },
      { text: '@b', mention: true },
      { text: '.com', mention: false },
    ]);
  });
});
