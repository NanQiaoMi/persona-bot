/**
 * 主 bot 在对话里帮你建 Bot：按一句话拆出的意图走快速创建（重名不覆盖、基础性格与外貌锚点生效）。
 */
import { distillPersona } from '@/lib/persona/distiller';
import { CreateBotIntent, pickFallbackName, pickMascotFor } from '@/lib/persona/create-intent';
import { storageRepo } from '@/lib/storage/repository';
import type { BotCreatedCard, PersonaRecord } from '@/lib/storage/types';

export async function createBotFromIntent(
  intent: CreateBotIntent
): Promise<{ persona: PersonaRecord; card: BotCreatedCard }> {
  const existing = await storageRepo.listPersonas();
  const name = intent.name || pickFallbackName(existing.map((p) => p.name));
  const look = pickMascotFor(name);
  const personality = intent.personality;
  const { persona } = await distillPersona({
    name,
    ensureUniqueSlug: true,
    defaultMode: 'fun',
    basicPersonality: personality,
    personalityInfo: personality || '嘴硬心软、有鲜明脾气、说话像熟人一样的私人搭子',
    basicInfo: personality ? `${name} · ${personality}` : `${name} · 专属拟人 AI Bot`,
    appearanceAnchor: intent.appearance,
    avatarShape: intent.shape || look.shape,
    avatarColor: intent.color || look.color,
  });
  return {
    persona,
    card: {
      slug: persona.slug,
      name: persona.name,
      personality,
      appearance: intent.appearance,
      shape: persona.profile.avatarShape,
      color: persona.profile.avatarColor,
    },
  };
}

/** 主 bot 建好之后说的话（离线也自然） */
export function createdReplyText(card: BotCreatedCard, opts: { inGroup?: boolean; autoNamed?: boolean } = {}): string {
  const who = card.personality ? `${card.name}，${card.personality}` : card.name;
  const named = opts.autoNamed ? `（没说名字，先叫 TA ${card.name}）` : '';
  return opts.inGroup
    ? `建好了，${who}${named}，已经拉进群了，${card.name} 先跟大家打个招呼`
    : `建好了，${who}${named}，点下面去跟 TA 打个招呼`;
}
