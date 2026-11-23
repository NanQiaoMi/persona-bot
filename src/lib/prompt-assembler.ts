import { DeepSearchResponse, formatSearchContextForPrompt } from '@/lib/grok/deep-search';
import { getPersonaModeSpec } from '@/lib/grok/persona-modes';
import { OOC_GUARD_PROMPT } from '@/lib/persona/prompts';
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
  emotionSummary?: {
    emotion?: string;
    intensity?: number;
    attitude?: string;
    intimacy?: number;
  };
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
    if (!memories || !lastMessage) return memories;
    const lines = memories.split('\n');
    const keywords = lastMessage
      .toLowerCase()
      .split(/[\s，。！？,.!?]+/)
      .filter((k) => k.length > 1);

    if (keywords.length === 0) return memories;
    const matched = lines.filter((line) =>
      keywords.some((kw) => line.toLowerCase().includes(kw))
    );

    if (matched.length > 0) {
      return `### 当前话题触发的高相关记忆\n${matched.join('\n')}\n\n### 完整记忆底色\n${memories}`;
    }
    return memories;
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

    if (data.ai_profile) {
      sections.push('## 完整人物全息画像');
      sections.push(data.ai_profile);
      sections.push('');
    }

    sections.push('## 五层性格与行为约束 (Persona Core)');
    sections.push(data.persona_md || '（请根据角色身份自然发挥）');
    sections.push('');

    sections.push('## 共同记忆锚点 (Shared Memories)');
    sections.push(filteredMemories || '（暂无特定历史记忆）');
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
    sections.push(
      `1. **内心潜台词 (Think / Inner OS)**：在正式回复前，请先用 \`<thought>这里写你心里真实的潜台词、对用户这句话的情绪反应或刚查完资讯的内心吐槽（40~90字）</thought>\` 包裹你的内心戏。`
    );
    sections.push(
      `2. **情绪标签**：在 \`</thought>\` 之后，可附上 \`[MOOD: 四到六个字的心情标签]\`（如 \`[MOOD: 嘴硬暗爽中]\`）。`
    );
    sections.push(
      `3. **真人分条气泡**：如果回复包含两三句话，在句子之间插入 \`[BURST]\`，系统会像真人连续发微信一样分条弹出气泡。`
    );
    sections.push(
      `4. **情境自拍/语音卡片（按需使用）**：当用户索要照片/自拍或情境非常适合时，可插入 \`[PHOTO: 极具画面感的镜头描述]\`；当适合发语音撒娇或吐槽时，可插入 \`[VOICE: 语音里说的话]\`。`
    );
    sections.push(
      `5. **拟人聊天表情包（克制按需）**：当你在吐槽、开心、撒娇、安抚或用户想斗图时，可在句末插入最多 1 个 \`[STICKER: 简短可爱的表情包角色动作与情绪，如“抱着枕头得意眨眼”]\`，系统会自动调用生图模型绘制成贴纸表情包发给用户。`
    );
    sections.push('');
    sections.push(OOC_GUARD_PROMPT);

    return sections.filter((s) => s !== undefined).join('\n');
  }
}
