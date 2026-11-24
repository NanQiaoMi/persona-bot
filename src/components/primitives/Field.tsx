"use client";

import { forwardRef, useId } from "react";

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className = "",
  children,
}: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-[12px] font-medium text-secondary">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-danger leading-relaxed">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-muted leading-relaxed">{hint}</p>
      )}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-[var(--r-md)] bg-surface-raised border border-[var(--border-subtle)] px-3 py-2 text-[13px] text-primary placeholder:text-muted outline-none transition-colors duration-[var(--motion-fast)] focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/20 disabled:opacity-50";

export const FieldInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(function FieldInput({ hasError, className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={hasError || undefined}
      className={`${CONTROL_BASE} ${
        hasError ? "border-[var(--sem-danger)] focus:border-[var(--sem-danger)] focus:ring-[var(--sem-danger)]/20" : ""
      } ${className}`}
      {...rest}
    />
  );
});

export const FieldTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(function FieldTextarea({ hasError, className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={hasError || undefined}
      className={`${CONTROL_BASE} resize-none leading-relaxed ${
        hasError ? "border-[var(--sem-danger)] focus:border-[var(--sem-danger)] focus:ring-[var(--sem-danger)]/20" : ""
      } ${className}`}
      {...rest}
    />
  );
});

export const FieldSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }
>(function FieldSelect({ hasError, className = "", children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={hasError || undefined}
      className={`${CONTROL_BASE} cursor-pointer ${
        hasError ? "border-[var(--sem-danger)] focus:border-[var(--sem-danger)] focus:ring-[var(--sem-danger)]/20" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});
