"use client";
import { thumbUrl } from "@/lib/media/thumb-url";

import type { ReactNode } from "react";
import MediaPendingCard from "./MediaPendingCard";
import type { ConversationMessage, MediaCard } from "@/lib/storage/types";
import BotCreatedCardView from "./BotCreatedCardView";
import BlobMascot from "./BlobMascot";
import type { MascotShapeId } from "./mascot-palette";

export interface MentionSegment {
  text: string;
  mention: boolean;
}

/** 群主的固定称呼，即使不在成员名单里也视为 @ 提及 */
const OWNER_MENTION = "群主";

/**
 * 把文本切分为普通段与 @提及 段。
 * - `@Name` 中的 Name 若以 names 中的某一项开头（忽略大小写）即视为提及，且优先匹配最长的名字。
 * - 「@群主」始终视为提及。
 * - "@" 字符属于提及段本身。相邻的普通文本会被合并。
 */
export function splitMentions(text: string, names: string[]): MentionSegment[] {
  if (!text) return [];

  const candidates = Array.from(
    new Set(
      [...names.map((n) => n.trim()), OWNER_MENTION].filter((n) => n.length > 0)
    )
  ).sort((a, b) => b.length - a.length);

  const segments: MentionSegment[] = [];
  let plain = "";
  const flushPlain = () => {
    if (plain) {
      segments.push({ text: plain, mention: false });
      plain = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      const hit = candidates.find(
        (name) =>
          text.slice(i + 1, i + 1 + name.length).toLowerCase() ===
          name.toLowerCase()
      );
      if (hit) {
        flushPlain();
        const end = i + 1 + hit.length;
        segments.push({ text: text.slice(i, end), mention: true });
        i = end;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  flushPlain();
  return segments;
}

interface GroupMessageRowProps {
  msg: ConversationMessage;
  showHeader: boolean;
  memberNames: string[];
  avatarImageOf?: (slug: string) => string | undefined;
  onSelectPersona?: (slug: string) => void;
  renderBody?: (text: string) => ReactNode;
  onRetryMedia?: (messageId: string, cardIndex: number) => Promise<void>;
  /** 主 bot 建的新 Bot 卡片：这个角色是否还在 */
  botCreatedExists?: boolean;
}

const BUBBLE_CLASS =
  "max-w-[78%] rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] px-4 py-2.5 break-words";

export function GroupMessageRow({
  msg,
  showHeader,
  memberNames,
  avatarImageOf,
  onSelectPersona,
  renderBody,
  onRetryMedia,
  botCreatedExists,
}: GroupMessageRowProps) {
  const bot = msg.fromBot;
  const text = msg.content || "";

  let body: ReactNode;
  const segments = text.includes("@") ? splitMentions(text, memberNames) : [];
  if (segments.some((seg) => seg.mention)) {
    body = (
      <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-primary)]">
        {segments.map((seg, idx) =>
          seg.mention ? (
            <span
              key={idx}
              className="text-[var(--accent,#1683FF)] font-medium"
            >
              {seg.text}
            </span>
          ) : (
            <span key={idx}>{seg.text}</span>
          )
        )}
      </div>
    );
  } else if (renderBody) {
    body = renderBody(text);
  } else {
    body = (
      <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-primary)]">
        {text}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 w-full">
      <div className="w-9 shrink-0">
        {showHeader && bot && (
          <BlobMascot
            shape={(bot.shape as MascotShapeId) || "circle"}
            color={bot.color || "#1683FF"}
            image={avatarImageOf?.(bot.slug)}
            size={34}
            trackPointer={false}
            animated={false}
          />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col items-start">
        {showHeader && bot && (
          <button
            type="button"
            onClick={() => onSelectPersona?.(bot.slug)}
            className="mb-0.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            title={`和 ${bot.name} 单聊`}
          >
            {bot.name}
          </button>
        )}

        {/* 只发了表情包时没有文字，不画空气泡 */}
        {(text.trim() || msg.quote) && (
        <div className={BUBBLE_CLASS}>
          {msg.quote && (
            <div
              className="mb-1.5 max-w-full truncate border-l-2 border-[var(--border-subtle)] pl-2 text-[12px] text-[var(--text-muted)]"
              title={`「${msg.quote.name}：${msg.quote.text}」`}
            >
              {`「${msg.quote.name}：${msg.quote.text}」`}
            </div>
          )}
          {body}
        </div>
        )}

        {msg.botCreated && (
          <BotCreatedCardView
            card={msg.botCreated}
            exists={botCreatedExists !== false}
            onOpen={onSelectPersona}
          />
        )}

        {/* 照片 / 表情包：生成中显示占位，完成后显示图片 */}
        {(msg.mediaCards || [])
          .map((card, idx) =>
            card.type === "photo" || card.type === "sticker" ? (
              <GroupMediaCard
                key={idx}
                card={card}
                name={bot?.name || ""}
                accent={bot?.color}
                onRetry={onRetryMedia ? () => onRetryMedia(msg.id, idx) : undefined}
              />
            ) : null
          )}
      </div>
    </div>
  );
}

function GroupMediaCard({
  card,
  name,
  onRetry,
  accent,
}: {
  card: MediaCard;
  name: string;
  onRetry?: () => Promise<void>;
  accent?: string;
}) {
  const isSticker = card.type === "sticker";
  if (card.imageUrl && card.status !== "error") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbUrl(card.imageUrl)}
        alt={card.caption}
        title={card.caption}
        loading="lazy"
        decoding="async"
        className={`mt-1.5 rounded-2xl border border-[var(--border-subtle)] object-cover ${
          isSticker ? "w-[120px] h-[120px] bg-transparent" : "max-w-[220px] max-h-[280px]"
        }`}
      />
    );
  }
  return <MediaPendingCard card={card} name={name} onRetry={onRetry} accent={accent} />;
}

/** 群聊中的居中灰色系统提示（如「A 拍了拍 B」） */
export function GroupSystemTip({ text }: { text: string }) {
  return (
    <div className="flex justify-center my-2">
      <span className="rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-[12px] text-[var(--text-muted)]">
        {text}
      </span>
    </div>
  );
}

/** 群聊中某个成员正在输入时的占位行 */
export function GroupTypingRow({
  name,
  shape,
  color,
  image,
}: {
  name: string;
  shape?: string;
  color?: string;
  image?: string;
}) {
  return (
    <div className="flex items-start gap-2 w-full">
      <div className="w-9 shrink-0">
        <BlobMascot
          shape={(shape as MascotShapeId) || "circle"}
          color={color || "#1683FF"}
          image={image}
          size={34}
          trackPointer={false}
          animated
          state="working"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <div className="max-w-[78%] rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] px-4 py-3">
          <div className="flex items-center gap-1" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot typing-dot-2" />
            <span className="typing-dot typing-dot-3" />
          </div>
        </div>
        <span className="mt-1 text-[11px] text-[var(--text-muted)]">
          {`${name} 正在输入…`}
        </span>
      </div>
    </div>
  );
}

/** 「以下为新消息」分割线 */
export function NewMessagesDivider() {
  return (
    <div className="flex items-center gap-3 my-3 w-full">
      <div className="h-px flex-1 bg-[var(--border-subtle)]" />
      <span className="text-[11px] text-[var(--accent,#1683FF)]">以下为新消息</span>
      <div className="h-px flex-1 bg-[var(--border-subtle)]" />
    </div>
  );
}
