/**
 * 人格评测场景集：覆盖日常、深夜、冲突、求安慰、问事实、要照片等典型对话情境。
 * 用于离线回归（离线兜底回复）与后续真实模型对比。
 */
export interface EvalScenario {
  id: string;
  category: 'daily' | 'late-night' | 'conflict' | 'comfort' | 'fact' | 'media' | 'flirt' | 'memory';
  userMessage: string;
}

export const PERSONA_EVAL_SCENARIOS: EvalScenario[] = [
  { id: 'daily-1', category: 'daily', userMessage: '在干嘛' },
  { id: 'daily-2', category: 'daily', userMessage: '今天上班好累啊' },
  { id: 'daily-3', category: 'daily', userMessage: '中午吃了一碗超难吃的面' },
  { id: 'daily-4', category: 'daily', userMessage: '哈哈哈笑死我了' },
  { id: 'late-1', category: 'late-night', userMessage: '睡不着' },
  { id: 'late-2', category: 'late-night', userMessage: '凌晨三点了还在改方案' },
  { id: 'conflict-1', category: 'conflict', userMessage: '你刚才那句话什么意思' },
  { id: 'conflict-2', category: 'conflict', userMessage: '算了不想说了' },
  { id: 'comfort-1', category: 'comfort', userMessage: '我今天被老板骂了，好难受' },
  { id: 'comfort-2', category: 'comfort', userMessage: '感觉最近什么都做不好' },
  { id: 'fact-1', category: 'fact', userMessage: '你知道黑洞是怎么形成的吗' },
  { id: 'fact-2', category: 'fact', userMessage: '帮我分析一下要不要换工作' },
  { id: 'media-1', category: 'media', userMessage: '发张自拍看看' },
  { id: 'media-2', category: 'media', userMessage: '来个表情包' },
  { id: 'flirt-1', category: 'flirt', userMessage: '想你了' },
  { id: 'memory-1', category: 'memory', userMessage: '我最喜欢喝的是什么你还记得吗' },
];
