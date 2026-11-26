import fs from 'fs/promises';
import path from 'path';
import { THUMB_WIDTH } from './thumb-url';

export const SAFE_MEDIA_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/i;

function thumbsDir(mediaDir: string): string {
  return path.join(mediaDir, 'thumbs');
}

export function thumbnailPathFor(mediaDir: string, filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  return path.join(thumbsDir(mediaDir), `${base}.w${THUMB_WIDTH}.webp`);
}

/**
 * 按需加载 sharp：它是原生模块，某些环境（如精简镜像）可能加载失败。
 * 放在这里动态加载，失败时只是没有缩略图（退回原图），不会拖垮整个图片接口。
 */
type SharpFn = typeof import('sharp');
let sharpLoader: Promise<SharpFn | null> | null = null;
function loadSharp() {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((m) => ((m as unknown as { default?: SharpFn }).default ?? (m as unknown as SharpFn)))
      .catch(() => null);
  }
  return sharpLoader;
}

/** 同一张图同时被请求多次时只压缩一次 */
const inflight = new Map<string, Promise<string | null>>();

/**
 * 确保某张生成图有缩略图（长边宽度 640 的 WebP，不放大小图），返回缩略图路径。
 * 原图不存在或压缩失败时返回 null，调用方应退回原图。
 */
export async function ensureThumbnail(
  mediaDir: string,
  filename: string
): Promise<string | null> {
  if (!SAFE_MEDIA_FILENAME_RE.test(filename)) return null;
  const target = thumbnailPathFor(mediaDir, filename);
  try {
    await fs.access(target);
    return target;
  } catch {
    // 还没有，往下生成
  }

  const existing = inflight.get(target);
  if (existing) return existing;

  const job = (async () => {
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      const sharp = await loadSharp();
      if (!sharp) return null;
      const source = path.join(mediaDir, filename);
      await fs.mkdir(thumbsDir(mediaDir), { recursive: true });
      await sharp(source)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(tmp);
      await fs.rename(tmp, target);
      return target;
    } catch {
      await fs.rm(tmp, { force: true }).catch(() => {});
      return null;
    } finally {
      inflight.delete(target);
    }
  })();
  inflight.set(target, job);
  return job;
}
