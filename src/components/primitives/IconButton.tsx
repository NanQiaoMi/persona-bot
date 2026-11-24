"use client";

import { forwardRef } from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 32 | 36;
  variant?: "ghost" | "secondary" | "danger";
}

const SIZE_MAP: Record<32 | 36, string> = {
  32: "w-8 h-8 rounded-[var(--r-md)]",
  36: "w-9 h-9 rounded-[var(--r-md)]",
};

const VARIANT_MAP: Record<"ghost" | "secondary" | "danger", string> = {
  ghost:
    "bg-transparent text-secondary hover:text-primary hover:bg-[var(--bg-hover)]",
  secondary:
    "bg-surface-raised text-primary hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]",
  danger:
    "bg-transparent text-danger hover:bg-danger-soft",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 32, variant = "ghost", className = "", type = "button", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={`inline-flex items-center justify-center shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] ${SIZE_MAP[size]} ${VARIANT_MAP[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
