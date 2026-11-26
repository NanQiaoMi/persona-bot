/**
 * 从「一句话性格」里拆出几个短标签：
 * 「嘴硬爱撒娇的深夜搭子」→ ['嘴硬爱撒娇', '深夜搭子']
 * 以前按 2–6 个字硬切，整句常被切成意义不明的碎片。
 */
const SPLIT_REGEX = /[、，,。.；;：:！!？?\/|·\s]+|的|和|又|但|而且|还/;
const STOP_WORDS = new Set(['一个', '有点', '那种', '就是', '比较', '非常', '特别']);

export function extractPersonalityTags(text: string | undefined, max = 6): string[] {
  const raw = (text || '').trim();
  if (!raw) return [];
  const tags: string[] = [];
  for (const piece of raw.split(SPLIT_REGEX)) {
    const t = (piece || '').trim().replace(/^(很|超|挺|是|个)/, '');
    if (t.length < 2 || STOP_WORDS.has(t)) continue;
    // 太长的片段只保留前 6 个字，避免标签像一句话
    const tag = t.length > 6 ? t.slice(0, 6) : t;
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length >= max) break;
  }
  return tags;
}

/** 名字转 slug；已被占用时依次加 -2、-3…，新建角色不会覆盖同名的老角色 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now()}`;
}
