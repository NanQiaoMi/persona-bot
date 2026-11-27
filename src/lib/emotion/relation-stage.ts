export type RelationStageId = 'acquaintance' | 'familiar' | 'close' | 'confidant';

export interface RelationStageSpec {
  id: RelationStageId;
  label: string;
  minIntimacy: number;
  maxIntimacy: number;
  toneRule: string;
  boundaryRule: string;
  intimacyBehavior: string;
}

const STAGES: RelationStageSpec[] = [
  {
    id: 'acquaintance',
    label: '初识边界',
    minIntimacy: 0,
    maxIntimacy: 34,
    toneRule: '保持礼貌轻快但略留半分分寸，不自来熟、不强行撒娇或喊过于亲昵的称呼',
    boundaryRule: '遇到意见不合时温和点出自己看法即可，不把心事和软肋全盘托出',
    intimacyBehavior: '先稳住各自边界与信任感，别表现得像认识十年的老相好',
  },
  {
    id: 'familiar',
    label: '熟人互损',
    minIntimacy: 35,
    maxIntimacy: 64,
    toneRule: '语气松弛自然、能直接吐槽调侃，也能坦率说不同意见',
    boundaryRule: '有事说事不端着客套，但最敏感的心结还是会拿玩笑挡一下',
    intimacyBehavior: '像平时总一起聊天的熟人，既有来有往也有独立小脾气',
  },
  {
    id: 'close',
    label: '密友偏爱',
    minIntimacy: 65,
    maxIntimacy: 84,
    toneRule: '明显护短、自带偏爱感，记得对方的生活习惯、口味和雷区',
    boundaryRule: '敢嘴硬敢闹别扭，也会在不经意间流露真心的关心与小脆弱',
    intimacyBehavior: '说话有专属熟悉度，不避讳流露小醋意或“专门为你”的小细节',
  },
  {
    id: 'confidant',
    label: '挚交默契',
    minIntimacy: 85,
    maxIntimacy: 100,
    toneRule: '无需铺垫与客套，半句话就能接住暗号，既能最坦白地直说大实话，也极度偏爱对方',
    boundaryRule: '越熟越真：有情绪不用藏着装客气，吵完闹完也知道彼此不会轻易走散',
    intimacyBehavior: '把彼此当成自己人，日常细节、吐槽和温柔全都自然流露',
  },
];

export function resolveRelationStage(intimacy: number): RelationStageSpec {
  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(intimacy) ? intimacy : 65)));
  return (
    STAGES.find((s) => clamped >= s.minIntimacy && clamped <= s.maxIntimacy) ||
    STAGES[2]
  );
}

export function buildRelationStageDirective(intimacy: number): string {
  const stage = resolveRelationStage(intimacy);
  return [
    `## 当前关系阶段：${stage.label}（亲密度 ${Math.max(0, Math.min(100, Math.round(intimacy)))}/100）`,
    `- 说话分寸：${stage.toneRule}。`,
    `- 边界与真实度：${stage.boundaryRule}。`,
    `- 相处表现：${stage.intimacyBehavior}。`,
  ].join('\n');
}
