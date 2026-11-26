import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureThumbnail, thumbnailPathFor } from "@/lib/media/thumbnails";
import { THUMB_WIDTH, thumbUrl } from "@/lib/media/thumb-url";

let dir: string;

async function writePng(name: string, width: number, height: number) {
  await sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 120, b: 80, alpha: 1 } },
  })
    .png()
    .toFile(path.join(dir, name));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "pb-thumbs-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("ensureThumbnail", () => {
  it("creates a 640px-wide webp next to the original and reuses it", async () => {
    await writePng("photo_1_abc.png", 1536, 1024);
    const out = await ensureThumbnail(dir, "photo_1_abc.png");
    expect(out).toBe(thumbnailPathFor(dir, "photo_1_abc.png"));
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(THUMB_WIDTH);
    expect(meta.height).toBe(Math.round((1024 * THUMB_WIDTH) / 1536));

    const statBefore = await fs.stat(out!);
    const again = await ensureThumbnail(dir, "photo_1_abc.png");
    expect(again).toBe(out);
    expect((await fs.stat(out!)).mtimeMs).toBe(statBefore.mtimeMs);
  });

  it("does not enlarge small images", async () => {
    await writePng("sticker_1_x.png", 200, 200);
    const out = await ensureThumbnail(dir, "sticker_1_x.png");
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(200);
  });

  it("shares one job for concurrent requests", async () => {
    await writePng("photo_2_def.png", 1200, 1200);
    const [a, b] = await Promise.all([
      ensureThumbnail(dir, "photo_2_def.png"),
      ensureThumbnail(dir, "photo_2_def.png"),
    ]);
    expect(a).toBe(b);
    const leftovers = (await fs.readdir(path.join(dir, "thumbs"))).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("returns null for missing or corrupt originals without leaving temp files", async () => {
    expect(await ensureThumbnail(dir, "nope_1_a.png")).toBeNull();
    await fs.writeFile(path.join(dir, "bad_1_a.png"), "not an image");
    expect(await ensureThumbnail(dir, "bad_1_a.png")).toBeNull();
    const files = await fs.readdir(path.join(dir, "thumbs")).catch(() => []);
    expect(files).toEqual([]);
  });

  it("rejects unsafe filenames", async () => {
    expect(await ensureThumbnail(dir, "../etc/passwd.png")).toBeNull();
    expect(await ensureThumbnail(dir, "a.gif")).toBeNull();
  });
});

describe("thumbUrl", () => {
  it("adds the width param only to local generated media", () => {
    expect(thumbUrl("/api/media/photo_1.png")).toBe(`/api/media/photo_1.png?w=${THUMB_WIDTH}`);
    expect(thumbUrl("/api/media/photo_1.png?w=640")).toBe("/api/media/photo_1.png?w=640");
    expect(thumbUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(thumbUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(thumbUrl(undefined)).toBeUndefined();
    expect(thumbUrl("")).toBeUndefined();
  });
});
