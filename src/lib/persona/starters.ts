import type { PersonaRecord } from "@/lib/storage/types";

export interface StarterSuggestion {
  label: string;
  prompt: string;
}

/**
 * Generates three tailored conversation starter suggestions based on a persona's
 * role, MBTI, tags, and bio.
 */
export function buildStarterSuggestions(persona?: PersonaRecord | null): StarterSuggestion[] {
  if (!persona) {
    return [
      { label: "聊聊今天", prompt: "最近怎么样，今天有什么有意思的事吗？" },
      { label: "帮我出主意", prompt: "我有点拿不定主意，想听听你的看法。" },
      { label: "随便开个头", prompt: "在干嘛呢？突然想找你随便聊两句。" },
    ];
  }

  if (persona.isMaster) {
    return [
      { label: "问实时热点", prompt: "今天科技圈和社交网络都在讨论什么新鲜事？" },
      { label: "直白锐评", prompt: "你直接点，怎么看最近大家疯狂追捧的新概念？" },
      { label: "深夜脑洞", prompt: "如果让你重写一条人类日常规则，你会改哪一条？" },
    ];
  }

  const tags = persona.profile?.personalityTags ?? [];
  const mbti = persona.profile?.mbti?.trim();
  const bio = persona.profile?.bio?.trim() ?? "";
  const firstTag = tags[0]?.trim();
  const secondTag = tags[1]?.trim();

  const suggestions: StarterSuggestion[] = [];

  if (firstTag) {
    suggestions.push({
      label: `聊「${firstTag}」`,
      prompt: `看你标签里写着「${firstTag}」，你平时对这块最上头的是什么？`,
    });
  } else if (mbti) {
    suggestions.push({
      label: `测测 ${mbti}`,
      prompt: `听说你是 ${mbti}，做决定时最常先考虑情绪还是逻辑？`,
    });
  } else {
    suggestions.push({
      label: "破冰开聊",
      prompt: `嗨 ${persona.name}，今天心情如何？最近在忙什么？`,
    });
  }

  if (secondTag) {
    suggestions.push({
      label: `说说「${secondTag}」`,
      prompt: `如果你现在有半天完全空闲，按你「${secondTag}」的性格会怎么打发？`,
    });
  } else if (bio) {
    suggestions.push({
      label: "聊聊近况",
      prompt: `看你简介很有意思，能聊聊你最近最有成就感或最吐槽的一件事吗？`,
    });
  } else {
    suggestions.push({
      label: "生活日常",
      prompt: "忙完手头的事了吗？现在最想吃点什么或做点什么？",
    });
  }

  suggestions.push({
    label: "发张近照？",
    prompt: `你现在在干嘛呀，方便发张自拍或者说说身边什么样吗？`,
  });

  return suggestions.slice(0, 3);
}
