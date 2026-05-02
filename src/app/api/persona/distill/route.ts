import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { slug } = await request.json();

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const personaDir = path.join(process.cwd(), 'exes', slug);
    const metaPath = path.join(personaDir, 'meta.json');
    const knowledgeDir = path.join(personaDir, 'knowledge');

    // 1. Load Meta and Raw Materials
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    
    let rawMaterials = '';
    try {
      const files = await fs.readdir(knowledgeDir);
      for (const file of files) {
        if (file.endsWith('.txt')) {
          rawMaterials += await fs.readFile(path.join(knowledgeDir, file), 'utf-8') + '\n---\n';
        }
      }
    } catch (e) {
      console.log('No raw materials found for distillation');
    }

    // 2. Load Prompts
    const promptDir = path.join(process.cwd(), 'lib', 'ex-skill', 'prompts');
    const [pAnalyzer, pBuilder, mAnalyzer, mBuilder] = await Promise.all([
      fs.readFile(path.join(promptDir, 'persona_analyzer.md'), 'utf-8'),
      fs.readFile(path.join(promptDir, 'persona_builder.md'), 'utf-8'),
      fs.readFile(path.join(promptDir, 'memories_analyzer.md'), 'utf-8'),
      fs.readFile(path.join(promptDir, 'memories_builder.md'), 'utf-8'),
    ]);

    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const model = process.env.LLM_MODEL || 'gpt-4-turbo';

    const callLLM = async (systemPrompt: string, userContent: string) => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0.3, // Lower temperature for more accurate analysis
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
    };

    console.log(`Starting distillation for ${meta.name}...`);

    // 3. Step 1: Analyze & Build Persona
    console.log('Step 1: Distilling Persona...');
    const personaAnalysis = await callLLM(
      pAnalyzer.replace(/{name}/g, meta.name),
      `基础信息: ${JSON.stringify(meta)}\n\n原材料:\n${rawMaterials || '（无文件原材料，仅根据基础信息分析）'}`
    );
    
    const personaContent = await callLLM(
      pBuilder,
      `分析结果:\n${personaAnalysis}\n\n基础信息:\n${JSON.stringify(meta)}`
    );
    await fs.writeFile(path.join(personaDir, 'persona.md'), personaContent);

    // 4. Step 2: Analyze & Build Memories
    console.log('Step 2: Distilling Memories...');
    const memoriesAnalysis = await callLLM(
      mAnalyzer.replace(/{name}/g, meta.name),
      `原材料:\n${rawMaterials || '（无原材料，请输出原材料不足）'}`
    );

    const memoriesContent = await callLLM(
      mBuilder.replace(/{name}/g, meta.name),
      `分析结果:\n${memoriesAnalysis}\n\n基础信息:\n${JSON.stringify(meta)}`
    );
    await fs.writeFile(path.join(personaDir, 'memories.md'), memoriesContent);

    console.log('Distillation complete!');
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Distillation Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to distill' }, { status: 500 });
  }
}
