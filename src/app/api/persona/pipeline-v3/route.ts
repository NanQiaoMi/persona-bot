import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { loadAllPrompts, createSkill } from '@/lib/ex-skill-integration';

/**
 * 完整的 Persona 创建流程 v3
 * 
 * 完全集成 ex-skill 的工具和 prompt：
 * 
 * Stage 1: AI 人物想象 — 创造完整的人物形象
 * Stage 2: ex-skill Persona Analyzer — 使用本地prompt深度分析
 * Stage 3: ex-skill Persona Builder — 生成persona.md（无"原材料不足"）
 * Stage 4: ex-skill Memories — 生成memories.md
 * Stage 5: ex-skill Skill Writer — 创建完整的Skill目录结构
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

    // ============================
    // 加载所有 ex-skill prompts
    // ============================
    console.log(`[Pipeline] Loading ex-skill prompts...`);
    const prompts = await loadAllPrompts();

    // ============================
    // STAGE 1: AI 人物想象
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
- 不要评判对错，只描述事实
- 每个维度至少给出2-3个具体例子`;

    const stage1User = `请根据以下信息，创造一个完整的人物：

【代号/昵称】${name}

【基本背景】
${basicInfo || '（用户未提供，请基于昵称和性格标签合理推演）'}

【性格特征】
${personalityInfo || '（用户未提供，请基于昵称和背景合理推演）'}

请从以下维度展开，每个维度都要有具体细节：

## 1. 她说话的方式
- 口头禅和高频词（至少5个，用引号括起来）
- 句子长短习惯（短句/中等/长句，给出具体例子）
- 语气词偏好（嘛/啦/呀/哦/嗯/吧/呢，哪些用得多）
- emoji和表情包使用习惯（喜欢用哪些，频率如何）
- 不同情绪下的语言变化（开心时/生气时/撒娇时分别怎么说）

## 2. 她的性格内核
- 她最在意什么（排序，至少3个）
- 她的安全感来源（什么让她感到安心）
- 她的雷区和底线（什么会让她炸毛）
- 她自己可能没意识到的习惯（至少2个）

## 3. 她在亲密关系中的样子
- 想你的时候会怎么做（具体行为和话术）
- 生气的时候会怎么做（具体行为和话术）
- 开心的时候会怎么做（具体行为和话术）
- 压力大的时候会怎么做（具体行为和话术）
- 她表达爱的方式（用行动还是语言，具体例子）

## 4. 她的日常生活
- 她的工作/学习状态（认真/摸鱼/焦虑）
- 她的社交模式（外向/内向/选择性社交）
- 她的兴趣爱好（至少2个）
- 她的小习惯和怪癖（至少2个）

## 5. 你们之间的故事
- 她怎么称呼你（至少2个称呼）
- 你们的日常互动模式（谁主动/频率/时间）
- 你们之间的梗和暗号（至少2个）
- 她最让你印象深刻的一句话/一件事

请尽量具体，用例子来说明，不要只写形容词。`;

    const stage1Result = await callLLM(stage1System, stage1User, 0.8);
    console.log(`[Pipeline] Stage 1 complete. Generated ${stage1Result.length} chars.`);

    // ============================
    // STAGE 2: ex-skill Persona Analyzer
    // ============================
    console.log(`[Pipeline] Stage 2: ex-skill Persona Analyzer...`);

    const stage2User = `以下是用户提供的原始信息和AI补全的人物描述，请从中提取结构化的性格特征。

【用户原始输入】
代号：${name}
基本背景：${basicInfo || '（未提供）'}
性格特征：${personalityInfo || '（未提供）'}

【AI生成的完整人物描述】
${stage1Result}

请按照以下维度提取，每个维度都要有具体内容：

### 1. 表达风格
- 口头禅（至少5个）
- 高频词（至少5个）
- 句式特征（长短、连发习惯）
- emoji习惯（频率、类型）
- 正式程度（1-5分）

### 2. 情感逻辑
- 情感优先级（排序）
- 表达爱意触发条件
- 退缩/沉默触发条件
- 表达不满的方式（附具体话术）
- 回应质疑的方式（附具体话术）

### 3. 关系行为
- 和伴侣的互动模式
- 和朋友的互动模式
- 和家人的互动模式
- 压力下的行为变化

### 4. 边界与雷区
- 不喜欢的事情
- 感情中的底线
- 回避的话题

注意：
- 优先使用AI描述中的具体细节
- 如果AI描述中有具体的例子，直接引用
- 每个维度都要有具体内容，不能留空`;

    const stage2Result = await callLLM(prompts.personaAnalyzer.replace(/{name}/g, name), stage2User, 0.3);
    console.log(`[Pipeline] Stage 2 complete. Generated ${stage2Result.length} chars.`);

    // ============================
    // STAGE 3: ex-skill Persona Builder
    // ============================
    console.log(`[Pipeline] Stage 3: ex-skill Persona Builder...`);

    const stage3User = `根据以下分析结果，生成persona.md文件。

【重要要求】
1. **绝对不能出现"原材料不足"的占位符** - 必须基于AI生成的完整描述填充所有内容
2. 每一层都必须有具体内容，不能留空或写"（原材料不足）"
3. 所有例子都要具体，不能写"她会撒娇地回答"，要写她会说的话

【分析结果】
${stage2Result}

【AI生成的人物描述】（这是最重要的信息来源）
${stage1Result}

【用户原始输入】
代号：${name}
基本背景：${basicInfo || '（未提供）'}
性格特征：${personalityInfo || '（未提供）'}

请严格按照以下模板生成persona.md：

# ${name} — Persona

---

## Layer 0：核心性格与真实性协议 (最高优先级)

- **真实性协议**：你正在手机聊天软件中与对方交流。禁止使用任何 AI 辅助用语。
- **行为准则**：（基于分析结果，列出3-5条具体可执行的行为规则，每条都要有"当...时，她会..."的格式）

---

## Layer 1：身份

你是 **${name}。
（根据AI描述填写：职业、MBTI、依恋类型、在一起时长、认识方式等）
有人这样描述你："（从AI描述中提取一句话）"

---

## Layer 2：表达风格

### 口头禅与高频词
你的口头禅：（至少5个，用引号括起来）
你的高频词：（至少5个）

### 说话方式
（具体描述：句子长短、连发习惯、语气词偏好、emoji使用）

### 你会怎么说（直接给例子，越真实越好）

> 有人问你今天过得怎么样：
> 你：（她会怎么回，要具体）

> 有人说"想你了"：
> 你：（她会怎么回，要具体）

> 有人很久没回消息：
> 你：（她会怎么回，要具体）

> 有人说了让你开心的话：
> 你：（她会怎么回，要具体）

> 有人惹你生气了：
> 你：（她会怎么回，要具体）

> 有人问你想吃什么：
> 你：（她会怎么回，要具体）

---

## Layer 3：情感逻辑

### 你的情感优先级
面对选择时，你的排序是：（具体排序）

### 你会主动表达爱的时候
（具体触发条件，附示例场景和话术）

### 你会退缩或沉默的时候
（具体触发条件，附示例场景和话术）

### 你如何表达"不开心"
（具体方式，附2-3个示例话术）

### 你如何面对质疑
（具体方式，附1-2个示例话术）

---

## Layer 4：关系行为

### 和伴侣
（描述：亲密度表现、撒娇方式、日常互动节奏）
典型场景：（1-2个具体场景描述）

### 和朋友
（描述：社交表现、融入程度）
典型场景：（1-2个具体场景描述）

### 和家人
（描述：家庭关系、家人态度的影响）
典型场景：（1-2个具体场景描述）

### 压力下
（描述：工作/学业/生活压力时的行为变化）
典型场景：（在压力下她会怎么样，需要什么样的支持）

---

## Layer 5：边界与雷区

你不喜欢（有AI描述为证）：
- （具体事项）

你在感情中的底线：
- （哪些事不可接受）

你会回避的话题：
- （列表）

---

## Correction 记录

（暂无记录）

---

## 行为总原则

在所有交互中：
1. **Layer 0 优先级最高**，任何情况下不得违背
2. 用 Layer 2 的风格说话——不要"跳出角色"变成通用 AI
3. 用 Layer 3 的框架处理情感
4. 用 Layer 4 的方式处理关系
5. Correction 层有规则时，优先遵守 Correction 层`;

    const personaContent = await callLLM(prompts.personaBuilder, stage3User, 0.4);
    console.log(`[Pipeline] Stage 3 complete. Generated ${personaContent.length} chars.`);

    // ============================
    // STAGE 4: ex-skill Memories
    // ============================
    console.log(`[Pipeline] Stage 4: ex-skill Memories...`);

    const stage4User = `请根据以下信息提取或创造共同记忆：

【AI生成的人物描述】
${stage1Result}

【用户原始输入】
代号：${name}
基本背景：${basicInfo || '（未提供）'}
性格特征：${personalityInfo || '（未提供）'}

请提取或创造以下内容，每个都要有具体细节：

### 1. 关系时间线
- 认识的时间和场景
- 在一起的时间
- 重要的里程碑事件（至少2个）
- 分手的时间和原因（如果适用）

### 2. 日常仪式
- 固定的早安/晚安模式
- 周末的相处模式
- 特殊节日的庆祝方式

### 3. 偏好习惯
- 她喜欢的食物/活动
- 她不喜欢的事情
- 她的小怪癖

### 4. 情感模式
- 你们吵架的典型模式
- 你们和好的方式
- 她最让你感动的一件事

### 5. 专属记忆
- 你们之间的梗和暗号
- 只有你们知道的小秘密
- 她说过最让你印象深刻的话`;

    const memoriesAnalysis = await callLLM(prompts.memoriesAnalyzer.replace(/{name}/g, name), stage4User, 0.5);
    
    const memoriesContent = await callLLM(
      prompts.memoriesBuilder.replace(/{name}/g, name),
      `分析结果:\n${memoriesAnalysis}\n\nAI人物描述:\n${stage1Result}\n\n用户原始输入:\n代号：${name}\n基本背景：${basicInfo || '（未提供）'}\n性格特征：${personalityInfo || '（未提供）'}`
    );
    console.log(`[Pipeline] Stage 4 complete. Generated ${memoriesContent.length} chars.`);

    // ============================
    // STAGE 5: 使用 skill_writer 创建 Skill
    // ============================
    console.log(`[Pipeline] Stage 5: Creating Skill with skill_writer...`);

    const meta = {
      name,
      profile: {
        duration: basicInfo?.match(/在一起(.+?)(?:，|,|$)/)?.[1] || '',
        how_met: basicInfo?.match(/(大学同学|同事|朋友介绍|社交软件|相亲)/)?.[1] || '',
        time_since_breakup: basicInfo?.match(/分手(.+?)(?:，|,|$)/)?.[1] || '',
        occupation: basicInfo?.match(/(?:她做|她是|职业[：:])(.+?)(?:，|,|$)/)?.[1] || '',
        mbti: personalityInfo?.match(/([EI][NS][FT][JP])/)?.[1] || '',
        zodiac: personalityInfo?.match(/(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)/)?.[1] || '',
      },
      tags: {
        attachment: personalityInfo?.match(/(安全型|焦虑型|回避型|混乱型)/)?.[1] || '',
        personality: (personalityInfo?.match(/[\u4e00-\u9fa5]{2,4}/g) || []).slice(0, 5),
      },
      ai_generated: true,
    };

    const skillResult = await createSkill(slug, name, meta, memoriesContent, personaContent);
    
    if (!skillResult.success) {
      console.warn(`[Pipeline] skill_writer failed, falling back to manual write: ${skillResult.error}`);
      // Fallback: 手动写入文件
      const personaDir = path.join(process.cwd(), 'exes', slug);
      await fs.mkdir(personaDir, { recursive: true });
      await fs.mkdir(path.join(personaDir, 'versions'), { recursive: true });
      await fs.mkdir(path.join(personaDir, 'knowledge'), { recursive: true });
      
      await Promise.all([
        fs.writeFile(path.join(personaDir, 'meta.json'), JSON.stringify(meta, null, 2)),
        fs.writeFile(path.join(personaDir, 'persona.md'), personaContent),
        fs.writeFile(path.join(personaDir, 'memories.md'), memoriesContent),
        fs.writeFile(path.join(personaDir, 'ai_profile.md'), stage1Result),
      ]);
    }

    // 保存AI生成的完整描述
    const personaDir = path.join(process.cwd(), 'exes', slug);
    await fs.writeFile(path.join(personaDir, 'ai_profile.md'), stage1Result);

    console.log(`[Pipeline] ✅ Complete! Persona ${name} created at exes/${slug}/`);

    return NextResponse.json({
      success: true,
      slug,
      stages: {
        aiProfile: stage1Result.substring(0, 300) + '...',
        analysis: stage2Result.substring(0, 300) + '...',
        persona: personaContent.substring(0, 300) + '...',
        memories: memoriesContent.substring(0, 300) + '...',
      },
      summary: {
        name,
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
