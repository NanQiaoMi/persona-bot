"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * 全局反馈层：轻提示 (Toast) + 确认弹窗 (Confirm)。
 * 替代 console.error 静默失败与浏览器原生 alert / confirm。
 */
export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastOptions {
  tone?: ToastTone;
  /** 次要说明：发生了什么 / 怎么办 */
  description?: string;
  /** 可选操作按钮（例如「重试」） */
  action?: { label: string; onClick: () => void };
  /** 显示时长，毫秒；错误默认 6s，其余 3.2s */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  title: string;
  leaving?: boolean;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (title: string, options?: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { dot: string; ring: string }> = {
  success: { dot: "bg-[var(--color-success)]", ring: "ring-[var(--color-success)]/20" },
  info: { dot: "bg-[var(--color-info)]", ring: "ring-[var(--color-info)]/20" },
  warning: { dot: "bg-[var(--color-warning)]", ring: "ring-[var(--color-warning)]/25" },
  error: { dot: "bg-[var(--color-danger)]", ring: "ring-[var(--color-danger)]/25" },
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 180);
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (title: string, options: ToastOptions = {}) => {
      idRef.current += 1;
      const id = idRef.current;
      const tone = options.tone ?? "info";
      setToasts((list) => {
        // 同样的提示短时间内只保留一条，避免网络抖动时刷屏
        const filtered = list.filter((t) => !(t.title === title && !t.leaving));
        return [...filtered, { id, title, ...options, tone }].slice(-4);
      });
      const duration = options.durationMs ?? (tone === "error" ? 6000 : 3200);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
    },
    [dismiss]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...options, resolve });
      }),
    []
  );

  const closeConfirm = useCallback(
    (ok: boolean) => {
      confirmState?.resolve(ok);
      setConfirmState(null);
    },
    [confirmState]
  );

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConfirm(false);
      if (e.key === "Enter") closeConfirm(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmState, closeConfirm]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Toast 区：桌面右上，手机顶部居中 */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed z-[100] top-3 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 flex flex-col gap-2 w-[min(92vw,360px)]"
      >
        {toasts.map((t) => {
          const tone = TONE_STYLES[t.tone ?? "info"];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] backdrop-blur-2xl px-3.5 py-3 shadow-[var(--shadow-overlay)] ring-4 ${tone.ring} ${
                t.leaving ? "animate-toast-out" : "animate-toast-in"
              }`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">{t.title}</div>
                {t.description && (
                  <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    {t.description}
                  </div>
                )}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="关闭提示"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer text-xs leading-5"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-[2px] animate-fade-in"
          onClick={() => closeConfirm(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[380px] rounded-t-[24px] sm:rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] backdrop-blur-2xl p-5 shadow-[var(--shadow-overlay)] animate-popover-in"
          >
            <div id="confirm-title" className="text-[15px] font-semibold text-[var(--text-primary)]">
              {confirmState.title}
            </div>
            {confirmState.description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {confirmState.description}
              </p>
            )}
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="rounded-full px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                {confirmState.cancelLabel ?? "取消"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeConfirm(true)}
                className={`rounded-full px-4 py-2 text-[13px] font-medium text-white cursor-pointer ${
                  confirmState.danger
                    ? "bg-[var(--color-danger)] hover:brightness-95"
                    : "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90"
                }`}
              >
                {confirmState.confirmLabel ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

const NOOP: FeedbackContextValue = {
  toast: () => {},
  confirm: async () => false,
};

export function useFeedback(): FeedbackContextValue {
  return useContext(FeedbackContext) ?? NOOP;
}

/**
 * 把网络 / 接口错误翻译成用户能看懂的一句话
 */
export function describeRequestError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/Failed to fetch|NetworkError|ERR_CONNECTION|fetch failed|Load failed/i.test(msg)) {
    return "连不上本地服务，确认 npm run dev 还在运行后重试";
  }
  if (/timeout|aborted/i.test(msg)) return "请求超时了，稍后再试";
  if (/\b5\d\d\b/.test(msg)) return "服务出了点问题，稍后再试";
  if (/\b404\b/.test(msg)) return "要找的内容不存在了";
  return "请稍后再试";
}
