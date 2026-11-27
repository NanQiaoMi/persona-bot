import { Appraisal, EmotionalEvent, PersonalityTraits, EmotionVector } from './types';

interface LexiconEntry {
  word: string;
  weight: number;
  /** 本身已是冷淡/攻击完整短语，不再做前置否定翻转 */
  fixedPolarity?: boolean;
}

const SENTIMENT_LEXICON: LexiconEntry[] = [
  // 长短语与固定冷淡/带刺表达（优先匹配并掩码，防止被拆分）
  { word: '关你什么事', weight: -0.38, fixedPolarity: true },
  { word: '关你屁事', weight: -0.42, fixedPolarity: true },
  { word: '懒得理你', weight: -0.38, fixedPolarity: true },
  { word: '行吧行吧', weight: -0.22, fixedPolarity: true },
  { word: '随你怎么', weight: -0.26, fixedPolarity: true },
  { word: '不想跟你', weight: -0.3, fixedPolarity: true },
  { word: '别来烦我', weight: -0.38, fixedPolarity: true },
  { word: '真的假的', weight: 0.08, fixedPolarity: true },
  { word: '特别喜欢', weight: 0.28 },
  { word: '实在不行', weight: -0.06, fixedPolarity: true },
  { word: '别烦我', weight: -0.36, fixedPolarity: true },
  { word: '烦死了', weight: -0.32, fixedPolarity: true },
  { word: '烦不烦', weight: -0.32, fixedPolarity: true },
  { word: '爱咋咋', weight: -0.32, fixedPolarity: true },
  { word: '无所谓', weight: -0.22, fixedPolarity: true },
  { word: '随便吧', weight: -0.22, fixedPolarity: true },
  { word: '随便你', weight: -0.25, fixedPolarity: true },
  { word: '不想聊', weight: -0.32, fixedPolarity: true },
  { word: '不想说', weight: -0.24, fixedPolarity: true },
  { word: '不理你', weight: -0.3, fixedPolarity: true },
  { word: '算了吧', weight: -0.2, fixedPolarity: true },
  { word: '真无语', weight: -0.24, fixedPolarity: true },
  { word: '好无语', weight: -0.24, fixedPolarity: true },
  { word: '最喜欢', weight: 0.26 },
  { word: '很喜欢', weight: 0.25 },
  { word: '超喜欢', weight: 0.28 },
  { word: '很开心', weight: 0.24 },
  { word: '好开心', weight: 0.24 },
  { word: '我爱你', weight: 0.35 },
  { word: '喜欢你', weight: 0.28 },
  { word: '想你了', weight: 0.24 },
  { word: '好想你', weight: 0.26 },
  { word: '别生气', weight: 0.12, fixedPolarity: true },
  { word: '别难过', weight: 0.12, fixedPolarity: true },
  { word: '别气了', weight: 0.14, fixedPolarity: true },
  { word: '对不起', weight: 0.16, fixedPolarity: true },
  { word: '抱抱你', weight: 0.24 },
  { word: '不开心', weight: -0.24, fixedPolarity: true },
  { word: '不高兴', weight: -0.24, fixedPolarity: true },
  { word: '不喜欢', weight: -0.26, fixedPolarity: true },
  { word: '别闹了', weight: -0.16, fixedPolarity: true },
  { word: '讲重点', weight: -0.18, fixedPolarity: true },
  { word: '太敷衍', weight: -0.28, fixedPolarity: true },
  { word: '敷衍', weight: -0.24, fixedPolarity: true },
  { word: '随便', weight: -0.18, fixedPolarity: true },
  { word: '呵呵', weight: -0.24, fixedPolarity: true },
  { word: '闭嘴', weight: -0.4, fixedPolarity: true },
  { word: '有病', weight: -0.38, fixedPolarity: true },
  { word: '讨厌', weight: -0.28 },
  { word: '生气', weight: -0.25 },
  { word: '愤怒', weight: -0.32 },
  { word: '失望', weight: -0.26 },
  { word: '难过', weight: -0.22 },
  { word: '伤心', weight: -0.24 },
  { word: '委屈', weight: -0.22 },
  { word: '分手', weight: -0.45 },
  { word: '无聊', weight: -0.2 },
  { word: '真烦', weight: -0.28, fixedPolarity: true },
  { word: '好烦', weight: -0.25, fixedPolarity: true },
  { word: '好差', weight: -0.24, fixedPolarity: true },
  { word: '差劲', weight: -0.28 },
  { word: '冷漠', weight: -0.22 },
  { word: '喜欢', weight: 0.22 },
  { word: '开心', weight: 0.22 },
  { word: '高兴', weight: 0.2 },
  { word: '快乐', weight: 0.2 },
  { word: '想你', weight: 0.22 },
  { word: '爱你', weight: 0.3 },
  { word: '好棒', weight: 0.2 },
  { word: '真棒', weight: 0.2 },
  { word: '厉害', weight: 0.18 },
  { word: '可爱', weight: 0.2 },
  { word: '温柔', weight: 0.18 },
  { word: '贴心', weight: 0.2 },
  { word: '治愈', weight: 0.2 },
  { word: '感动', weight: 0.22 },
  { word: '期待', weight: 0.16 },
  { word: '不错', weight: 0.18 },
  { word: '谢谢', weight: 0.18 },
  { word: '抱抱', weight: 0.2 },
  { word: '懂我', weight: 0.22 },
  { word: '哈哈', weight: 0.18 },
  { word: '笑死', weight: 0.16 },
  { word: '嗯嗯', weight: 0.14 },
  { word: '好的', weight: 0.12 },
  { word: '爱你', weight: 0.3 },
  { word: '爱', weight: 0.18 },
  { word: '烦', weight: -0.2 },
  { word: '滚', weight: -0.4, fixedPolarity: true },
].sort((a, b) => b.word.length - a.word.length);

