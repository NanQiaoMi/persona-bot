/**
 * 风格指纹 (Style Fingerprint)：从一组真实发言中统计出的说话方式特征。
 * - 本人指纹：来自蒸馏时导入的原始聊天记录（或人设 Layer 2 中的示例原话），作为人格锚点，不随对话漂移。
 * - 用户指纹：来自用户近期发言，用于轻度镜像。
 */
export interface StyleFingerprint {
  sampleCount: number;
  /** 平均单条气泡字数 */
  avgBubbleLen: number;
  /** 每条消息平均 emoji 数 */
  emojiRate: number;
  /** 最常用的 emoji（最多 5 个） */
  topEmojis: string[];
  /** 以「。」结尾的消息占比 */
  trailingPeriodRate: number;
  /** 每条消息平均感叹号数 */
  exclamationRate: number;
  /** 每条消息平均问号数 */
  questionRate: number;
  /** 高频口头禅 / 语气词 */
  catchphrases: string[];
  /** 典型原话（最多 6 句） */
  sampleQuotes: string[];
}

export const DEFAULT_YOUNG_ADULT_FINGERPRINT: StyleFingerprint = {
  sampleCount: 0,
  avgBubbleLen: 14,
  emojiRate: 0.05,
  topEmojis: [],
  trailingPeriodRate: 0.1,
  exclamationRate: 0.15,
  questionRate: 0.25,
  catchphrases: [],
  sampleQuotes: [],
};

export function getEmojiRegex(): RegExp {
  return new RegExp(
    '\\p{Extended_Pictographic}\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*',
    'gu'
  );
}

const FILLER_CANDIDATES = [
  '哈哈哈',
  '哈哈',
  '嘛',
  '啦',
  '呗',
  '咯',
  '嗯嗯',
  '好吧',
  '行吧',
  '笑死',
  '离谱',
  '真假',
  '绝了',
  '啊这',
  '确实',
  '无语',
  '救命',
  '算了',
  '懂了',
  '我靠',
  '啧',
  'emmm',
  'hh',
  'ok',
];

/**
 * 从若干条真实发言中构建风格指纹（纯 TS，确定性）
 */
export function buildFingerprintFromLines(rawLines: string[]): StyleFingerprint {
  const lines = rawLines
    .map((l) => (typeof l === 'string' ? l.trim() : ''))
    .filter((l) => l.length > 0 && l.length <= 400);

  if (lines.length === 0) {
    return { ...DEFAULT_YOUNG_ADULT_FINGERPRINT };
  }

  let totalChars = 0;
  let totalEmoji = 0;
  let totalExcl = 0;
  let totalQ = 0;
  let periodCount = 0;
  const emojiCounts = new Map<string, number>();
  const fillerCounts = new Map<string, number>();

  for (const line of lines) {
    totalChars += line.length;
    const emojis = line.match(getEmojiRegex()) || [];
    totalEmoji += emojis.length;
    for (const e of emojis) emojiCounts.set(e, (emojiCounts.get(e) || 0) + 1);
    totalExcl += (line.match(/[！!]/g) || []).length;
    totalQ += (line.match(/[？?]/g) || []).length;
    if (/。\s*$/.test(line)) periodCount += 1;
    const lower = line.toLowerCase();
    for (const f of FILLER_CANDIDATES) {
      if (lower.includes(f)) fillerCounts.set(f, (fillerCounts.get(f) || 0) + 1);
    }
  }

  const n = lines.length;
  const round2 = (x: number) => Number(x.toFixed(2));
  // Prefer longer fillers when a shorter one is a substring of it (e.g. 哈哈哈 over 哈哈)
  const catchphrases = Array.from(fillerCounts.entries())
    .filter(([, c]) => c >= Math.max(1, Math.ceil(n * 0.05)))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([f]) => f)
    .filter((f, _i, arr) => !arr.some((o) => o !== f && o.includes(f)))
    .slice(0, 8);

  return {
    sampleCount: n,
    avgBubbleLen: Math.round(totalChars / n),
    emojiRate: round2(totalEmoji / n),
    topEmojis: Array.from(emojiCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([e]) => e)
      .slice(0, 5),
    trailingPeriodRate: round2(periodCount / n),
    exclamationRate: round2(totalExcl / n),
    questionRate: round2(totalQ / n),
    catchphrases,
    sampleQuotes: lines.filter((l) => l.length >= 2 && l.length <= 30).slice(0, 6),
  };
}

/**
 * 从人设 Markdown 的 Layer 2（表达风格）里提取引号内的示例原话作为本人样本。
 * 适用于没有原始聊天记录的内置角色。
 */
export function extractSampleLinesFromPersonaMd(personaMd: string): string[] {
  if (!personaMd) return [];
  const layer2Match = personaMd.match(/#+\s*Layer\s*2[\s\S]*?(?=\n#+\s*Layer\s*3|\n##\s+\d|$)/i);
  const scope = layer2Match ? layer2Match[0] : personaMd;
  const quotes: string[] = [];
  const re = /[「“"]([^「」“”"\n]{2,60})[」”"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    const q = m[1].trim();
    if (q && !quotes.includes(q)) quotes.push(q);
  }
  return quotes;
}

export function fingerprintFromPersonaMd(personaMd: string): StyleFingerprint {
  const lines = extractSampleLinesFromPersonaMd(personaMd);
  if (lines.length < 3) return { ...DEFAULT_YOUNG_ADULT_FINGERPRINT };
  return buildFingerprintFromLines(lines);
}
