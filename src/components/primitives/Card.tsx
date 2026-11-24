"use client";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "flat" | "raised";
  padding?: "none" | "sm" | "md" | "lg";
}

const PADDING_MAP = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({
  variant = "flat",
  padding = "md",
  className = "",
  children,
  ...rest
}: CardProps) {
  const variantCls =
    variant === "raised"
      ? "bg-surface-overlay border border-[var(--border-subtle)] shadow-raised"
      : "bg-surface-raised border border-[var(--border-subtle)]";

  return (
    <div
      className={`rounded-[var(--r-lg)] ${variantCls} ${PADDING_MAP[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
