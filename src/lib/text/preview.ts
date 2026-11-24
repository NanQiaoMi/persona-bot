/**
 * 把一条聊天消息清洗成适合列表预览的纯文本：
 * 去掉 Markdown、内心独白、多模态/节奏标记与「[来自主控 Bot…]」这类系统前缀
 */
export function toPlainPreview(text: string | undefined | null, maxLength = 60): string {
  if (!text) return '';
  const cleaned = text
    .replace(/<thought>[\s\S]*?<\/thought>/gi, ' ')
    .replace(/\[(?:PHOTO|STICKER|VOICE|MOOD|EARLY|FOLLOWUP)\s*:[^\]]*\]/gi, ' ')
    .replace(/\[BURST\]/gi, ' ')
    .replace(/\[来自主控\s*Bot[^\]]*\]/gi, ' ')
    .replace(/[「【]?\[?来自主控\s*Bot「[^」]*」的?\]?[」】]?/g, ' ')
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [图片] ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}
