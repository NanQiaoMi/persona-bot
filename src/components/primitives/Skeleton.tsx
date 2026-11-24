"use client";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "line" | "circle" | "card";
}

export function Skeleton({ variant = "line", className = "", ...rest }: SkeletonProps) {
  const baseCls = "animate-skeleton-shimmer";

  const shapeCls =
    variant === "circle"
      ? "rounded-full w-10 h-10"
      : variant === "card"
        ? "rounded-[var(--r-lg)] w-full h-24"
        : "rounded-[var(--r-sm)] w-full h-4";

  return <div aria-hidden="true" className={`${baseCls} ${shapeCls} ${className}`} {...rest} />;
}
