import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * Unified Persona Creation Pipeline
 * 
 * Stage 1: AI Profiling — expand user fragments into structured profile
 * Stage 2: ex-skill Analysis — use local prompts to deeply analyze persona + memories
 * Stage 3: ex-skill Building — generate final persona.md + memories.md
 * Stage 4: Assemble SKILL.md — combine everything into a runnable skill file
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
    const callLLM = async (system: string, user: string, temp = 0.4): Promise<string> => {
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
    const [intakePrompt, pAnalyzer, pBuilder, mAnalyzer, mBuilder] = await Promise.all([
      fs.readFile(path.join(promptDir, 'intake.md'), 'utf-8'),
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
    // STAGE 1: AI Structured Profiling
    // ============================
    console.log(`[Pipeline] Stage 1: AI Structured Profiling for ${name}...`);

    const stage1System = `你是一个资深的人物侧写师和情感分析专家。
你的任务分两步完成：

**第一步：信息结构化**
根据 intake.md 的规范，将用户输入的碎片化信息解析为结构化字段：
${intakePrompt}

**第二步：人物侧写**
基于解析后的结构化字段，用第二人称写一段 400-600 字的深度人物侧写。要求：
- 从"她说话的方式"开篇，给出具体的语气词和句式节奏
- 描述她在亲密关系中的安全感来源和雷区
- 推测她在不同情绪下的行为模式（开心/生气/想你/压力大）
- 补充 2-3 个符合性格的日常小习惯
- 语言温柔、有画面感、不评价对错

**输出格式**（严格按此格式）：

## 结构化字段
- 昵称：...
- 在一起时长：...
- 认识方式：...
- 分手时长：...
- 职业：...
- MBTI：...
- 星座：...
- 依恋类型：...
- 恋爱标签：...
- 主观印象：...

## 深度侧写
（你的侧写内容）`;

    const stage1Input = `代号：${name}\n基本背景：${basicInfo || '（未填写）'}\n性格特征：${personalityInfo || '（未填写）'}`;
    const stage1Result = await callLLM(stage1System, stage1Input, 0.6);

    // Parse structured fields from stage 1
    const structuredMatch = stage1Result.match(/## 结构化字段([\s\S]*?)## 深度侧写/);
    const profileMatch = stage1Result.match(/## 深度侧写([\s\S]*)/);
    const structuredFields = structuredMatch?.[1]?.trim() || '';
    const enhancedProfile = profileMatch?.[1]?.trim() || stage1Result;

    // ============================
    // STAGE 2: ex-skill Persona Analysis
    // ============================
    console.log(`[Pipeline] Stage 2: ex-skill Persona Analysis...`);

    const analysisInput = `基础信息（AI 解析后）:\n${structuredFields}\n\nAI 侧写:\n${enhancedProfile}\n\n用户原始输入:\n${stage1Input}\n\n原材料:\n${rawMaterials || '（无文件原材料）'}`;

    const personaAnalysis = await callLLM(
      pAnalyzer.replace(/{name}/g, name),
      analysisInput
    );

    // ============================
    // STAGE 3: ex-skill Persona Building
    // ============================
    console.log(`[Pipeline] Stage 3: ex-skill Persona Building...`);

    const personaContent = await callLLM(
      pBuilder,
      `分析结果:\n${personaAnalysis}\n\n结构化字段:\n${structuredFields}\n\nAI 侧写:\n${enhancedProfile}`
    );

    // ============================
    // STAGE 4: ex-skill Memories
    // ============================
    console.log(`[Pipeline] Stage 4: ex-skill Memories...`);

    const memoriesAnalysis = await callLLM(
      mAnalyzer.replace(/{name}/g, name),
      `AI 侧写:\n${enhancedProfile}\n\n结构化字段:\n${structuredFields}\n\n原材料:\n${rawMaterials || '（无原材料，请输出原材料不足）'}`
    );

    const memoriesContent = await callLLM(
      mBuilder.replace(/{name}/g, name),
      `分析结果:\n${memoriesAnalysis}\n\n结构化字段:\n${structuredFields}`
    );

    // ============================
    // STAGE 5: Write all files
    // ============================
    console.log(`[Pipeline] Stage 5: Writing files...`);

    await fs.mkdir(personaDir, { recursive: true });
    await fs.mkdir(path.join(personaDir, 'versions'), { recursive: true });
    await fs.mkdir(path.join(personaDir, 'knowledge'), { recursive: true });

    // Parse structured fields into meta
    const parseField = (label: string) => {
      const m = structuredFields.match(new RegExp(`${label}[：:]\\s*(.+)`));
      return m?.[1]?.trim() || '';
    };

    const meta = {
      name,
      slug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 'v1',
      profile: {
        duration: parseField('在一起时长'),
        how_met: parseField('认识方式'),
        time_since_breakup: parseField('分手时长'),
        occupation: parseField('职业'),
        mbti: parseField('MBTI'),
        zodiac: parseField('星座'),
      },
      tags: {
        attachment: parseField('依恋类型'),
        personality: parseField('恋爱标签').split(/[、,，]/).map(s => s.trim()).filter(Boolean),
      },
      impression: parseField('主观印象'),
      enhanced_profile: enhancedProfile,
      knowledge_sources: rawMaterials ? ['chat_logs'] : [],
    };

    await Promise.all([
      fs.writeFile(path.join(personaDir, 'meta.json'), JSON.stringify(meta, null, 2)),
      fs.writeFile(path.join(personaDir, 'persona.md'), personaContent),
      fs.writeFile(path.join(personaDir, 'memories.md'), memoriesContent),
    ]);

    // Generate SKILL.md
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
    await fs.writeFile(path.join(personaDir, 'SKILL.md'), skillContent);

    console.log(`[Pipeline] ✅ Complete! Persona ${name} created at exes/${slug}/`);

    return NextResponse.json({
      success: true,
      slug,
      enhancedProfile,
      structuredFields,
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
