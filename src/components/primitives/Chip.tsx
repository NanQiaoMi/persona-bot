"use client";

export type ChipTone = "brand" | "neutral" | "info" | "success" | "warning" | "danger";

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  selected?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  tone?: ChipTone;
  size?: "sm" | "md";
}

const SELECTED_TONE: Record<ChipTone, string> = {
  brand: "border-brand bg-brand-soft text-brand font-medium",
  neutral: "border-[var(--border-strong)] bg-surface-sunken text-primary font-medium",
  info: "border-[var(--sem-info)] bg-info-soft text-info font-medium",
  success: "border-[var(--sem-success)] bg-success-soft text-success font-medium",
  warning: "border-[var(--sem-warning)] bg-warning-soft text-warning font-medium",
  danger: "border-[var(--sem-danger)] bg-danger-soft text-danger font-medium",
};

export function Chip({
  children,
  selected = false,
  removable = false,
  onRemove,
  tone = "brand",
  size = "md",
  className = "",
  onClick,
  type = "button",
  ...rest
}: ChipProps) {
  const sizeCls =
    size === "sm"
      ? "px-2.5 py-1 text-[11px] rounded-full gap-1"
      : "px-3 py-1.5 text-[12px] rounded-full gap-1.5";

  const stateCls = selected
    ? SELECTED_TONE[tone]
    : "border-[var(--border-subtle)] bg-surface-raised text-secondary hover:text-primary hover:bg-[var(--bg-hover)]";

  const interactive = Boolean(onClick) || !removable;

  if (!interactive && removable) {
    return (
      <span
        className={`inline-flex items-center border transition-colors ${sizeCls} ${stateCls} ${className}`}
      >
        <span>{children}</span>
        {onRemove && (
          <button
            type="button"
            aria-label="移除标签"
            onClick={onRemove}
            className="ml-0.5 rounded-full px-1 text-[11px] opacity-70 hover:opacity-100 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]"
          >
            ✕
          </button>
        )}
      </span>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={`inline-flex items-center border transition-colors duration-[var(--motion-fast)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] ${sizeCls} ${stateCls} ${className}`}
      {...rest}
    >
      <span>{children}</span>
      {removable && onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label="移除标签"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className="ml-0.5 rounded-full px-1 text-[11px] opacity-70 hover:opacity-100"
        >
          ✕
        </span>
      )}
    </button>
  );
}
