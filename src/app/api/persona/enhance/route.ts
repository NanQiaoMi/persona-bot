import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { name, basicInfo, personalityInfo } = await request.json();

    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const model = process.env.LLM_MODEL || 'gpt-4-turbo';

    const systemPrompt = `你是一个资深的人物侧写师和情感专家。
你的任务是将用户提供的碎片化信息，补全为一个丰满、真实、有血有肉的人物形象描述。
你需要从以下维度进行逻辑推演：
1. 语言风格：根据性格标签推测她的说话节奏、常用语气词和表达习惯。
2. 情感逻辑：推测她在亲密关系中的安全感来源、雷区、以及应对冲突的本能反应。
3. 细节刻画：增加一些符合性格的日常小习惯。

输出格式：请输出一段深度的人物侧写（300-500字），要求文字优美、客观、具有极强的代入感。`;

    const userContent = `代号：${name}\n基本背景：${basicInfo}\n性格特征：${personalityInfo}`;

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
        temperature: 0.7,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    return NextResponse.json({ enhancedProfile: data.choices[0].message.content });

  } catch (error: any) {
    console.error('Enhance Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