const NEGATION_PREFIX_RE =
  /(?:一点也|一点都|根本|完全|实在|真的|确实|压根|才)?(?:不太|并不|才不|很不|绝不|毫不|毫无|没多|没有|没|不|别)$/;
const STRONG_NEGATION_RE = /(?:一点也|一点都|根本|完全|压根|绝不|毫不|毫无)/;

/** 仅匹配纯冷淡敷衍整句（保留单字「嗯」为中性 0） */
const STANDALONE_COLD_RE = /^(?:哦+|噢+|行吧行吧|随便|无所谓|呵呵)[。.~～…!！]*$/;

export function assessNovelty(event: EmotionalEvent, history: EmotionVector[]): number {
  const content = (event.content || '').trim();
  const len = content.length;

  let textNovelty = 0.25;
  if (event.type === 'correction') {
    textNovelty = 0.85;
  } else {
    if (len >= 30) textNovelty += 0.2;
    else if (len >= 10) textNovelty += 0.1;
    if (/[?？!！]/.test(content)) textNovelty += 0.14;
    if (/(居然|竟然|突然|突发|新|重磅|听说|猜猜|卧槽|笑死|离谱)/.test(content)) {
      textNovelty += 0.2;
    }
    if (event.metadata?.boundaryHit === true) {
      textNovelty += 0.18;
    }
  }

  if (history.length === 0) {
    return Math.max(0.15, Math.min(0.95, Number(textNovelty.toFixed(3))));
  }

  const recentEmotions = history.slice(-5);
  const last = recentEmotions[recentEmotions.length - 1];
  const avgPleasure =
    recentEmotions.reduce((sum, e) => sum + e.pleasure, 0) / recentEmotions.length;
  const shift = Math.abs(last.pleasure - avgPleasure) + Math.abs(last.arousal - 0.35) * 0.4;

  const combined = textNovelty * 0.72 + Math.min(0.4, shift) * 0.7;
  return Math.max(0.15, Math.min(0.95, Number(combined.toFixed(3))));
}

