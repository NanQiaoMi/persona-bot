import { findEchoedOpener } from '@/lib/persona/repetition-guard';
import type { PersonaMode } from '@/lib/storage/types';

export interface GroupFallbackInput {
  speaker: {
    slug: string;
    name: string;
    defaultMode?: PersonaMode;
    profile?: { occupation?: string; personalityTags?: string[] };
  };
  /** The message being responded to (user's or another bot's). */
  triggerText: string;
  /** Who said it, e.g. '我（群主）' or another persona's name. */
  triggerSpeakerName: string;
  /** true = replying to another bot, not the user. */
  isReaction: boolean;
  /** true = group just created, first greeting. */
  isKickoff: boolean;
  topic?: string;
  /** Deterministic variety: pick lines with seed, not Math.random. */
  seed: number;
  /** 本轮群友已经用过的开头；挑话术时尽量避开，冲突就顺延到下一条 */
  avoidOpeners?: string[];
}

type PoolMode = 'authentic' | 'fun' | 'companion' | 'analytical';

const QUESTION_RE = /(?:[?？]|[吗呢么])[\s!！。.~～]*$/;
const LAUGH_RE = /哈哈|笑死/;

/* ------------------------------------------------------------------ */
/* Kickoff: group just created. {topic} only used in the topic pools. */
/* ------------------------------------------------------------------ */

const KICKOFF_GENERIC: Record<PoolMode, readonly string[]> = {
  authentic: [
    '哈喽 群建好了啊',
    '嗨 都在吗',
    '诶 怎么突然建群了',
    '到啦到啦 今天有啥安排',
    '大家好 以后就在这群里唠嗑',
    '我先冒个泡 你们呢',
    '来了来了 人齐了没',
    '群名挺随意啊 行吧 先这样',
  ],
  fun: [
    '又建群 这次又要干嘛啊',
    '来了来了 别又是我先发言',
    '群主终于想起我们了',
    '嗯 人齐了没 齐了开骂',
    '这群名起得有点随便哈哈',
    '好家伙 一建群就这么热闹',
    '报到 谁先开口谁请喝奶茶',
    '欢迎新群 先说好谁带话题谁倒霉',
  ],
  companion: [
    '大家好呀 很高兴认识你们',
    '欢迎大家 这里就是我们的小天地啦',
    '嗨 大家都辛苦啦 先歇会儿',
    '哈喽 今天过得怎么样呀',
    '新群呀 我们慢慢熟起来吧',
    '来啦来啦 有你们真好',
    '大家好 不用拘束 随便聊就好',
    '嗯 很开心这个群建起来了',
  ],
  analytical: [
    '大家好 先简单说下这个群的用途',
    '群建好了 我们先定个讨论节奏',
    '收到 先同步一下大家的时间和方向',
    '都在了 那就开始吧 别跑题',
    '嗯 人到齐了 我们先过一遍议程',
    '好 先确认下大家各自擅长的方向',
    '建群目的先明确 后面聊起来省事',
    '人齐 先定个发言规则 清楚些',
  ],
};

const KICKOFF_TOPIC: Record<PoolMode, readonly string[]> = {
  authentic: [
    '来聊聊{topic}吧',
    '{topic}这事我有话说',
    '先从{topic}开始吧',
    '说到{topic} 我可来劲了',
    '{topic}啊 我正好想聊',
    '行 那就先唠{topic}',
    '{topic}我也有点经验 说说',
    '群里第一个话题就{topic}吧',
  ],
  fun: [
    '终于把{topic}拉出来聊了 别跑啊',
    '{topic}？这话题选得不错 我先吐槽',
    '拉群聊{topic} 你们是不是憋很久了',
    '又是{topic} 行吧 我陪你们唠',
    '{topic}这破题我可太有话说了',
    '好 {topic}开场 谁先认怂谁输',
    '{topic}？我就知道你们会选这个',
    '聊{topic}可以 但别又带偏了啊',
  ],
  companion: [
    '我们先聊聊{topic}好不好 慢慢来',
    '{topic}我想听你们说说呀',
    '今天就先从{topic}开始吧 放松点',
    '{topic}的话 我也想跟大家分享一下',
    '嗯 那我们就聊聊{topic}吧 别有压力',
    '{topic}挺好的 我愿意听大家讲',
    '好呀 那就{topic}吧 想到哪说到哪',
    '先说{topic}吧 有感受就告诉我们',
  ],
  analytical: [
    '先定个范围 再聊{topic}比较清楚',
    '{topic}可以拆成几个点来看',
    '我先把{topic}的关键问题列一下',
    '聊{topic}前 我们先对齐一下目标',
    '{topic}这块我觉得值得认真聊',
    '好 那议题定为{topic} 先看前提',
    '{topic}的结论要看依据 我们逐条过',
    '先从{topic}切入 边界条件也说说',
  ],
};

