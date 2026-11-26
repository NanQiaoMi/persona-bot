/**
 * 识别「在对话里建一个 Bot」的意图，并从一句话里拆出名字 / 性格 / 外貌 / 颜色：
 *   「帮我建一个嘴硬爱撒娇的深夜搭子，叫阿凛，黑长直，紫色的」
 *   → { name: '阿凛', personality: '嘴硬爱撒娇的深夜搭子', appearance: '黑长直', color: '#8B5CF6' }
 * 纯规则，不调模型，离线也能用。
 */
import { MASCOT_COLORS, MASCOT_SHAPES, MascotShapeId } from '@/components/workspace/mascot-palette';

export interface CreateBotIntent {
  /** 没说名字时为 undefined，由调用方起名 */
  name?: string;
  personality?: string;
  appearance?: string;
  color?: string;
  shape?: MascotShapeId;
}

const VERB = '(?:帮我|给我|替我|麻烦)?\\s*(?:再)?(?:建|创建|新建|捏|造|做|生成|弄|整|加)';
const COUNT = '\\s*(?:一个|一只|一位|个|位|只)';
const BOT_NOUN = /(bot|机器人|角色|人设|AI|ai|搭子|伙伴|朋友|虚拟人)/;
const TRIGGER = new RegExp(`${VERB}${COUNT}`);
const NOT_THIS = /(群|群聊|计划|表格|文档|网页|页面|图|照片|海报|视频|歌|代码|ppt|PPT)/;

const NAME_REGEX =
  /(?:名字(?:就)?(?:叫|是|为)|取名(?:叫|为)?|起名(?:叫|为)?|就叫|叫做|叫)\s*[「“"']?([一-龥A-Za-z0-9·.\s]{1,12}?)[」”"']?(?=$|[，,。.！!？?；;、\s]|的|吧|啊|呀|好了)/;
const APPEARANCE_REGEX =
  /(?:外貌|长相|长得|外形|样子|形象|穿搭|打扮|造型)(?:是|像|要|就)?\s*[:：]?\s*([^，,。.！!？?；;]{2,40})/;
const HAIR_OUTFIT_REGEX =
  /([^，,。.！!？?；;]{0,8}(?:长发|短发|黑长直|卷发|马尾|双马尾|丸子头|寸头|眼镜|卫衣|西装|裙|jk|JK|汉服|制服|靴)[^，,。.！!？?；;]{0,8})/;

const COLOR_WORDS: Array<[RegExp, string]> = [
  [/黑色|黑的/, '#0A0A0C'],
  [/棕色|咖啡色|棕的/, '#9C6A3E'],
  [/红色|红的/, '#FA2D48'],
  [/橙色|橘色|橙的/, '#FF6B00'],
  [/黄色|黄的/, '#F59E0B'],
  [/绿色|绿的/, '#12B76A'],
  [/青色|薄荷|青的/, '#12B59C'],
  [/蓝色|蓝的/, '#1683FF'],
  [/紫色|紫的/, '#8B5CF6'],
  [/粉色|粉红|粉的/, '#F43F9E'],
  [/灰色|灰的/, '#8E8E93'],
];

const SHAPE_WORDS: Array<[RegExp, MascotShapeId]> = MASCOT_SHAPES.map((s) => [new RegExp(s.label), s.id]);

function clean(text: string): string {
  return text
    .replace(/^[，,。.、\s的]+|[，,。.、\s的吧啊呀]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function detectCreateBotIntent(text: string): CreateBotIntent | null {
  const raw = (text || '').replace(/@\S+\s*/g, ' ').trim();
  if (!raw || raw.length > 160) return null;
  const trig = raw.match(TRIGGER);
  if (!trig || trig.index === undefined) return null;

  const after = raw.slice(trig.index + trig[0].length);
  const nameMatch = after.match(NAME_REGEX);
  // 「建个群」「做个计划」之类不是建 Bot；必须提到 bot/角色 之类，或明确起了名字
  if (NOT_THIS.test(after.slice(0, 6)) && !BOT_NOUN.test(after)) return null;
  if (!BOT_NOUN.test(after) && !nameMatch) return null;

  let rest = after;
  const name = nameMatch ? clean(nameMatch[1]) : undefined;
  if (nameMatch) rest = rest.replace(nameMatch[0], '，');

  let appearance: string | undefined;
  const appMatch = rest.match(APPEARANCE_REGEX);
  if (appMatch) {
    appearance = clean(appMatch[1]);
    rest = rest.replace(appMatch[0], '，');
  } else {
    const hair = rest.match(HAIR_OUTFIT_REGEX);
    if (hair) {
      appearance = clean(hair[1]);
      rest = rest.replace(hair[0], '，');
    }
  }

  let color: string | undefined;
  for (const [re, hex] of COLOR_WORDS) {
    const m = rest.match(re);
    if (m) {
      color = hex;
      rest = rest.replace(new RegExp(`(?:头像|颜色)?(?:用|是)?${m[0]}(?:的)?(?:头像)?`), '，');
      break;
    }
  }
  let shape: MascotShapeId | undefined;
  for (const [re, id] of SHAPE_WORDS) {
    if (re.test(rest)) {
      shape = id;
      rest = rest.replace(new RegExp(`(?:形状)?(?:是|用)?${re.source}(?:形状|形)?(?:的)?`), '，');
      break;
    }
  }

  const personality = clean(
    rest
      .split(/[，,。.；;！!？?]/)
      .map((s) =>
        s
          .replace(/(?:的)?(?:新的|新)?\s*(bot|Bot|BOT|机器人|角色|人设|AI|ai|虚拟人)\s*/g, '')
          .replace(/^(?:性格|脾气|人设)(?:是|要|就)?\s*[:：]?/, '')
          .trim()
      )
      .filter((s) => s.length >= 2)
      .join('，')
  );

  return {
    name: name || undefined,
    personality: personality || undefined,
    appearance,
    color,
    shape,
  };
}

const FALLBACK_NAMES = ['阿凛', '小满', '星野', '奈奈', '知夏', '南风', '一一', '团子', '芝芝', '阿澈', '苏打', '橘子'];

/** 没说名字时起一个，避开已有角色的名字 */
export function pickFallbackName(existingNames: string[], seed = Date.now()): string {
  const taken = new Set(existingNames.map((n) => n.trim()));
  const start = Math.abs(seed) % FALLBACK_NAMES.length;
  for (let i = 0; i < FALLBACK_NAMES.length; i += 1) {
    const n = FALLBACK_NAMES[(start + i) % FALLBACK_NAMES.length];
    if (!taken.has(n)) return n;
  }
  return `新朋友${(Math.abs(seed) % 90) + 10}`;
}

/** 没指定颜色 / 形状时，按名字稳定地挑一个 */
export function pickMascotFor(name: string): { shape: MascotShapeId; color: string } {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.abs(h);
  return {
    shape: MASCOT_SHAPES[h % MASCOT_SHAPES.length].id,
    // 跳过黑色和灰色，新角色默认颜色鲜一点
    color: MASCOT_COLORS.slice(1, -1)[(h >> 5) % (MASCOT_COLORS.length - 2)],
  };
}
