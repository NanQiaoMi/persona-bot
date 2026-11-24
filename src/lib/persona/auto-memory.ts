import { addMemoryWithRetention } from '@/lib/persona/memory-lifecycle';
import { ensurePersonaSpec } from '@/lib/persona/spec';
import { storageRepo } from '@/lib/storage/repository';

const AUTO_MEMORY_HEADING = '## 4. 对话自动沉淀的长期记忆';

/**
 * 从用户单轮发言中精准识别值得跨天记住的长期信息（偏好、近期日程、个人状态等），过滤闲聊噪声
 */
export function extractMemorableFactFromTurn(
  userText: string,
  assistantReply = ''
): string | null {
  const clean = userText.replace(/\s+/g, ' ').trim();
  if (clean.length < 6 || clean.length > 220) return null;

  // Ignore pure requests directed at generating photos/stickers unless carrying personal preferences
  if (/^(?:发张|来张|给我发|画一张|看看你).{0,16}$/.test(clean)) {
    return null;
  }

  void assistantReply;

  const prefMatch = clean.match(
    /(?:^|[，,。.!?\s])((?:我|平时|最近|其实|一直|特别|很){0,3}(?:最?喜欢|爱吃|爱喝|超爱|最?爱|最讨厌|讨厌|不吃|不喝|对[^，。]{1,8}过敏|习惯|偏好|在追|想买)[^，。！？\n]{2,36})/
  );
  if (prefMatch?.[1]) {
    const val = prefMatch[1].trim().replace(/^[，,\s]+/, '');
    if (val.length >= 4 && !/发张|照片|表情包|靴子/.test(val)) {
      return `偏好习惯：${val}`;
    }
  }

  const planMatch = clean.match(
    /(?:^|[，,。.!?\s我])((?:明天|后天|大后天|下周[一二三四五六日天]?|这周末|周末|今晚|今早|待会|过几天|下个月|月底)(?:要|得|去|有|打算|准备|安排了)[^，。！？\n]{2,36})/
  );
  if (planMatch?.[1]) {
    const val = planMatch[1].trim().replace(/^[，,\s]+/, '');
    if (val.length >= 5) {
      return `近期日程：${val}`;
    }
  }

  const identityMatch = clean.match(
    /(?:^|[，,。.!?\s])((?:我叫|我的名字是|我养了|我住在|我在[^，。]{1,12}工作|我刚换了|我最近在准备|我感冒了|我发烧了|我刚考完)[^，。！？\n]{1,36})/
  );
  if (identityMatch?.[1]) {
    const val = identityMatch[1].trim().replace(/^[，,\s]+/, '');
    if (val.length >= 4) {
      return `个人近况：${val}`;
    }
  }

  return null;
}

/**
 * 将提取出的长期记忆增量合并写入 memories.md（去重、限容最新 30 条）
 */
export function mergeMemoryIntoMarkdown(
  memoriesMd: string,
  fact: string,
  dateLabel = new Date().toLocaleDateString('zh-CN')
): { updated: boolean; memoriesMd: string } {
  const normalizedFact = fact.trim();
  if (!normalizedFact) return { updated: false, memoriesMd };

  const coreSnippet = normalizedFact.replace(/^[^：:]+[：:]\s*/, '').trim();
  if (
    memoriesMd.includes(normalizedFact) ||
    (coreSnippet.length >= 4 && memoriesMd.includes(coreSnippet))
  ) {
    return { updated: false, memoriesMd };
  }

  const entryLine = `- [${dateLabel}] ${normalizedFact}`;
  const existing = (memoriesMd || '').trimEnd();

  if (!existing.includes(AUTO_MEMORY_HEADING)) {
    const next = existing
      ? `${existing}\n\n${AUTO_MEMORY_HEADING}\n${entryLine}\n`
      : `# 共同记忆\n\n${AUTO_MEMORY_HEADING}\n${entryLine}\n`;
    return { updated: true, memoriesMd: next };
  }

  const idx = existing.indexOf(AUTO_MEMORY_HEADING);
  const before = existing.slice(0, idx + AUTO_MEMORY_HEADING.length);
  const after = existing.slice(idx + AUTO_MEMORY_HEADING.length);

  // Stop before next top-level heading if any exists after AUTO_MEMORY_HEADING
  const nextHeadingMatch = after.match(/\n##\s+/);
  const sectionBody = nextHeadingMatch
    ? after.slice(0, nextHeadingMatch.index)
    : after;
  const rest = nextHeadingMatch ? after.slice(nextHeadingMatch.index) : '';

  const lines = sectionBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const capped = [...lines, entryLine].slice(-30);

  const rebuilt = `${before}\n${capped.join('\n')}\n${rest}`.trimEnd() + '\n';
  return { updated: true, memoriesMd: rebuilt };
}

/**
 * 在每轮对话结束后后台静默判断并持久化值得长期记住的用户事实
 */
export async function autoPersistTurnMemory(
  slug: string,
  userText: string,
  assistantReply: string
): Promise<boolean> {
  const fact = extractMemorableFactFromTurn(userText, assistantReply);
  if (!fact) return false;

  let updated = false;
  await storageRepo.updatePersona(slug, (persona) => {
    const spec = ensurePersonaSpec(persona.personaMd, persona.spec);
    // 按重要度 + 新近度 + 被想起次数淘汰，近义记忆合并为最新表述
    const merged = addMemoryWithRetention(persona.memoriesMd, fact, spec.memoryStats);
    if (!merged.updated) return null;
    updated = true;
    return { ...persona, memoriesMd: merged.memoriesMd, spec: { ...spec, memoryStats: merged.stats } };
  });
  return updated;
}
