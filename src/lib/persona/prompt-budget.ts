/**
 * Prompt 分层预算：人设越写越长、记忆越积越多时，按优先级裁剪，避免把真正重要的约束挤出上下文。
 * 优先级：Layer 0 核心协议 + 纠偏 + 习得规则（全量保留）> 其余 Layer（按比例截断）> 人物画像（最先截断）
 */
export const PERSONA_CORE_BUDGET = 6000;
export const AI_PROFILE_BUDGET = 1800;

const MUST_KEEP = /^(?:#{1,2})\s*(?:Layer\s*0|Correction|6\.|7\.)/i;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 20) return '';
  return `${text.slice(0, max - 6).trimEnd()}…（略）`;
}

export function fitPersonaToBudget(personaMd: string, budget = PERSONA_CORE_BUDGET): string {
  const md = personaMd || '';
  if (md.length <= budget) return md;

  const sections = md.split(/\n(?=#{1,2}\s)/);
  const mustIdx = new Set<number>();
  sections.forEach((sec, i) => {
    if (MUST_KEEP.test(sec.trimStart())) mustIdx.add(i);
  });
  // 文档开头（标题/简介）也保留
  if (sections.length > 0 && !/^#{1,2}\s/.test(sections[0].trimStart())) mustIdx.add(0);

  const mustLen = sections.reduce((n, s, i) => (mustIdx.has(i) ? n + s.length + 1 : n), 0);
  const flexible = sections.filter((_, i) => !mustIdx.has(i));
  const flexLen = flexible.reduce((n, s) => n + s.length + 1, 0);
  const remaining = Math.max(0, budget - mustLen);
  const ratio = flexLen > 0 ? Math.min(1, remaining / flexLen) : 1;

  return sections
    .map((sec, i) => {
      if (mustIdx.has(i)) return sec;
      const [heading, ...rest] = sec.split('\n');
      const body = rest.join('\n');
      const keep = Math.floor(sec.length * ratio) - heading.length;
      return keep > 20 ? `${heading}\n${truncate(body, keep)}` : heading;
    })
    .join('\n');
}

export function fitProfileToBudget(profile: string, budget = AI_PROFILE_BUDGET): string {
  return truncate(profile || '', budget);
}
