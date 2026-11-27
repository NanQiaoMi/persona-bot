import { chatCompletion, parseJsonFromLlmOutput, type LlmConfig } from '@/lib/llm/client';
import { sanitizeInnerThought } from '@/lib/persona/inner-thought';
import type {
  PersonaMindSpec,
  PersonaTemperamentSpec,
  TemperamentIntensityTier,
} from '@/lib/persona/spec';

export type CognitiveTriggerReason =
  | 'sulking'
  | 'boundary'
  | 'disagreement'
  | 'confiding'
  | 'spicy_tension';

export interface CognitiveReflection {
  interpretation: string;
  innerReaction: string;
  stance: string;
  surfaceStrategy: string;
  spokenThought: string;
}

const DISAGREEMENT_RE =
  /凭什么|你错了|不对吧|瞎说|胡说|别装|我就觉得|难道不是|你太.{0,6}了吧|反驳|辩论|讲道理|不同意/;

const CONFIDING_RE =
  /崩溃|好累|撑不住|难受|委屈|迷茫|失眠|吵架|分手|焦虑|压力好大|不知道怎么办|哭了/;

const SPICY_DISMISS_RE = /^(?:随便|无所谓|哦+|嗯+|算了|懒得说|行吧)[。.~！!]*$/;

/**
 * 混合自适应思考路由：
 * - 日常闲聊走单次调用（零额外延迟）
 * - 闹别扭、踩雷、观点分歧、认真倾诉或高敏张力场自动触发轻量二段推演
 */
export function shouldTriggerDeepCognitivePass(input: {
  userMessage: string;
  sulkingLevel: number;
  boundaryHitReason?: string | null;
  intensityTier?: TemperamentIntensityTier;
  pleasantness: number;
  isMasterBot?: boolean;
}): { trigger: boolean; reason?: CognitiveTriggerReason } {
  if (input.isMasterBot) return { trigger: false };
  const text = (input.userMessage || '').trim();
  if (!text) return { trigger: false };

  if (input.boundaryHitReason) {
    return { trigger: true, reason: 'boundary' };
  }
  if (input.sulkingLevel >= 1) {
    return { trigger: true, reason: 'sulking' };
  }
  if (DISAGREEMENT_RE.test(text)) {
    return { trigger: true, reason: 'disagreement' };
  }
  if (text.length >= 24 && CONFIDING_RE.test(text)) {
    return { trigger: true, reason: 'confiding' };
  }
  if (
    input.intensityTier === 'spicy' &&
    (input.pleasantness <= -0.15 || SPICY_DISMISS_RE.test(text))
  ) {
    return { trigger: true, reason: 'spicy_tension' };
  }

  return { trigger: false };
}

function cleanShortField(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
}

/**
 * 轻量二段性格思考推演（严格 2.5s 超时熔断，失败/超时无感降级为单次快路径）
 */
export async function runDeepCognitivePass(
  llm: LlmConfig,
  params: {
    personaName: string;
    basicPersonality?: string;
    mind: PersonaMindSpec;
    temperament?: PersonaTemperamentSpec;
    sulkingReason?: string;
    sulkingLevel?: number;
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
    userMessage: string;
    triggerReason: CognitiveTriggerReason;
  },
  options: { timeoutMs?: number } = {}
): Promise<CognitiveReflection | null> {
  if (!llm.canCall) return null;

  const recentSnippet = params.recentMessages
    .slice(-4)
    .filter((m) => typeof m.content === 'string' && m.content.trim())
    .map((m) => `${m.role === 'user' ? '对方' : params.personaName}：${m.content.trim().slice(0, 120)}`)
    .join('\n');

  const prompt = [
    `你是「${params.personaName}」的内心潜意识引擎。现在遇到高情绪/观点张力场景（触发原因：${params.triggerReason}），请按你的性格快速过一遍内心判断，只输出合法 JSON，不要解释。`,
    params.basicPersonality ? `基础性格：${params.basicPersonality.slice(0, 100)}` : '',
    `思考风格：${params.mind.cognitiveStyle} | 防御机制：${params.mind.defenseStyle} | 分歧态度：${params.mind.disagreementStyle} | 保留度：${params.mind.subtextLevel}`,
    params.mind.coreValues.length > 0 ? `底线与在意点：${params.mind.coreValues.join('；')}` : '',
    params.sulkingLevel && params.sulkingLevel >= 1
      ? `当前别扭等级：${params.sulkingLevel}（原因：${params.sulkingReason || '心里堵着气'}）`
      : '',
    recentSnippet ? `【刚才几句】\n${recentSnippet}` : '',
    `【对方刚说】${params.userMessage.slice(0, 260)}`,
    '请输出 JSON 对象，包含 5 个简短中文字段：',
    '{"interpretation":"按你的性格怎么解读这句话(<=36字)","innerReaction":"真实情绪与防御反射(<=36字)","stance":"你要坚持的立场或别扭点(<=36字)","surfaceStrategy":"嘴上说几分、藏几分、绝不顺着说什么(<=45字)","spokenThought":"第一人称口语内心戏1~2句，禁止出现用户/人设/策略/Layer等词(<=85字)"}',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await chatCompletion(
      llm,
      [{ role: 'user', content: prompt }],
      {
        temperature: 0.55,
        maxTokens: 200,
        timeoutMs: options.timeoutMs ?? 2500,
      }
    );
    const parsed = parseJsonFromLlmOutput<Record<string, unknown>>(raw);
    if (!parsed) return null;

    const interpretation = cleanShortField(parsed.interpretation, 60);
    const innerReaction = cleanShortField(parsed.innerReaction, 60);
    const stance = cleanShortField(parsed.stance, 60);
    const surfaceStrategy = cleanShortField(parsed.surfaceStrategy, 80);
    const spokenThought = sanitizeInnerThought(
      typeof parsed.spokenThought === 'string' ? parsed.spokenThought : '',
      { minLength: 4 }
    );

    if (!interpretation && !stance && !surfaceStrategy) {
      return null;
    }

    return {
      interpretation: interpretation || '心里先琢磨了一下对方这话的意思',
      innerReaction: innerReaction || '按平时的防御习惯先稳住情绪',
      stance: stance || '保持自己的真实判断，不随便糊弄过去',
      surfaceStrategy: surfaceStrategy || '按真实心情和分寸回，不硬装热情',
      spokenThought,
    };
  } catch {
    return null;
  }
}

export function formatCognitiveReflectionForPrompt(reflection: CognitiveReflection): string {
  return [
    '## 本轮内部心路推演（仅作真实心理底稿，切勿照抄术语）',
    `- 第一解读：${reflection.interpretation}`,
    `- 内心反射：${reflection.innerReaction}`,
    `- 站定立场：${reflection.stance}`,
    `- 嘴上策略：${reflection.surfaceStrategy}`,
  ].join('\n');
}
