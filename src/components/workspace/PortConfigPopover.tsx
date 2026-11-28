"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCAL_GATEWAY_BASE_URL } from "@/lib/grok/models";
import {
  EndpointParts,
  inferProvider,
  isValidPort,
  joinBaseUrl,
  splitBaseUrl,
} from "@/lib/settings/endpoint";

export type GatewayStatus =
  | "unknown"
  | "testing"
  | "ok"
  | "unauthorized"
  | "offline"
  | "error";

const STATUS_STYLE: Record<GatewayStatus, { dot: string; label: string }> = {
  unknown: { dot: "bg-[var(--text-muted)]", label: "未检测" },
  testing: { dot: "bg-amber-400 animate-pulse", label: "检测中" },
  ok: { dot: "bg-emerald-500", label: "已连接" },
  unauthorized: { dot: "bg-amber-500", label: "需要密钥" },
  offline: { dot: "bg-rose-500", label: "连不上" },
  error: { dot: "bg-rose-500", label: "异常" },
};

const PRESETS: Array<{ label: string; url: string }> = [
  { label: "本地网关 18630", url: LOCAL_GATEWAY_BASE_URL },
  { label: "Ollama 11434", url: "http://localhost:11434/v1" },
];

export async function testGateway(
  baseUrl: string
): Promise<{ status: GatewayStatus; message: string; modelCount: number }> {
  try {
    const res = await fetch("/api/settings/test-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, useStoredKey: true }),
    });
    const data = await res.json();
    const status: GatewayStatus =
      data?.authStatus === "ok"
        ? "ok"
        : data?.authStatus === "unauthorized"
          ? "unauthorized"
          : data?.authStatus === "offline"
            ? "offline"
            : "error";
    return {
      status,
      message: String(data?.message || ""),
      modelCount: Array.isArray(data?.models) ? data.models.length : 0,
    };
  } catch {
    return { status: "offline", message: "检测请求失败，请确认应用服务正常", modelCount: 0 };
  }
}

