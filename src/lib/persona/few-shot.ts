import type {
  FewShotScene,
  LearnedItem,
  PersonaFewShotExample,
  PersonaSpec,
} from '@/lib/persona/spec';

const SCENE_LABELS: Record<FewShotScene, string> = {
  daily: '日常接话',
  tease: '互损斗嘴',
  conflict: '闹别扭/反击',
  comfort: '情绪接住',
  disagree: '表达不同意见',
};

/** 根据用户消息与当前别扭状态判断最匹配的语境场景 */
export function classifyMessageScene(userMessage: string, sulkingLevel = 0): FewShotScene {
  const text = (userMessage || '').trim();
  if (sulkingLevel >= 1 || /敷衍|算了|随便|无所谓|别烦我|懒得|滚|闭嘴/.test(text)) {
    return 'conflict';
  }
  if (/好累|难过|委屈|崩了|睡不着|失眠|抱抱|压力|难受|烦死|焦虑/.test(text)) {
    return 'comfort';
  }
  if (/凭什么|不对|反驳|胡说|瞎说|我觉得|难道不是|不同意|讲道理/.test(text)) {
    return 'disagree';
  }
  if (/笑死|哈哈|逗你|傻|笨|菜|嘴硬|傲娇|看不起/.test(text)) {
    return 'tease';
  }
  return 'daily';
}

function inferSceneFromPair(userText: string, assistantText: string): FewShotScene {
  const combined = `${userText}\n${assistantText}`;
  if (/久不回|敷衍|生气|冷淡|不回|哄|别扭|哼/.test(combined)) return 'conflict';
  if (/累|难过|抱|睡|熬夜|委屈|安慰|歇/.test(combined)) return 'comfort';
  if (/不对|不同意|才不是|别乱说|胡说|反驳/.test(combined)) return 'disagree';
  if (/肉麻|笑死|吐槽|逗|嘴硬|想你/.test(combined)) return 'tease';
  return 'daily';
}

/**
 * 从 persona.md 中自动抽取引用式/问答式对话示例（例如 `> 有人...：\n> 你：...`）
 */
export function extractFewShotsFromPersonaMd(personaMd: string): PersonaFewShotExample[] {
  const md = personaMd || '';
  if (!md.trim()) return [];
  const lines = md.split('\n');
  const results: PersonaFewShotExample[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i].trim();
    const next = lines[i + 1].trim();

    // 模式 1：`> 有人说“...”：` + `> 你：...`
    const quoteUser = cur.match(/^>\s*(?:有人|对方|用户)(?:问|说)?[：: ]*(.+)$/);
    const quoteBot = next.match(/^>\s*(?:你|TA|回复)[：:]\s*(.+)$/);
    if (quoteUser && quoteBot) {
      const user = quoteUser[1].replace(/[：:]\s*$/, '').trim();
      const assistant = quoteBot[1].trim();
      if (user && assistant) {
        results.push({
          scene: inferSceneFromPair(user, assistant),
          user,
          assistant,
          source: 'persona-md',
        });
      }
      continue;
    }

    // 模式 2：`对方：...` / `Q：...` + `你：...` / `A：...`
    const plainUser = cur.match(/^(?:[-*+]\s*)?(?:对方|Q|问)[：:]\s*(.+)$/i);
    const plainBot = next.match(/^(?:[-*+]\s*)?(?:你|A|答)[：:]\s*(.+)$/i);
    if (plainUser && plainBot) {
      const user = plainUser[1].trim();
      const assistant = plainBot[1].trim();
      if (user && assistant) {
        results.push({
          scene: inferSceneFromPair(user, assistant),
          user,
          assistant,
          source: 'persona-md',
        });
      }
    }
  }

  return results;
}

/**
 * 把「Correction 记录」里明确写了“应当/改成”的纠偏条目转化为高优先级示范对比
 */
export function extractFewShotsFromCorrections(learned?: LearnedItem[]): PersonaFewShotExample[] {
  if (!Array.isArray(learned) || learned.length === 0) return [];
  const results: PersonaFewShotExample[] = [];
  for (const item of learned) {
    if (item.kind !== 'correction') continue;
    if (item.status !== 'active' && item.status !== 'locked') continue;
    const m = item.text.match(/^(?:避免|别说)?([^，；;]+)[，；;\s]*(?:应当|改成|应该说)[：:]\s*(.+)$/);
    if (m) {
      const avoid = m[1].trim().slice(0, 32);
      const prefer = m[2].trim().slice(0, 80);
      if (avoid && prefer) {
        results.push({
          scene: inferSceneFromPair(avoid, prefer),
          user: `（不要说 ${avoid}）`,
          assistant: prefer,
          source: 'correction',
        });
      }
    }
  }
  return results;
}

function lexicalOverlapScore(a: string, b: string): number {
  const cleanA = (a || '').replace(/[\s，。,.！？!?\-—「」“”]/g, '');
  const cleanB = (b || '').replace(/[\s，。,.！？!?\-—「」“”]/g, '');
  if (!cleanA || !cleanB) return 0;
  let hits = 0;
  for (let i = 0; i < cleanA.length - 1; i++) {
    const bigram = cleanA.slice(i, i + 2);
    if (cleanB.includes(bigram)) hits++;
  }
  return hits / Math.max(1, cleanA.length - 1);
}

/**
 * 按当前语境动态选出 2~3 组最贴合的示范对话（去重、优先同场景与历史纠偏）
 */
export function selectDynamicFewShots(params: {
  personaMd: string;
  spec?: PersonaSpec;
  userMessage: string;
  sulkingLevel?: number;
  maxExamples?: number;
}): PersonaFewShotExample[] {
  const maxExamples = params.maxExamples ?? 3;
  const targetScene = classifyMessageScene(params.userMessage, params.sulkingLevel ?? 0);

  const pool: PersonaFewShotExample[] = [
    ...(params.spec?.mind?.fewShotExamples || []),
    ...extractFewShotsFromCorrections(params.spec?.learned),
    ...extractFewShotsFromPersonaMd(params.personaMd),
  ];

  const deduped: PersonaFewShotExample[] = [];
  const seen = new Set<string>();
  for (const ex of pool) {
    const key = `${ex.user.trim()}->${ex.assistant.trim()}`;
    if (!ex.assistant?.trim() || seen.has(key)) continue;
    seen.add(key);
    deduped.push(ex);
  }

  const scored = deduped.map((ex, idx) => {
    let score = 0;
    if (ex.scene === targetScene) score += 4;
    if (ex.source === 'correction') score += 3;
    if (ex.source === 'preset' || ex.source === 'chatlog') score += 1.5;
    score += lexicalOverlapScore(params.userMessage, `${ex.user} ${ex.assistant}`) * 3;
    return { ex, score, idx };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, maxExamples).map((s) => s.ex);
}

export function buildFewShotDirective(examples: PersonaFewShotExample[]): string {
  if (!examples || examples.length === 0) return '';
  const lines = [
    '## 说话质感参考（动态匹配本轮语境，学神韵别照抄原句）',
    ...examples.map(
      (ex) =>
        `- [${SCENE_LABELS[ex.scene]}] 对方：${ex.user.slice(0, 60)} → 你：${ex.assistant.slice(0, 100)}`
    ),
  ];
  return lines.join('\n');
}
