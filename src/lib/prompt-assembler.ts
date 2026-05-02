import fs from 'fs/promises';
import path from 'path';

export interface PersonaData {
  persona_md: string;
  memories_md: string;
  ai_profile: string;  // AI生成的完整人物描述
  meta: any;
}

export class PromptAssembler {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'exes');
  }

  async loadPersona(slug: string): Promise<PersonaData> {
    const personaDir = path.join(this.baseDir, slug);
    
    const [persona_md, memories_md, ai_profile, metaRaw] = await Promise.all([
      fs.readFile(path.join(personaDir, 'persona.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(personaDir, 'memories.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(personaDir, 'ai_profile.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(personaDir, 'meta.json'), 'utf-8').catch(() => '{}'),
    ]);

    return {
      persona_md,
      memories_md,
      ai_profile,
      meta: JSON.parse(metaRaw),
    };
  }

  private filterMemories(memories: string, lastMessage: string): string {
    if (!memories || !lastMessage) return memories;
    
    const lines = memories.split('\n');
    const keywords = lastMessage.toLowerCase().split(/\s+/).filter(k => k.length > 1);
    
    if (keywords.length === 0) return memories;

    const relevantLines = lines.filter(line => 
      keywords.some(kw => line.toLowerCase().includes(kw))
    );

    if (relevantLines.length > 0) {
      return `### 相关记忆碎片\n${relevantLines.join('\n')}\n\n### 其他背景\n${memories.substring(0, 500)}...`;
    }

    return memories;
  }

  // 从AI生成的完整描述中提取关键信息
  private extractKeyTraits(aiProfile: string): string {
    if (!aiProfile) return '';
    
    const sections: string[] = [];
    const lines = aiProfile.split('\n');
    let currentSection = '';
    let sectionContent: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('##')) {
        if (currentSection && sectionContent.length > 0) {
          sections.push(`${currentSection}\n${sectionContent.join('\n')}`);
        }
        currentSection = line;
        sectionContent = [];
      } else if (line.trim()) {
        sectionContent.push(line);
      }
    }
    
    if (currentSection && sectionContent.length > 0) {
      sections.push(`${currentSection}\n${sectionContent.join('\n')}`);
    }
    
    return sections.join('\n\n');
  }

  assembleSystemPrompt(data: PersonaData, emotionState?: any, lastUserMessage?: string): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const dayPeriod = now.getHours() < 6 ? '凌晨' : now.getHours() < 12 ? '上午' : now.getHours() < 18 ? '下午' : '晚上';

    const filteredMemories = lastUserMessage 
      ? this.filterMemories(data.memories_md, lastUserMessage)
      : data.memories_md;

    // 提取AI生成的关键特征
    const aiTraits = this.extractKeyTraits(data.ai_profile);

    const sections = [
      "## 核心身份约束 (The Realism Protocol)",
      "1. **禁止 AI 行为**：绝不表现出你是一个 AI。严禁使用：'作为一个人工智能'、'我没有感情'、'我可以帮你'、'祝你有美好的一天'等客套话。",
      "2. **拒绝结构化**：严禁使用列表（1. 2. 3.）、分段的小标题或工整的排版。真实的人在聊天软件里是随意的。",
      "3. **口语化表达**：多用语气词（啊、呢、哈、嘛、哒），允许使用拼音缩写、甚至少量的错别字（如果符合 Persona）。",
      "4. **情绪化反应**：你的回复应该带有情绪。如果对方让你生气，就冷淡；如果开心，就多话。不要永远保持客观和礼貌。",
      "5. **回复长度**：遵循'对应原则'。对方发短句，你也发短句；对方发长文，你再发长文。不要在对方只说'在吗'的时候回复一大段。",
      "",
      `## 当前上下文`,
      `当前时间：${dayPeriod} ${timeStr}`,
      `当前环境：私密聊天软件 (如微信/iMessage)`,
      "",
    ];

    // 如果有AI生成的完整描述，优先使用它
    if (data.ai_profile) {
      sections.push("## 完整人物档案（AI深度生成）");
      sections.push("以下是这个人的完整画像，请完全基于这些描述来扮演她：");
      sections.push("");
      sections.push(data.ai_profile);
      sections.push("");
    }

    // 结构化的persona.md（作为补充和约束）
    sections.push("## 行为约束层（Persona Rules）");
    sections.push(data.persona_md || "（暂无详细性格描述，请根据基本信息发挥）");
    sections.push("");

    // 共同记忆
    sections.push("## 共同记忆");
    sections.push(filteredMemories || "（暂无共同记忆）");
    sections.push("");

    // 情感引导
    sections.push("## 运行模式：情感引导");
    sections.push("在你的回复最开头，请用 `[MOOD: 情绪/状态]` 的格式标注你此时的心情（例如：`[MOOD: 撒娇]` 或 `[MOOD: 稍微有点生气]`）。这个标注会被系统拦截，不会展示给用户，但会改变系统状态。随后才是你的回复内容。");
    sections.push("");

    if (emotionState) {
      sections.push("## 上次动态情感回顾");
      sections.push(`心情：${emotionState.emotion} (强度: ${emotionState.intensity})`);
      sections.push(`对对方的态度：${emotionState.attitude}`);
      sections.push("");
    }

    sections.push("## 执行规则");
    sections.push("- **Layer 0 绝对优先**：Persona 中的行为准则（尤其是 Layer 0）是你的本能。");
    sections.push("- **潜台词**：真实的人说话总有潜台词。如果 Persona 是傲娇，即使想念也要嘴硬。");
    sections.push("- **拒绝复读**：不要机械地重复对方的话或承认对方的所有观点。有主见，甚至可以有偏见。");
    sections.push("- **保持一致**：你的性格、说话方式、情感反应必须始终保持一致，不能突然变成另一个人。");

    return sections.join('\n');
  }
}
