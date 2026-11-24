export interface UserChatStyleProfile {
  sampleCount: number;
  avgCharLength: number;
  lengthBucket: 'short' | 'medium' | 'long';
  emojiPerMsg: number;
  maxBotEmojiPerTurn: 0 | 1;
  usesTrailingPeriod: boolean;
  exclamationPerMsg: number;
  detectedSlang: string[];
  sampleLines: string[];
  styleDirective: string;
}

const SLANG_CANDIDATES = [
  '笑死',
  '离谱',
  '逆天',
  '真假',
  '绝了',
  '啊这',
  '啥',
  '咋',
  '行吧',
  '算了',
  '好家伙',
  '哈哈',
  'hh',
  'ok',
  'okok',
  '666',
  '确实',
  '牛',
  '摆烂',
  '麻了',
  '救命',
  '绷不住',
  '有一说一',
];

const OILY_EMOJI_REGEX =
  /(?:😏|💕|🙈|✨|🔥|💖|💗|🥰|😘|🤭|😉|🌟|💫|🎉|🥳|🫶|❤️‍🔥|❤️|😍|🤩|🤗|🤪|😜|😝|💞|💓|💘|💝|💐|🌹|💋)\uFE0F?/gu;

function getEmojiRegex(): RegExp {
  return new RegExp(
    '\\p{Extended_Pictographic}\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*',
    'gu'
  );
}

/**
 * 实时分析用户近期聊天习惯（句长、标点、emoji 频率与当代口语梗），用于动态镜像对话风格
 */
export function analyzeUserChatStyle(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): UserChatStyleProfile {
  const userMsgs = messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content.trim())
    .filter((t) => t.length > 0 && !t.startsWith('[来自主控'))
    .slice(-20);

  if (userMsgs.length === 0) {
    return {
      sampleCount: 0,
      avgCharLength: 14,
      lengthBucket: 'short',
      emojiPerMsg: 0,
      maxBotEmojiPerTurn: 0,
      usesTrailingPeriod: false,
      exclamationPerMsg: 0,
      detectedSlang: [],
      sampleLines: [],
      styleDirective:
        '对方还没展开聊，先按当代年轻人微信日常短句聊（单条 6~22 字），不用“。”收尾，不端着也不当主持人追问，尽量 0 个 emoji。',
    };
  }

  const emojiRegex = getEmojiRegex();
  let totalChars = 0;
  let totalEmojis = 0;
  let totalExclamations = 0;
  let trailingPeriodCount = 0;
  const slangHitSet = new Set<string>();

  for (const text of userMsgs) {
    totalChars += text.length;
    const emojiMatches = text.match(emojiRegex);
    totalEmojis += emojiMatches ? emojiMatches.length : 0;
    const exclMatches = text.match(/[！!]/g);
    totalExclamations += exclMatches ? exclMatches.length : 0;
    if (/。\s*$/.test(text)) {
      trailingPeriodCount += 1;
    }
    const lower = text.toLowerCase();
    for (const slang of SLANG_CANDIDATES) {
      if (lower.includes(slang.toLowerCase())) {
        slangHitSet.add(slang);
      }
    }
  }

  const sampleCount = userMsgs.length;
  const avgCharLength = Math.round(totalChars / sampleCount);
  const lengthBucket: UserChatStyleProfile['lengthBucket'] =
    avgCharLength <= 14 ? 'short' : avgCharLength <= 38 ? 'medium' : 'long';
  const emojiPerMsg = Number((totalEmojis / sampleCount).toFixed(2));
  const exclamationPerMsg = Number((totalExclamations / sampleCount).toFixed(2));
  const maxBotEmojiPerTurn: 0 | 1 = emojiPerMsg < 0.15 ? 0 : 1;
  const usesTrailingPeriod = trailingPeriodCount / sampleCount >= 0.4;
  const detectedSlang = Array.from(slangHitSet).slice(0, 6);
  const sampleLines = userMsgs
    .filter((m) => m.length >= 2 && m.length <= 28)
    .slice(-3);

  const hints: string[] = [];
  if (lengthBucket === 'short') {
    hints.push(
      `对方平时发微信很精简（平均约 ${avgCharLength} 字），你也必须用短句接话，每条控制在 5~22 字，别写成作文`
    );
  } else if (lengthBucket === 'medium') {
    hints.push(
      `对方每条消息约 ${avgCharLength} 字，保持自然微信聊天节奏，1~3 条短消息聊透即可`
    );
  } else {
    hints.push(
      `对方这轮说得比较细（平均 ${avgCharLength} 字），可以分 2~3 条自然展开接住重点，但依然保持口语松弛感`
    );
  }

  if (maxBotEmojiPerTurn === 0) {
    hints.push(
      '对方几乎不用 emoji，本轮回复严格使用 0 个 emoji，纯靠用词、停顿和语气词传神'
    );
  } else {
    hints.push(
      '对方偶尔用少量表情，本轮最多只能带 1 个克制表情（如 😅😂），绝不连发'
    );
  }

  if (!usesTrailingPeriod) {
    hints.push('对方句尾很少打“。”，短气泡结尾也不要用“。”收尾，用空格或换行更自然');
  }

  if (exclamationPerMsg < 0.35) {
    hints.push('对方语气比较平实松弛，别每句话末尾都带“！”惊呼，少用感叹号和舞台剧括号动作');
  }

  hints.push('不要每一轮末尾都硬抛“你呢？今天怎么样？”之类主持人式反问，聊完自然停下也很真实');

  if (detectedSlang.length > 0) {
    hints.push(
      `对方常带口语表达（${detectedSlang.join('、')}），保持同频网感接话，别硬塞尬梗`
    );
  }

  if (sampleLines.length > 0) {
    hints.push(
      `参考对方刚刚的真实发言节奏：${sampleLines.map((s) => `「${s}」`).join(' / ')}`
    );
  }

  return {
    sampleCount,
    avgCharLength,
    lengthBucket,
    emojiPerMsg,
    maxBotEmojiPerTurn,
    usesTrailingPeriod,
    exclamationPerMsg,
    detectedSlang,
    sampleLines,
    styleDirective: hints.map((h) => `- ${h}`).join('\n'),
  };
}

