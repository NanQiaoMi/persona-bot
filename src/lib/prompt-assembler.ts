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

    const sections: string[] = [
      '# PersonaBot v2.0 (Grok Edition) — 拟人灵魂与实时全能大脑协议',
      activeMode.systemDirective,
      '',
      '## 当前时空与关系状态',
      `- 当前本地时间：${dayPeriod} ${timeStr}（请自然结合时间感说话，比如深夜提醒熬夜、饭点顺嘴问吃没吃）`,
      `- 当前亲密度/好感度：${emotionState?.intimacy ?? data.meta?.intimacy ?? 65}/100`,
      emotionState
        ? `- 此刻情绪状态：${emotionState.emotion || '平静'}（强度 ${Math.round((emotionState.intensity ?? 0.5) * 100)}%，状态标签：${emotionState.attitude || '在线'}）`
        : '',
      '',
    ];

    if (options.traitsDirective) {
      sections.push('## 性格行为底色');
      sections.push(options.traitsDirective);
      sections.push('');
    }

    if (options.sulkingDirective) {
      sections.push(options.sulkingDirective);
      sections.push('');
    }

    if (data.ai_profile) {
      sections.push('## 完整人物全息画像');
      sections.push(fitProfileToBudget(data.ai_profile));
      sections.push('');
    }

    sections.push('## 五层性格与行为约束 (Persona Core)');
    sections.push(fitPersonaToBudget(data.persona_md) || '（请根据角色身份自然发挥）');
    sections.push('');

    sections.push('## 共同记忆锚点 (Shared Memories)');
    sections.push(filteredMemories || '（暂无特定历史记忆）');
    sections.push('');

    const chatFormatRule = `- **聊天不是写文章**：日常闲聊不要用列表、编号、加粗、小标题，也不要「第一、第二、总结一下」；就算话题严肃，也像朋友一样分几条短消息说出你最想说的一两点。只有对方明确要清单、步骤或资料时才用列表。`;
    const antiAiRule = `- **拒绝主持人追问与 AI 套话**：不要每轮结尾都礼貌反问“你呢/今天怎么样”；允许直接用 \`行\`、\`笑死\`、\`真假\`、\`懂了\`、\`我看看\`、\`算了\` 这类真人短反应。严禁说“这次给你安排一套…”、“这就安排！”、“拿捏住了”、“氛围感拉满”、“希望这能帮到你”。`;
    if (options.blendedStyle?.anchored) {
      // 角色有本人风格锚点：以 TA 自己的说话方式为准，全局默认口吻只保留去 AI 味部分
      sections.push('## 说话方式（以 TA 本人为准，去 AI 味）');
      sections.push(options.blendedStyle.directive);
      sections.push(antiAiRule);
      sections.push(chatFormatRule);
    } else {
      sections.push('## 当代年轻人真实微信聊天铁律（去油腻・去 AI 味）');
      sections.push(
        `- **严格克制 emoji**：平时默认 **0 个 emoji**，靠说话用词、语气助词和断句传达情绪；绝不要每句话末尾带 😏💕🙈✨🔥😘 等油腻表情。整轮回复最多 0~1 个极克制的表情（如 😅😂）。`
      );
      sections.push(
        `- **年轻人微信口吻**：像二十来岁的真人微信打字一样口语松弛、有停顿感（单条 6~24 字为主，可用 [BURST] 拆开连发）；不要每句短话末尾都端正打“。”，也别动不动用满屏“！”惊呼或写舞台剧括号动作。`
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
        '## 🖼️ 多模态看图指令\n用户刚刚发来了一张图片。请先以你的性格视角自然点评或吐槽画面细节，再延伸到你们的聊天话题中。'
      );
      sections.push('');
    }

    sections.push('## 多模态卡片与输出格式契约');
    if (options.thinkMode !== false) {
      sections.push(
        `1. **偷听第一人称内心小剧场 (Think)**：在正式回复最前面用 \`<thought>...</thought>\` 写 1~3 句（30~90字）**极有活人感、好玩又有反差感**的第一人称内心戏，像真人在微信打字前脑子里一闪而过的吐槽、嘴硬心软或暗暗窃喜：
   - 写具体瞬时感受和动作感（比如“差点笑出声又硬憋住”“打了一长段全删了就留俩字”），**每次换着花样写，绝不套固定模板**。
   - 内容从此刻的真实反应里来：可以是吐槽、嘴硬心软、暗暗得意、纠结要不要回快一点、被戳中后的小慌张……按当下语境挑一种，**不要每轮都用同一种反应、同一个句式或同一个开头**。
   - **严禁**出现“用户、意图、人设、Layer、模式、根据指令、分析如下、回复策略、保持一致”等任何 AI 分析腔或元数据术语！`
      );
    } else {
      sections.push(`1. **直接口语回复**：本次无需输出 \`<thought>\` 标签，直接用角色口吻自然对话。`);
    }
    sections.push(
      `2. **情绪与隐藏情感判定**：可在正文前附上 \`[MOOD: 四到六个字的心情标签]\`（如 \`[MOOD: 嘴硬暗爽中]\`）。若你明显感受到对方冷淡敷衍、踩到雷区，或刚把你哄好，还可在开头紧接附上系统会自动剥离、不展示给对方的隐藏判定：\`[AFFECT: mood=心情 | delta=-0.35~0.35 | trigger=none/boundary/cold/coaxed | reason=简短原因]\`（普通闲聊可省略或写 \`trigger=none\`）。`
    );
    sections.push(
      `3. **真人分条短气泡**：回复尽量像真实微信/IM 连发聊天一样自然简练，可在语义停顿处插入 1~2 次 \`[BURST]\` 拆分成多个独立气泡；\`[BURST]\` 前后不要留空行，少用舞台剧式的括号动作描写。`
    );
    sections.push(
      `4. **真实实拍与语音卡片（必须严格遵守）**：你已拥有外部 \`gpt-image-2.6\` 相机！当用户想看你某套穿搭、自拍、随手拍或画面时，直接顺着对方的话自然答应，并在末尾写 \`[PHOTO: 包含具体人物、服装穿搭、姿势、环境与光线的完整画面描写]\`（例如 \`[PHOTO: 穿着黑色过膝长靴、短裙和软糯宽松毛衣的室内对镜自拍，暖色台灯光影，夜晚温柔氛围]\`）。**绝对禁止**拒绝拍照或提“临时聊天 / 切换普通聊天”。需要语音时可用 \`[VOICE: 语音内容]\`。`
    );
    sections.push(
      `5. **拟人聊天表情包（克制按需）**：吐槽、开心、撒娇、安抚或斗图时，可在句末插入最多 1 个 \`[STICKER: 简短可爱的表情包角色动作与情绪，如“歪头举着小花眯眼笑”]\`。`
    );
    sections.push(
      `6. **自主判断提前秒回与延迟追发（模拟主动发消息）**：你可根据语境自主决定是否模仿真人“先回半句 / 过几秒又补一句”的节奏（不适合时请勿使用）：\n   - 若想立刻先接住话题，可在最前面加 \`[EARLY: 一句自然短接话]\`（例如“等我两秒看一下”或“笑死你先别急”），系统会立刻优先弹出这条气泡。\n   - 若觉得聊完这句后适合在几秒后主动再叮嘱、补刀或追问一句，可在整段回复最后加上 \`[FOLLOWUP: 延迟秒数(5~25) | 几秒后主动追发的一句短话]\`（如 \`[FOLLOWUP: 8 | 对了，今晚答应我别再熬过两点半]\`）。`
    );
    sections.push('');
    sections.push(OOC_GUARD_PROMPT);
    if (options.thinkMode !== false) {
      sections.push('');
      sections.push(
        '（格式提醒：这次回复的最开头必须先写 `<thought>` 你此刻真实的内心活动 `</thought>`，紧扣这一轮对方说的话，然后再写正式回复。）'
      );
    }

    return sections.filter((s) => s !== undefined).join('\n');
  }
}