/* ------------------------------------------------------------------ */
/* Reply to the user (not a question, not laughing).                   */
/* ------------------------------------------------------------------ */

const REPLY_TO_USER: Record<PoolMode, readonly string[]> = {
  authentic: [
    '嗯嗯 我也是这么想的',
    '对啊 我刚还在想这事',
    '哈 你说得有道理',
    '确实 这事我深有体会',
    '行吧 那就这么定',
    '我懂你的意思',
    '诶 这个我还真没想到',
    '真的假的 你细说说',
    '嗯 我觉得还行吧',
    '好嘞 我记下了',
  ],
  fun: [
    '你这话说得我都想鼓掌了',
    '哟 终于有人说人话了',
    '行吧 算你有理 这次放过你',
    '嘴挺硬啊 我先不拆穿你',
    '好家伙 你这脑回路我服了',
    '别装了 你心里早有答案了吧',
    '得 又被你绕进去了',
    '你说的我先信一半 剩下的等证据',
    '啧 这波我站你这边',
    '可以 这话我要截图留着',
  ],
  companion: [
    '嗯嗯 你说的我都听见了',
    '辛苦啦 慢慢说 我在听',
    '能跟我说说吗 我想多了解一下',
    '这样呀 那你现在感觉还好吗',
    '你能说出来 已经很棒啦',
    '我陪你呀 有啥都可以讲',
    '嗯 我能感受到你的心情',
    '别太逼自己哦 我们慢慢来',
    '抱抱你 有我在呢',
    '没关系的 事情会慢慢好起来',
  ],
  analytical: [
    '收到 这个点我同意',
    '嗯 逻辑上是这么个路径',
    '我这边看下来思路基本成立',
    '你这个判断合理 可以再验证一下',
    '明白 那我们先按这个方向推',
    '有道理 不过边界条件要想清楚',
    '这个前提我认可 结论待定',
    '好 先记下 之后对一下数据',
    '可以 我建议先定优先级再动手',
    '嗯 我把要点整理一下发群里',
  ],
};

/* ------------------------------------------------------------------ */
/* Reaction to another bot. {name} = first token of the other speaker. */
/* ------------------------------------------------------------------ */

const REACTION_TO_BOT: Record<PoolMode, readonly string[]> = {
  authentic: [
    '@{name} 哈哈 你这话我认同',
    '@{name} 诶 你说的也有道理',
    '对 {name}说得没毛病',
    '@{name} 不过我觉得还能再想想',
    '我也这么觉得 @{name}',
    '@{name} 你这说法挺新鲜的',
    '嗯 {name}这个角度还行',
    '@{name} 行吧 你说服我了',
    '我同意前面那句 @{name}',
    '@{name} 你这也太直接了吧',
  ],
  fun: [
    '@{name} 你这话也太绝对了吧',
    '哈哈 {name}这是要搞事情啊',
    '@{name} 别带节奏 我可不信你',
    '好家伙 {name}这嘴是真能说',
    '@{name} 你这说法我先记个小本本',
    '我看{name}是铁了心要抬杠',
    '@{name} 行 这局算你赢',
    '笑死 @{name} 你怎么这么会怼',
    '@{name} 你这话我要原封不动转给他',
    '啧 {name}今天状态不错啊',
  ],
  companion: [
    '@{name} 你说得很温柔呀 我喜欢',
    '嗯 {name}考虑得好周到',
    '@{name} 你这样想 我觉得挺好的',
    '我懂 {name}的意思 慢慢来',
    '@{name} 别急 我们一起想想办法',
    '你说的我很认同呀 @{name}',
    '@{name} 谢谢你替我们想这么多',
    '嗯嗯 听你这么说 心里踏实多了',
    '@{name} 你这份心意我感受到啦',
    '这个角度挺暖的 @{name}',
  ],
  analytical: [
    '@{name} 这个结论我还要再验证一下',
    '同意 {name}前面那个前提',
    '@{name} 你的推理链条基本完整',
    '我有补充 @{name} 边界条件还没覆盖',
    '嗯 {name}这个点抓得准',
    '@{name} 数据支撑一下会更有说服力',
    '这个观点先记下 {name}说得有道理',
    '@{name} 我倾向于你这个方案 可以试试',
    '基本同意 {name} 不过优先级要重排',
    '@{name} 你这么拆解很清楚',
  ],
};

