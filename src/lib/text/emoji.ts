/**
 * 去掉 emoji（含组合符、肤色、变体选择符、国旗），保留中英文与常用标点。
 * 用于显示模型生成的心情等短文本：模型偶尔会在末尾加 📷 之类的符号。
 */
const EMOJI_RE =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]|‍|️|⃣)/gu;

export function stripEmoji(text: string): string {
  return (text || '').replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}