export function assessPleasantness(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  const content = (event.content || '').toLowerCase().trim();
  if (!content) return 0;

  let pleasantness = 0;

  if (STANDALONE_COLD_RE.test(content)) {
    pleasantness -= 0.2;
  } else {
    const consumed = new Array<boolean>(content.length).fill(false);

    for (const entry of SENTIMENT_LEXICON) {
      let from = 0;
      while (from < content.length) {
        const idx = content.indexOf(entry.word, from);
        if (idx === -1) break;
        const end = idx + entry.word.length;
        from = end;

        let overlaps = false;
        for (let k = idx; k < end; k += 1) {
          if (consumed[k]) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        for (let k = idx; k < end; k += 1) {
          consumed[k] = true;
        }

        let delta = entry.weight;
        if (!entry.fixedPolarity) {
          const prefix = content.slice(Math.max(0, idx - 6), idx);
          if (NEGATION_PREFIX_RE.test(prefix)) {
            if (entry.weight > 0) {
              const amp = STRONG_NEGATION_RE.test(prefix) ? 1.35 : 1.1;
              delta = -entry.weight * amp;
            } else {
              // 否定负向词（如「没有生气」「不难过」）视为温和安抚，不再误判负向
              delta = -entry.weight * 0.25;
            }
          }
        }

        pleasantness += delta;
      }
    }
  }

  if (event.metadata?.boundaryHit === true) {
    pleasantness -= 0.4;
  }

  // 神经质高时对负向更敏感、对正向略克制；情绪稳则受波动影响更轻
  if (pleasantness > 0) {
    pleasantness *= 1 - personality.neuroticism * 0.25;
  } else if (pleasantness < 0) {
    pleasantness *= 0.9 + personality.neuroticism * 0.25;
  }

  return Math.max(-1, Math.min(1, Number(pleasantness.toFixed(3))));
}

export function assessGoalRelevance(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  const content = (event.content || '').trim();
  let relevance = 0.45;

  if (event.type === 'correction') {
    relevance = 0.88;
  } else if (event.type === 'message' && event.sender === 'user') {
    if (content.length <= 3 && !/[?？!！]/.test(content)) {
      relevance = 0.35;
    } else {
      relevance = 0.55;
      if (content.length >= 20) relevance += 0.1;
      if (/[你我咱]/.test(content)) relevance += 0.08;
      if (/[?？]/.test(content)) relevance += 0.06;
    }
    if (event.metadata?.boundaryHit === true) {
      relevance = Math.max(relevance, 0.86);
    }
  }

  relevance *= 1 + (personality.extraversion - 0.5) * 0.2;

  return Math.max(0.2, Math.min(1, Number(relevance.toFixed(3))));
}

export function assessCopingPotential(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  context: { timeSinceLastChat?: number; relationshipDuration?: number }
): number {
  const content = (event.content || '').trim();
  let potential = 0.42;

  potential += personality.emotionalStability * 0.25;
  potential += (1 - personality.agreeableness) * 0.18;

  if (event.metadata?.boundaryHit === true) {
    // 踩雷时主导感随脾气直率度变化，高顺从会略收低，低顺从会反手顶回去
    potential += personality.agreeableness >= 0.7 ? -0.15 : 0.12;
  }
  if (/(随便|算了|不知道|怎么办|好累)/.test(content)) {
    potential -= 0.08;
  } else if (/(凭什么|你必须|听我的|搞定|没问题)/.test(content)) {
    potential += 0.08;
  }

  if (context.relationshipDuration) {
    potential += Math.min(0.15, (context.relationshipDuration / 365) * 0.1);
  }

  return Math.max(0.15, Math.min(0.95, Number(potential.toFixed(3))));
}

export function assessNormCompatibility(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  const content = (event.content || '').trim();
  let compatibility = 0.68;

  if (event.metadata?.boundaryHit === true) {
    compatibility -= 0.4;
  } else if (/(敷衍|随便|无所谓|闭嘴|滚|呵呵)/.test(content)) {
    compatibility -= 0.18;
  } else if (/(谢谢|辛苦|晚安|想你|抱抱|喜欢)/.test(content)) {
    compatibility += 0.1;
  }

  if (personality.openness > 0.7) {
    compatibility += 0.08;
  }
  if (personality.conscientiousness > 0.7) {
    compatibility -= 0.06;
  }

  return Math.max(0.05, Math.min(1, Number(compatibility.toFixed(3))));
}

export function appraiseEvent(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  history: EmotionVector[],
  context: { timeSinceLastChat?: number; relationshipDuration?: number } = {}
): Appraisal {
  return {
    novelty: assessNovelty(event, history),
    pleasantness: assessPleasantness(event, personality),
    goalRelevance: assessGoalRelevance(event, personality),
    copingPotential: assessCopingPotential(event, personality, context),
    normCompatibility: assessNormCompatibility(event, personality),
  };
}

export function appraisalToEmotion(
  appraisal: Appraisal,
  _personality?: PersonalityTraits
): Partial<EmotionVector> {
  void _personality;
  // 去掉旧版 `+ goalRelevance * 0.3` 的固定正向偏置：中性消息 valence=0，负向消息不再被强行拉正
  const relevanceAmp = 0.75 + appraisal.goalRelevance * 0.35;
  const valence = Math.max(-1, Math.min(1, appraisal.pleasantness * relevanceAmp));
  const arousal = Math.max(
    0.1,
    Math.min(
      0.98,
      0.18 +
        appraisal.novelty * 0.34 +
        Math.abs(appraisal.pleasantness) * 0.38 +
        (appraisal.goalRelevance - 0.5) * 0.2
    )
  );
  const dominance = appraisal.copingPotential;

  const intensity = Math.max(
    0.1,
    Math.min(
      1,
      0.14 +
        Math.abs(appraisal.pleasantness) * 0.52 +
        appraisal.novelty * 0.18 +
        appraisal.goalRelevance * 0.16
    )
  );

  return {
    pleasure: Number(valence.toFixed(3)),
    arousal: Number(arousal.toFixed(3)),
    dominance: Number(dominance.toFixed(3)),
    intensity: Number(intensity.toFixed(3)),
    appraisal,
  };
}