export function StatusDot({ status }: { status: GatewayStatus }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[status].dot}`}
    />
  );
}

export function statusLabel(status: GatewayStatus): string {
  return STATUS_STYLE[status].label;
}

interface PortConfigPopoverProps {
  onClose: () => void;
  onOpenFullSettings: () => void;
  /** 测试或保存后把最新连接状态告诉入口按钮 */
  onStatusChange: (status: GatewayStatus) => void;
  /** 入口按钮上已经测到的状态，弹层打开时直接沿用 */
  initialStatus?: GatewayStatus;
}

/**
 * 左下角「配置端口」弹层：只管模型网关（对话与生图共用）的地址和端口，
 * 不经手密钥；更细的模型、密钥、搜索在完整设置里改。
 */
export default function PortConfigPopover({
  onClose,
  onOpenFullSettings,
  onStatusChange,
  initialStatus = "unknown",
}: PortConfigPopoverProps) {
  const [parts, setParts] = useState<EndpointParts | null>(null);
  const [savedUrl, setSavedUrl] = useState("");
  const [status, setStatus] = useState<GatewayStatus>(initialStatus);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = await res.json();
        const url = String(data?.settings?.llmBaseUrl || LOCAL_GATEWAY_BASE_URL);
        if (cancelled) return;
        setSavedUrl(url);
        setParts(splitBaseUrl(url));
      } catch {
        if (!cancelled) setParts(splitBaseUrl(LOCAL_GATEWAY_BASE_URL));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 点弹层外面或按 Esc 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // 点入口按钮本身交给按钮自己开关，避免关了又立刻打开
      if (target?.closest?.("[data-port-trigger]")) return;
      if (boxRef.current && !boxRef.current.contains(target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const portOk = parts ? isValidPort(parts.port) : true;
  const url = parts ? joinBaseUrl(parts) : "";
  const dirty = Boolean(parts) && url !== savedUrl;

  const runTest = useCallback(
    // report：测的是已保存的地址时，才把结果同步给入口按钮
    async (target: string, report: boolean) => {
      setStatus("testing");
      setMessage("");
      const r = await testGateway(target);
      setStatus(r.status);
      if (report) onStatusChange(r.status);
      setMessage(
        r.status === "ok"
          ? `连上了，发现 ${r.modelCount} 个模型`
          : r.message || statusLabel(r.status)
      );
      return r.status;
    },
    [onStatusChange]
  );

  const handleSave = async () => {
    if (!parts || !portOk || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmBaseUrl: url, llmProvider: inferProvider(url) }),
      });
      if (!res.ok) throw new Error("save failed");
      setSavedUrl(url);
      await runTest(url, true);
    } catch {
      setStatus("error");
      setMessage("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<EndpointParts>) =>
    setParts((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="配置端口"
      className="absolute bottom-[62px] left-3.5 right-3.5 rounded-[20px] border border-[var(--border-hairline,var(--border-subtle))] surface-popover bg-[var(--surface-popover,var(--bg-elevated))] backdrop-blur-2xl shadow-[var(--popover-shadow,0_16px_40px_rgba(0,0,0,0.16))] p-3.5 z-40 animate-popover-in text-[12px]"
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          配置端口
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[10.5px] font-medium text-[var(--text-secondary)]">
          <StatusDot status={status} />
          <span>{statusLabel(status)}</span>
        </span>
      </div>

      <div className="text-[11px] text-[var(--text-muted)] mb-1.5">
        模型网关（对话与生图共用）
      </div>
      {parts ? (
        <>
          <div className="flex items-center gap-1.5">
            <select
              aria-label="协议"
              value={parts.protocol}
              onChange={(e) =>
                update({ protocol: e.target.value as EndpointParts["protocol"] })
              }
              className="h-8 rounded-[10px] bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] px-1.5 text-[11.5px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus-ring-color)] transition-surface"
            >
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
            <input
              aria-label="主机地址"
              value={parts.host}
              onChange={(e) => update({ host: e.target.value })}
              placeholder="127.0.0.1"
              className="min-w-0 flex-1 h-8 rounded-[10px] bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] px-2.5 font-mono text-[11.5px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus-ring-color)] transition-surface"
            />
            <span className="text-[var(--text-muted)] font-mono">:</span>
            <input
              aria-label="端口"
              inputMode="numeric"
              value={parts.port}
              onChange={(e) =>
                update({ port: e.target.value.replace(/[^\d]/g, "").slice(0, 5) })
              }
              placeholder="默认"
              className={`w-[64px] h-8 rounded-[10px] bg-[var(--surface-panel,var(--bg-secondary))] border px-2 font-mono text-[11.5px] tabular-nums text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none transition-surface ${
                portOk
                  ? "border-[var(--border-hairline,var(--border-subtle))] focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus-ring-color)]"
                  : "border-rose-500/80 focus:ring-2 focus:ring-rose-500/25"
              }`}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px]">
            <span
              className={`truncate font-mono ${
                portOk ? "text-[var(--text-muted)]" : "text-rose-500"
              }`}
              title={url}
            >
              {portOk ? url : "端口要在 1–65535 之间，留空用默认"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const isPresetActive = url === p.url;
              return (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => setParts(splitBaseUrl(p.url))}
                  className={`px-2.5 py-0.5 rounded-full border text-[10.5px] active:scale-[0.97] transition-interactive focus-ring cursor-pointer ${
                    isPresetActive
                      ? "bg-[var(--surface-active,var(--bg-composer))] border-[var(--border-strong)] text-[var(--text-primary)] font-medium shadow-[var(--active-row-shadow)]"
                      : "border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="h-8 rounded-[10px] bg-[var(--surface-panel,var(--bg-secondary))] animate-pulse" />
      )}

      {message && (
        <p
          className={`mt-2.5 text-[11px] leading-relaxed ${
            status === "ok"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-[var(--text-secondary)]"
          }`}
        >
          {message}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!parts || !portOk || status === "testing"}
          onClick={() => void runTest(url, url === savedUrl)}
          className="py-1.5 rounded-full border border-[var(--border-hairline,var(--border-subtle))] text-[11.5px] font-medium whitespace-nowrap text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:scale-100 transition-interactive focus-ring cursor-pointer"
        >
          {status === "testing" ? "检测中…" : "测试连接"}
        </button>
        <button
          type="button"
          disabled={!dirty || !portOk || saving}
          onClick={() => void handleSave()}
          className="py-1.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] text-[11.5px] font-medium whitespace-nowrap hover:opacity-90 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:opacity-35 disabled:active:scale-100 transition-interactive focus-ring cursor-pointer"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      <div className="mt-2.5 pt-2 border-t border-[var(--border-hairline,var(--border-subtle))]">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenFullSettings();
          }}
          className="w-full py-1 rounded-lg text-center text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-interactive focus-ring cursor-pointer"
        >
          模型与密钥设置 →
        </button>
      </div>
    </div>
  );
}