/**
 * 过滤 AI 味油腻 emoji，并将单轮总 emoji 数量严格限制在预算内（默认 0 或 1 个）
 */
export function trimExcessiveEmojis(
  bursts: string[],
  maxEmojiPerTurn: number,
  allowedEmojis: string[] = []
): string[] {
  const limit = Math.max(0, Math.min(3, Math.floor(maxEmojiPerTurn)));
  const allowed = new Set(allowedEmojis.map((e) => e.replace(/\uFE0F/g, '')));
  let keptCount = 0;

  const cleaned = bursts
    .map((segment) => {
      let working = segment;
      if (limit <= 1) {
        // 本人常用的表情不算油腻，保留给后面的预算判断
        working = working.replace(OILY_EMOJI_REGEX, (m) =>
          allowed.has(m.replace(/\uFE0F/g, '')) ? m : ''
        );
      }

      const emojiRegex = getEmojiRegex();
      working = working.replace(emojiRegex, (match) => {
        if (keptCount < limit) {
          keptCount += 1;
          return match;
        }
        return '';
      });

      return working
        .split('\n')
        .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    })
    .filter((b) => b.length > 0);

  if (cleaned.length > 0) {
    return cleaned;
  }

  const fallbackText = bursts.map((b) => b.trim()).find(Boolean);
  return [fallbackText ? '行，听你的' : '怎么了'];
}

/**
 * 进一步把长篇/书面/感叹号过多的气泡打磨成当代年轻人日常微信松弛口语（保留代码块与列表）
 */
export interface PolishOverrides {
  /** 单轮 emoji 预算（来自本人/用户双指纹混合），覆盖用户画像推断的 0/1 */
  maxEmoji?: number;
  allowedEmojis?: string[];
  usesTrailingPeriod?: boolean;
}

export function polishYoungAdultBursts(
  bursts: string[],
  profile: UserChatStyleProfile,
  overrides: PolishOverrides = {}
): string[] {
  const usesTrailingPeriod = overrides.usesTrailingPeriod ?? profile.usesTrailingPeriod;
  const emojiCleaned = trimExcessiveEmojis(
    bursts,
    overrides.maxEmoji ?? profile.maxBotEmojiPerTurn,
    overrides.allowedEmojis
  );

  const polished = emojiCleaned
    .map((segment) => {
      if (/```/.test(segment) || /(?:^|\n)\s*(?:[-*+]|\d+\.)\s+/.test(segment)) {
        return segment;
      }

      let working = segment
        // Collapse repeated exclamation/question marks
        .replace(/！{2,}/g, '！')
        .replace(/!{2,}/g, '!')
        // Strip robotic AI filler prefixes when standing at start of a bubble
        .replace(/^(?:不过话说回来|顺便一提|老实说|有一说一地讲)[，,]\s*/g, '')
        .trim();

      // Mirror casual young-adult WeChat punctuation: drop lone trailing 。 on short bubbles
      if (
        !usesTrailingPeriod &&
        working.length <= 28 &&
        !working.includes('\n') &&
        working.endsWith('。') &&
        !working.endsWith('。。')
      ) {
        working = working.slice(0, -1).trim();
      }

      return working;
    })
    .filter(Boolean);

  return polished.length > 0 ? polished : emojiCleaned;
}
