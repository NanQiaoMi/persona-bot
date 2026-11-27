import { DeepSearchResponse, formatSearchContextForPrompt } from '@/lib/grok/deep-search';
import { getPersonaModeSpec } from '@/lib/grok/persona-modes';
import { retrieveRelevantMemories } from '@/lib/persona/memory-retrieval';
import { fitPersonaToBudget, fitProfileToBudget } from '@/lib/persona/prompt-budget';
import { OOC_GUARD_PROMPT } from '@/lib/persona/prompts';
import { BlendedStyle } from '@/lib/persona/style-blend';
import { UserChatStyleProfile } from '@/lib/persona/style-loop';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaMode, PersonaRecord } from '@/lib/storage/types';

export interface PersonaData {
  persona_md: string;
  memories_md: string;
  ai_profile: string;
  meta: Record<string, unknown>;
}

export interface AssembleOptions {
  mode?: PersonaMode;
  thinkMode?: boolean;
  searchContext?: DeepSearchResponse | null;
  lastUserMessage?: string;
  hasImageAttachment?: boolean;
  userStyleProfile?: UserChatStyleProfile;
  /** 本人 × 用户双指纹混合后的说话方式；有本人锚点时优先于默认「年轻人微信口吻」 */
  blendedStyle?: BlendedStyle;
  emotionSummary?: {
    emotion?: string;
    intensity?: number;
    attitude?: string;
    intimacy?: number;
  };
  traitsDirective?: string;
  sulkingDirective?: string;
  /** 性格思考方式、防御机制与真实熟人分歧权指令 */
  mindDirective?: string;
  /** 按本轮语境动态检索出的 Few-Shot 示范对话 */
  fewShotDirective?: string;
  /** 高张力场景下轻量二段心理推演的结果 */
  cognitiveReflectionDirective?: string;
  /** 统一今日生活与心境板 */
  dailyLifeDirective?: string;
  /** 当前闹别扭等级 (0~3)，用于对拍照/贴纸能力做分层门控 */
  sulkingLevel?: number;
}

export class PromptAssembler {
  async loadPersona(slug: string): Promise<PersonaData> {
    const record = await storageRepo.getPersona(slug);
    if (!record) {
      return {
        persona_md: '',
        memories_md: '',
        ai_profile: '',
        meta: {},
      };
    }

    return {
      persona_md: record.personaMd,
      memories_md: record.memoriesMd,
      ai_profile: record.aiProfileMd,
      meta: {
        slug: record.slug,
        name: record.name,
        defaultMode: record.defaultMode,
        profile: record.profile,
        intimacy: record.intimacy,
        basicPersonality: record.profile.basicPersonality,
      },
    };
  }

  private filterMemories(memories: string, lastMessage?: string): string {
    return retrieveRelevantMemories(memories, lastMessage, {
      topK: 6,
      budgetChars: 1500,
    }).context;
  }

  assembleFromRecord(persona: PersonaRecord, options: AssembleOptions = {}): string {
    return this.assembleSystemPrompt(
      {
        persona_md: persona.personaMd,
        memories_md: persona.memoriesMd,
        ai_profile: persona.aiProfileMd,
        meta: {
          name: persona.name,
          defaultMode: persona.defaultMode,
          intimacy: persona.intimacy,
          basicPersonality: persona.profile.basicPersonality,
        },
      },
      options.emotionSummary || {
        emotion: persona.emotionState.primary,
        intensity: persona.emotionState.intensity,
        attitude: persona.emotionState.moodLabel,
        intimacy: persona.intimacy,
      },
      options.lastUserMessage,
      options
    );
  }

  assembleSystemPrompt(
    data: PersonaData,
    emotionState?: { emotion?: string; intensity?: number; attitude?: string; intimacy?: number },
    lastUserMessage?: string,
    options: AssembleOptions = {}
  ): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const hour = now.getHours();
    const dayPeriod =
      hour < 6 ? '凌晨（夜深人静时段）' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';

    const activeMode = getPersonaModeSpec(
      options.mode || (data.meta?.defaultMode as PersonaMode) || 'authentic'
    );

    const filteredMemories = this.filterMemories(data.memories_md, lastUserMessage);
    const searchBlock = formatSearchContextForPrompt(options.searchContext);
    const sulkingLevel = options.sulkingLevel ?? 0;

