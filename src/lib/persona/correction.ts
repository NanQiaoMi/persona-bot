import { chatCompletion, LlmConfig } from '@/lib/llm/client';
import { CORRECTION_HANDLER_PROMPT } from '@/lib/persona/prompts';

/** 聊天气泡「不像 TA」快捷选项 → 可直接写进纠偏层的行为规则（离线也可用） */
export const QUICK_CORRECTION_RULES: Record<string, string> = {
  太像AI: '说话别像 AI 客服：不书面、不总结、不说套话，用 TA 平时的口语接话',
  太油腻: '别油腻：少用土味情话、少撒娇式语气词和暧昧表情，正常说话',
  表情太多: '这类场景少用 emoji，最多 1 个，靠语气词表达情绪',
  太长了: '别写成小作文：拆成 1~3 条短消息，先说重点',
  老是反问: '别每轮结尾都反问对方，聊完自然停下',
  不是TA会说的话: '这种话 TA 不会说，换成 TA 自己的说话方式和口头禅',
};

export interface RefinedCorrection {
  rule: string;
  refined: boolean;
}

/**
 * 把用户口语化的反馈提炼成一条简明的行为规则：
 * 快捷选项直接映射；自由文本在可调用模型时用 CORRECTION_HANDLER_PROMPT 提炼，失败或离线时保留原话
 */
export async function refineCorrection(
  input: { feedback: string; botResponse?: string; userInput?: string },
  llm?: LlmConfig
): Promise<RefinedCorrection> {
  const feedback = (input.feedback || '').trim();
  const quick = QUICK_CORRECTION_RULES[feedback.replace(/\s+/g, '')];
  if (quick) return { rule: quick, refined: true };
  if (!llm?.canCall || feedback.length < 4) return { rule: feedback, refined: false };

  try {
    const out = await chatCompletion(
      llm,
      [
        { role: 'system', content: `${CORRECTION_HANDLER_PROMPT}\n只输出一句不超过 60 字的规则，不要解释。` },
        {
          role: 'user',
          content: `用户上一句：${input.userInput || '（无）'}\n角色原回复：${input.botResponse || '（无）'}\n用户的反馈：${feedback}`,
        },
      ],
      { temperature: 0.2, timeoutMs: 15000 }
    );
    const rule = out.replace(/^[-*\s「“"]+|[」”"\s]+$/g, '').split('\n')[0].trim();
    if (rule.length >= 4 && rule.length <= 120) return { rule, refined: true };
  } catch {
    // 离线或超时：保留用户原话
  }
  return { rule: feedback, refined: false };
}
