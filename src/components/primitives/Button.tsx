"use client";

import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover border border-transparent shadow-flat",
  secondary:
    "bg-surface-raised text-primary hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]",
  ghost:
    "bg-transparent text-secondary hover:text-primary hover:bg-[var(--bg-hover)] border border-transparent",
  danger:
    "bg-danger text-white hover:brightness-95 border border-transparent shadow-flat",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px] rounded-full gap-1.5",
  md: "h-9 px-4 text-[13px] rounded-full gap-2",
  lg: "h-11 px-5 text-[14px] rounded-full gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconLeft,
    disabled,
    className = "",
    type = "button",
    children,
    ...rest
  },
  ref
) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-medium transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-base)] ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0"
        />
      ) : (
        iconLeft && <span className="shrink-0 inline-flex items-center">{iconLeft}</span>
      )}
      {children}
    </button>
  );
});