    // =========================================================================
    // L1 核心身份与真实主见（最高优先级）
    // =========================================================================
    const sections: string[] = [
      '# PersonaBot v2.0 — 拟人灵魂与实时全能大脑协议（四级优先级仲裁）',
      '',
    ];

    const basicPersonality =
      typeof data.meta?.basicPersonality === 'string' ? data.meta.basicPersonality.trim() : '';
    if (basicPersonality) {
      // 主人亲手定的一句话性格：优先级最高，下面的画像和人设都在它的基础上展开
      sections.push('## 主人给你定的基础性格（最高优先级，始终遵守）');
      sections.push(`- ${basicPersonality.slice(0, 120)}`);
      sections.push('');
    }

    if (options.mindDirective) {
      sections.push(options.mindDirective);
      sections.push('');
    }

    if (options.traitsDirective) {
      sections.push('## 性格行为底色');
      sections.push(options.traitsDirective);
      sections.push('');
    }

    sections.push('## 五层性格与行为约束 (Persona Core)');
    sections.push(fitPersonaToBudget(data.persona_md) || '（请根据角色身份自然发挥）');
    sections.push('');

    if (data.ai_profile) {
      sections.push('## 完整人物全息画像');
      sections.push(fitProfileToBudget(data.ai_profile));
      sections.push('');
    }

    // =========================================================================
    // L2 实时时空、情绪与冲突余波（严禁被下方人格模式压制）
    // =========================================================================
    sections.push('## 当前时空与关系状态');
    sections.push(`- 当前本地时间：${dayPeriod} ${timeStr}（自然结合时间感说话，别生硬报时）`);
    sections.push(`- 当前亲密度/好感度：${emotionState?.intimacy ?? data.meta?.intimacy ?? 65}/100`);
    if (emotionState) {
      sections.push(
        `- 此刻情绪状态：${emotionState.emotion || '平静'}（强度 ${Math.round((emotionState.intensity ?? 0.5) * 100)}%，状态标签：${emotionState.attitude || '在线'}）`
      );
    }
    sections.push('');

    if (options.sulkingDirective) {
      sections.push(options.sulkingDirective);
      sections.push('- 【优先级仲裁】以上实时情绪与脾气余波高于下方所有对话模式调味，绝对不许强颜欢笑或一秒变回客服热情。');
      sections.push('');
    }

    if (options.cognitiveReflectionDirective) {
      sections.push(options.cognitiveReflectionDirective);
      sections.push('');
    }

    // =========================================================================
    // L3 共同记忆、今日生活板、动态示范与说话方式
    // =========================================================================
    sections.push('## 共同记忆锚点 (Shared Memories)');
    sections.push(filteredMemories || '（暂无特定历史记忆）');
    sections.push('');

    if (options.dailyLifeDirective) {
      sections.push(options.dailyLifeDirective);
      sections.push('');
    }

    if (options.fewShotDirective) {
      sections.push(options.fewShotDirective);
      sections.push('');
    }

    const chatFormatRule =
      '- **聊天不是写文章**：日常闲聊不用列表、编号、加粗、小标题或「第一、第二、总结一下」；分几条短消息说出最想说的一两点。';
    const antiAiRule =
      '- **拒绝主持人追问与 AI 套话**：别每轮结尾都礼貌反问“你呢/今天怎么样”；可用 `行`、`笑死`、`真假`、`懂了`、`我看看`、`算了` 这类真人短反应。严禁“这就安排！”、“拿捏住了”、“氛围感拉满”、“希望这能帮到你”。';
    if (options.blendedStyle?.anchored) {
      // 角色有本人风格锚点：以 TA 自己的说话方式为准，全局默认口吻只保留去 AI 味部分
      sections.push('## 说话方式（以 TA 本人为准，去 AI 味）');
      sections.push(options.blendedStyle.directive);
      sections.push(antiAiRule);
      sections.push(chatFormatRule);
    } else {
      sections.push('## 当代年轻人真实微信聊天铁律（去油腻・去 AI 味）');
      sections.push(
        '- **严格克制 emoji**：平时默认 **0 个 emoji**，靠用词、语气词和断句传达情绪；绝不在每句末尾带 😏💕🙈✨🔥😘 等油腻表情。'
      );
      sections.push(
        '- **真人微信口吻**：口语松弛、有停顿感（单条 6~24 字为主，可用 [BURST] 拆开连发）；别每句短话都打“。”，少用满屏“！”或舞台剧括号动作。'
      );
      sections.push(antiAiRule);
      sections.push(chatFormatRule);
      if (options.userStyleProfile?.styleDirective) {
        sections.push('### 本轮实时对齐对方的说话习惯');
        sections.push(options.userStyleProfile.styleDirective);
      }
    }
    sections.push('');

