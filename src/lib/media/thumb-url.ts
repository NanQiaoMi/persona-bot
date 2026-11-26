/** 缩略图宽度（像素）。聊天卡片最宽约 300px，按 2 倍屏取 640 */
export const THUMB_WIDTH = 640;

/**
 * 把本地生成图的地址换成缩略图地址（`/api/media/x.png` → `/api/media/x.png?w=640`）。
 * 其它地址（外链、data URL、已带参数的）原样返回。灯箱看大图时不要用它。
 */
export function thumbUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith("/api/media/") || url.includes("?")) return url;
  return `${url}?w=${THUMB_WIDTH}`;
}
