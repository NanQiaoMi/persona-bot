import { Fragment, memo } from "react";

export function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-[5px] bg-black/[0.045] dark:bg-white/[0.08] font-mono text-[12.5px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function GrokMessageBodyImpl({
  content,
  showCursor = false,
}: {
  content: string;
  showCursor?: boolean;
}) {
  const normalized = content.replace(/\n{3,}/g, "\n\n").trim();
  const blocks = normalized.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="space-y-1.5 type-body text-[14px] leading-[1.6] tracking-[-0.006em] text-[var(--text-primary)]">
      {blocks.map((block, bIdx) => {
        const isLast = bIdx === blocks.length - 1;
        if (block.startsWith("```") && block.endsWith("```")) {
          const inner = block.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
          return (
            <pre
              key={bIdx}
              className="p-3.5 rounded-[12px] bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] overflow-x-auto font-mono text-[12.5px] leading-relaxed"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        return (
          <p key={bIdx} className="whitespace-pre-wrap break-words">
            {renderInlineMarkdown(block)}
            {showCursor && isLast && <span className="grok-cursor" />}
          </p>
        );
      })}
    </div>
  );
}

export function formatSmartImTimestamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const timePart = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const targetDayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  if (targetDayStart === todayStart) return `今天 ${timePart}`;
  if (targetDayStart === yesterdayStart) return `昨天 ${timePart}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timePart}`;
}

/** 消息正文（轻量 markdown）。内容不变时不重新解析 */
export const GrokMessageBody = memo(GrokMessageBodyImpl);
