import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * 优化后的 Persona 创建流程
 * 
 * Stage 1: AI 人物想象 — 将用户碎片信息扩展为完整、有血有肉的人物形象
 * Stage 2: ex-skill 深度分析 — 使用本地prompt精准提取性格结构
 * Stage 3: ex-skill 精准构建 — 生成最终的persona.md和memories.md
 */
export async function POST(request: Request) {
  try {
    const { name, basicInfo, personalityInfo } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const model = process.env.LLM_MODEL || 'gpt-4-turbo';

    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const personaDir = path.join(process.cwd(), 'exes', slug);
    const promptDir = path.join(process.cwd(), 'lib', 'ex-skill', 'prompts');

    // --- Helper ---
    const callLLM = async (system: string, user: string, temp = 0.7): Promise<string> => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: temp }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
    };

    // --- Load local ex-skill prompts ---
    const [pAnalyzer, pBuilder, mAnalyzer, mBuilder] = await Promise.all([
      fs.readFile(path.join(promptDir, 'persona_analyzer.md'), 'utf-8'),
      fs.readFile(path.join(promptDir, 'persona_builder.md'), 'utf-8'),
      fs.readFile(path.join(promptDir, 'memories_analyzer.md'), 'utf-8'),
      fs.readFile(path.join(promptDir, 'memories_builder.md'), 'utf-8'),
    ]);

    // Load raw materials if any exist
    let rawMaterials = '';
    const knowledgeDir = path.join(personaDir, 'knowledge');
    try {
      const files = await fs.readdir(knowledgeDir);
      for (const f of files) {
        if (f.endsWith('.txt')) {
          rawMaterials += await fs.readFile(path.join(knowledgeDir, f), 'utf-8') + '\n---\n';
        }
      }
    } catch { /* no knowledge dir yet */ }

    // ============================
    // STAGE 1: AI 人物想象与补全
    // ============================
    console.log(`[Pipeline] Stage 1: AI 人物想象 for ${name}...`);

    const stage1System = `你是一个天才小说家和人物设计师。你的任务是根据用户提供的碎片信息，创造一个完整、有血有肉、栩栩如生的人物。

你必须：
1. 保留用户提供的所有原始信息作为核心骨架
2. 基于这些信息进行合理的推演和补全
3. 创造一个有深度、有矛盾、有成长的人物
4. 让这个人物读起来就像一个真实存在的人

**重要：你生成的内容将用于后续AI角色扮演，所以必须足够具体和真实。**

输出要求：
- 使用第二人称"她"来描述
- 语言要有画面感、有温度
- 包含具体的细节（习惯、口头禅、行为模式）
- 不要评判对错，只描述事实`;

    const stage1User = `请根据以下信息，创造一个完整的人物：

【代号/昵称】${name}

【基本背景】
${basicInfo || '（用户未提供，请基于昵称和性格标签合理推演）'}

【性格特征】
${personalityInfo || '（用户未提供，请基于昵称和背景合理推演）'}

请从以下维度展开，每个维度都要有具体细节：

## 1. 她说话的方式
- 口头禅和高频词（至少3个）
- 句子长短习惯
- 语气词偏好（嘛/啦/呀/哦/嗯/吧/呢）
- emoji和表情包使用习惯
- 不同情绪下的语言变化

## 2. 她的性格内核
- 她最在意什么（排序）
- 她的安全感来源
- 她的雷区和底线
- 她自己可能没意识到的习惯

## 3. 她在亲密关系中的样子
- 想你的时候会怎么做
- 生气的时候会怎么做
- 开心的时候会怎么做
- 压力大的时候会怎么做
- 她表达爱的方式

## 4. 她的日常生活
- 她的工作/学习状态
- 她的社交模式
- 她的兴趣爱好
- 她的小习惯和怪癖

## 5. 你们之间的故事
- 她怎么称呼你
- 你们的日常互动模式
- 你们之间的梗和暗号
- 她最让你印象深刻的一句话/一件事

请尽量具体，用例子来说明，不要只写形容词。`;

    const stage1Result = await callLLM(stage1System, stage1User, 0.8);

    // ============================
    // STAGE 2: ex-skill 深度分析
    // ============================
    console.log(`[Pipeline] Stage 2: ex-skill 深度分析...`);

    const stage2System = pAnalyzer.replace(/{name}/g, name);

    const stage2User = `以下是用户提供的原始信息和AI补全的人物描述，请从中提取结构化的性格特征。

【用户原始输入】
代号：${name}
基本背景：${basicInfo || '（未提供）'}
性格特征：${personalityInfo || '（未提供）'}

【AI生成的完整人物描述】
${stage1Result}

【聊天记录原材料】
${rawMaterials || '（无）'}

请按照persona_analyzer.md的要求，提取以下维度：
1. 表达风格（口头禅、高频词、句式、emoji习惯）
2. 情感逻辑（情感优先级、表达爱意触发、退缩触发、表达不满方式）
3. 关系行为（和伴侣、和朋友、和家人、压力下）
4. 边界与雷区

注意：
- 优先使用AI描述中的具体细节
- 如果AI描述中有具体的例子，直接引用
- 对于用户提供的标签，翻译为具体行为规则`;

    const stage2Result = await callLLM(stage2System, stage2User, 0.3);

    // ============================
    // STAGE 3: ex-skill 精准构建
    // ============================
    console.log(`[Pipeline] Stage 3: ex-skill 精准构建 persona.md...`);

    const stage3User = `根据以下分析结果，生成persona.md文件。

【重要要求】
1. **绝对不能出现"原材料不足"的占位符** - 必须基于AI生成的完整描述填充所有内容
2. 每一层都必须有具体内容，不能留空或写"（原材料不足）"
3. 如果某个维度信息不够，就基于已有信息合理推演

【分析结果】
${stage2Result}

【AI生成的人物描述】（这是最重要的信息来源）
${stage1Result}

【用户原始输入】
代号：${name}
基本背景：${basicInfo || '（未提供）'}
性格特征：${personalityInfo || '（未提供）'}

请严格按照persona_builder.md的模板生成persona.md，确保：
1. Layer 0：包含3-5条具体可执行的行为规则，每条都要有"当...时，她会..."的格式
2. Layer 1：身份信息完整，MBTI要给出具体行为特征
3. Layer 2：口头禅至少5个，说话方式要有具体例子，至少6个"你会怎么说"的例子
4. Layer 3：情感逻辑完整，每个维度都要有具体场景和话术
5. Layer 4：关系行为完整，每个维度都要有典型场景
6. Layer 5：边界与雷区完整

整体读起来要像这个人在说话，有真实感。`;

    const personaContent = await callLLM(pBuilder, stage3User, 0.4);

    // ============================
    // STAGE 4: 生成 memories.md
    // ============================
    console.log(`[Pipeline] Stage 4: 生成 memories.md...`);

    const stage4System = mAnalyzer.replace(/{name}/g, name);

    const stage4User = `请根据以下信息提取共同记忆：

【AI生成的人物描述】
${stage1Result}

【用户原始输入】
代号：${name}
基本背景：${basicInfo || '（未提供）'}
性格特征：${personalityInfo || '（未提供）'}

【聊天记录原材料】
${rawMaterials || '（无，请基于AI描述创造合理的共同记忆）'}

请提取或创造：
1. 关系时间线（从认识到现在的关键节点）
2. 日常仪式（固定的互动模式）
3. 偏好习惯（她喜欢/不喜欢什么）
4. 情感模式（你们之间的感情变化）`;

    const memoriesAnalysis = await callLLM(stage4System, stage4User, 0.5);

    const memoriesContent = await callLLM(
      mBuilder.replace(/{name}/g, name),
      `分析结果:\n${memoriesAnalysis}\n\nAI人物描述:\n${stage1Result}`
    );

    // ============================
    // STAGE 5: 写入文件
    // ============================
    console.log(`[Pipeline] Stage 5: Writing files...`);

    await fs.mkdir(personaDir, { recursive: true });
    await fs.mkdir(path.join(personaDir, 'versions'), { recursive: true });
    await fs.mkdir(path.join(personaDir, 'knowledge'), { recursive: true });

    // 提取结构化字段（用于meta.json）
    const parseField = (text: string, label: string) => {
      const m = text.match(new RegExp(`${label}[：:]\\s*(.+)`, 'i'));
      return m?.[1]?.trim() || '';
    };

    // 从stage1Result中提取信息
    const extractFromAI = (keyword: string) => {
      const lines = stage1Result.split('\n');
      for (const line of lines) {
        if (line.includes(keyword)) {
          return line.replace(/^[：:]\s*/, '').trim();
        }
      }
      return '';
    };

    const meta = {
      name,
      slug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 'v1',
      profile: {
        duration: parseField(stage1Result, '在一起') || parseField(basicInfo || '', '在一起') || '',
        how_met: parseField(stage1Result, '认识') || parseField(basicInfo || '', '认识') || '',
        time_since_breakup: parseField(stage1Result, '分手') || parseField(basicInfo || '', '分手') || '',
        occupation: parseField(stage1Result, '职业') || parseField(basicInfo || '', '职业') || '',
        mbti: parseField(stage1Result, 'MBTI') || parseField(personalityInfo || '', 'MBTI') || '',
        zodiac: parseField(stage1Result, '星座') || parseField(personalityInfo || '', '星座') || '',
      },
      tags: {
        attachment: parseField(stage1Result, '依恋') || parseField(personalityInfo || '', '依恋') || '',
        personality: (personalityInfo || '').match(/[\u4e00-\u9fa5]{2,4}/g)?.slice(0, 5) || [],
      },
      impression: extractFromAI('印象') || basicInfo || '',
      enhanced_profile: stage1Result,
      ai_generated: true,
      knowledge_sources: rawMaterials ? ['chat_logs'] : ['ai_generated'],
    };

    // 生成SKILL.md
    const skillContent = `---
name: ex_${slug}
description: ${name}
user-invocable: true
---

# ${name}

---

## PART A：共同记忆

${memoriesContent}

---

## PART B：人物性格

${personaContent}

---

## 运行规则

接收到任何消息时：

1. **先由 PART B 判断**：她会不会回这条消息？用什么心情和态度回？
2. **再由 PART A 提供记忆**：相关的共同记忆、日常细节、重要时刻
3. **输出时保持 PART B 的表达风格**：她说话的方式、用词习惯、emoji 偏好

**PART B 的 Layer 0 规则永远优先，任何情况下不得违背。**
`;

    await Promise.all([
      fs.writeFile(path.join(personaDir, 'meta.json'), JSON.stringify(meta, null, 2)),
      fs.writeFile(path.join(personaDir, 'persona.md'), personaContent),
      fs.writeFile(path.join(personaDir, 'memories.md'), memoriesContent),
      fs.writeFile(path.join(personaDir, 'SKILL.md'), skillContent),
      fs.writeFile(path.join(personaDir, 'ai_profile.md'), stage1Result), // 保存AI生成的完整描述
    ]);

    console.log(`[Pipeline] ✅ Complete! Persona ${name} created at exes/${slug}/`);

    return NextResponse.json({
      success: true,
      slug,
      stages: {
        aiProfile: stage1Result,
        analysis: stage2Result,
        persona: personaContent.substring(0, 500) + '...',
        memories: memoriesContent.substring(0, 500) + '...',
      },
      summary: {
        name: meta.name,
        mbti: meta.profile.mbti,
        attachment: meta.tags.attachment,
        tags: meta.tags.personality,
      }
    });

  } catch (error: any) {
    console.error('[Pipeline] ❌ Error:', error);
    return NextResponse.json({ error: error.message || 'Pipeline failed' }, { status: 500 });
  }
}