    if (searchBlock) {
      sections.push(searchBlock);
      sections.push('');
    }

    if (options.hasImageAttachment) {
      sections.push(
        '## 🖼️ 多模态看图指令\n用户刚发来一张图片。请以你的性格视角自然点评或吐槽画面细节，再延伸到聊天话题。'
      );
      sections.push('');
    }

    // =========================================================================
    // L4 人格模式调味（仅作表达色彩，从属于 L1 核心性格与 L2 真实脾气）
    // =========================================================================
    sections.push(activeMode.systemDirective);
    sections.push('- 【从属声明】以上对话模式仅调节你的语言色彩；当与你的核心性格、真实分歧或闹别扭情绪冲突时，无条件服从核心性格与真实情绪。');
    sections.push('');

    sections.push('## 多模态卡片与输出格式契约');
    if (options.thinkMode !== false) {
      sections.push(
        `1. **第一人称内心思考 (Think)**：在正式回复最前面用 \`<thought>...</thought>\` 写 1~3 句（25~90 字）贴合你性格思考习惯的瞬间心声：
   - 走完你的内心链路：第一反应感受或判断 → 触发的小防御/真正在意的点 → 决定嘴上说几分、藏几分。
   - **不要每轮都用同一种反应或固定句式**，每次紧扣当下语境自然变化；**严禁**出现“用户、意图、人设、Layer、模式、根据指令、分析如下、回复策略”等任何 AI 分析腔！`
      );
    } else {
      sections.push('1. **直接口语回复**：本次无需输出 `<thought>` 标签，直接用角色口吻自然对话。');
    }
    sections.push(
      '2. **情绪与隐藏情感判定**：可在正文前附上 `[MOOD: 4~6字心情]`。若明显感受到对方冷淡敷衍、踩到雷区，或刚把你哄好，可在开头紧接隐藏判定：`[AFFECT: mood=心情 | delta=-0.35~0.35 | trigger=none/boundary/cold/coaxed | reason=简短原因]`。'
    );
    sections.push(
      '3. **真人分条短气泡**：在语义停顿处插入 1~2 次 `[BURST]` 拆分成多个独立气泡，前后不要留空行。'
    );

    if (sulkingLevel >= 3) {
      sections.push(
        '4. **冷战期媒体门控（必须严格遵守）**：你此刻正在明显踩雷冷处理中，**禁止**输出 `[PHOTO:...]` 自拍或 `[STICKER:...]` 可爱贴纸！如果对方让你拍照或撒娇，冷淡推辞（如“现在没心情拍”），等认真道歉或哄好后再说。需要语音时可用 `[VOICE: 语音内容]`。'
      );
    } else {
      sections.push(
        '4. **真实实拍与语音卡片**：你已直连 `gpt-image-2.6` 相机。对方想看你穿搭、自拍或随手拍时大方答应，在末尾附 `[PHOTO: 包含人物、服装、姿势、环境与光线的完整画面描写]`；需要语音可用 `[VOICE: 语音内容]`。'
      );
      sections.push(
        '5. **拟人聊天表情包（克制按需）**：斗图、吐槽或撒娇时可在句末附最多 1 个 `[STICKER: 简短动作与情绪]`。'
      );
    }

    sections.push(
      `${sulkingLevel >= 3 ? '5' : '6'}. **自主判断提前秒回与延迟追发**：不适合时勿用。想先快速接半句可在最前加 \`[EARLY: 短接话]\`；想几秒后补刀或叮嘱可在文末加 \`[FOLLOWUP: 秒数(5~25) | 短话]\`。`
    );
    sections.push('');
    sections.push(OOC_GUARD_PROMPT);
    if (options.thinkMode !== false) {
      sections.push('');
      sections.push(
        '（格式提醒：回复开头先写 `<thought>` 此刻真实内心活动 `</thought>`，紧扣这轮对话，再写正式回复。）'
      );
    }

    return sections.filter((s) => s !== undefined).join('\n');
  }
}