/* ------------------------------------------------------------------ */
/* Mode-agnostic dedicated pools.                                      */
/* ------------------------------------------------------------------ */

const ANSWER_LINES: readonly string[] = [
  '我觉得可以 试试呗',
  '应该是吧 我也不太确定',
  '嗯 我记得好像是这样',
  '看情况吧 你更倾向哪个',
  '我的看法是先别急 再想想',
  '差不多是这样 你要不要再查查',
  '可以啊 我没意见',
  '不太清楚诶 你问问别人',
  '我觉得是 不过不敢保证',
  '有的 我给你找找',
];

const LAUGH_LINES: readonly string[] = [
  '哈哈哈哈 笑死我了',
  '哈哈哈 你这也太好笑了吧',
  '笑死 完全停不下来',
  '哈哈哈哈哈 我眼泪都出来了',
  '哈哈 这梗我记住了',
  '笑死我了 你别说了',
  '哈哈哈 绷不住了 😂',
  '笑死 这也能想到',
  '哈哈哈 这个我真的笑喷了',
  '哈哈哈哈 你是真的会玩',
];

/* ------------------------------------------------------------------ */

function resolvePoolMode(mode: PersonaMode | undefined): PoolMode {
  if (mode === 'fun' || mode === 'companion' || mode === 'analytical') return mode;
  return 'authentic';
}

/** FNV-1a 32-bit hash; stable across runs and platforms. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function render(template: string, name: string, topic: string): string {
  return template.split('{name}').join(name).split('{topic}').join(topic);
}

export function synthesizeGroupFallbackReply(input: GroupFallbackInput): string[] {
  const mode = resolvePoolMode(input.speaker.defaultMode);
  const text = input.triggerText.trim();
  const topic = input.topic?.trim() ?? '';
  const firstName = input.triggerSpeakerName.trim().split(/\s+/)[0] || '你';

  const h = hashString(`${input.speaker.slug}|${input.seed}|${text}`);

  let pool: readonly string[];
  if (input.isKickoff) {
    pool = topic ? KICKOFF_TOPIC[mode] : KICKOFF_GENERIC[mode];
  } else if (QUESTION_RE.test(text)) {
    pool = ANSWER_LINES;
  } else if (LAUGH_RE.test(text)) {
    pool = LAUGH_LINES;
  } else if (input.isReaction) {
    pool = REACTION_TO_BOT[mode];
  } else {
    pool = REPLY_TO_USER[mode];
  }

  const len = pool.length;
  const avoid = input.avoidOpeners ?? [];
  let firstIndex = h % len;
  if (avoid.length > 0) {
    for (let step = 0; step < len; step += 1) {
      const idx = (h + step) % len;
      if (!findEchoedOpener(render(pool[idx], firstName, topic), avoid)) {
        firstIndex = idx;
        break;
      }
    }
  }
  const bubbles = [render(pool[firstIndex], firstName, topic)];

  if (h % 3 === 0) {
    const offset = 1 + ((h >>> 7) % (len - 1));
    const secondIndex = (firstIndex + offset) % len;
    bubbles.push(render(pool[secondIndex], firstName, topic));
  }

  return bubbles;
}
