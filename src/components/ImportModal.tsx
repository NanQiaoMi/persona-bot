"use client";

import { useRef, useState } from "react";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { slug: string; name: string }) => void;
}

export default function ImportModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportModalProps) {
  const [targetName, setTargetName] = useState("");
  const [basicInfo, setBasicInfo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{
    totalCount: number;
    targetCount: number;
    topCatchphrases: string[];
  } | null>(null);
  const [createdSlug, setCreatedSlug] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError("");
    const text = await selected.text();
    setRawText(text);
    if (!targetName.trim()) {
      setTargetName(
        selected.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]/g, " ")
          .slice(0, 16)
      );
    }
  };

  const handleImportAndDistill = async () => {
    if (!targetName.trim()) {
      setError("请输入对方昵称");
      return;
    }
    if (!rawText.trim()) {
      setError("请选择聊天记录文件或直接粘贴聊天记录内容");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/persona/pipeline-v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: targetName.trim(),
          basicInfo: basicInfo.trim() || "通过真实聊天记录导入蒸馏的专属角色",
          chatLogText: rawText,
          targetSpeaker: targetName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "导入蒸馏失败");
      }

      setCreatedSlug(data.slug);
      setStats(
        data.chatStats || {
          totalCount: rawText.split("\n").length,
          targetCount: rawText.split("\n").length,
          topCatchphrases: ["真实口语", "专属记忆"],
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    const slug = createdSlug;
    const name = targetName.trim();
    setTargetName("");
    setBasicInfo("");
    setFile(null);
    setRawText("");
    setStats(null);
    setCreatedSlug("");
    onSuccess?.({ slug, name });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold">
              📥 导入聊天记录并蒸馏角色灵魂
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              支持微信 / iMessage 导出文本或直接粘贴对话片段
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-xs text-[var(--text-secondary)]"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {!stats ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    对方昵称 *
                  </label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="例如：小美、阿杰..."
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    关系简述（可选）
                  </label>
                  <input
                    type="text"
                    value={basicInfo}
                    onChange={(e) => setBasicInfo(e.target.value)}
                    placeholder="例如：大学同学 / 深夜搭子"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-xl border-2 border-dashed border-[var(--border-strong)] hover:border-emerald-500/50 bg-[var(--bg-primary)]/50 text-center cursor-pointer transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.html,.json,.md"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {file ? (
                  <div className="text-emerald-300 font-medium">
                    ✓ 已加载文件：{file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                ) : (
                  <div className="text-[var(--text-secondary)]">
                    📂 点击上传聊天记录文件 (.txt / .csv / .html / .json)
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[var(--text-secondary)]">
                    或直接粘贴聊天记录内容
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!targetName.trim()) setTargetName("林小鹿");
                      setRawText(
                        `2026-05-01 22:10:00 林小鹿: 笑死，你今天怎么才想起来找我\n2026-05-01 22:11:00 我: 刚忙完手头的事\n2026-05-01 22:12:00 林小鹿: 不是吧，那你得请我喝冰美式赔罪！`
                      );
                    }}
                    className="text-emerald-400 hover:underline text-[11px]"
                  >
                    填入示例语料
                  </button>
                </div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={4}
                  placeholder="2026-05-01 21:00:00 小美: 笑死，你今天怎么这么晚才回消息..."
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs font-mono focus:outline-none"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handleImportAndDistill}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs"
              >
                {loading
                  ? "正在解析语料并蒸馏五层人格..."
                  : "✨ 开始解析并生成专属角色"}
              </button>
            </>
          ) : (
            <div className="py-4 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-2xl">
                ✨
              </div>
              <div>
                <h4 className="text-sm font-bold">
                  「{targetName}」灵魂蒸馏完成！
                </h4>
                <p className="text-[var(--text-secondary)] mt-1">
                  共提取 {stats.totalCount} 条消息，识别高频口头禅：
                  {stats.topCatchphrases.join(" / ")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                立即与「{targetName}」对话 →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
