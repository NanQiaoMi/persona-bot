"use client";

import { useRef, useState } from "react";
import { Button, FieldInput, FieldTextarea, Modal } from "@/components/primitives";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="📥 导入聊天记录并蒸馏角色灵魂"
      description="支持微信 / iMessage 导出文本或直接粘贴对话片段"
      bodyClassName="p-5 space-y-4 text-[12px]"
    >
      {!stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-secondary mb-1">
                对方昵称 *
              </label>
              <FieldInput
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="例如：小美、阿杰..."
                className="!bg-surface-base !text-[12px]"
              />
            </div>
            <div>
              <label className="block text-secondary mb-1">
                关系简述（可选）
              </label>
              <FieldInput
                type="text"
                value={basicInfo}
                onChange={(e) => setBasicInfo(e.target.value)}
                placeholder="例如：大学同学 / 深夜搭子"
                className="!bg-surface-base !text-[12px]"
              />
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-4 rounded-[var(--r-md)] border-2 border-dashed border-[var(--border-strong)] hover:border-brand bg-surface-base text-center cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.html,.json,.md"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="text-brand font-medium">
                ✓ 已加载文件：{file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            ) : (
              <div className="text-secondary">
                📂 点击上传聊天记录文件 (.txt / .csv / .html / .json)
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-secondary">
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
                className="text-brand hover:underline text-[11px] cursor-pointer"
              >
                填入示例语料
              </button>
            </div>
            <FieldTextarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={4}
              placeholder="2026-05-01 21:00:00 小美: 笑死，你今天怎么这么晚才回消息..."
              className="!bg-surface-base !text-[12px] !font-mono"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-[var(--r-sm)] bg-danger-soft text-danger">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            disabled={loading}
            loading={loading}
            onClick={handleImportAndDistill}
            className="w-full"
          >
            {loading
              ? "正在解析语料并蒸馏五层人格..."
              : "✨ 开始解析并生成专属角色"}
          </Button>
        </>
      ) : (
        <div className="py-4 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-[var(--r-lg)] bg-brand-soft text-brand flex items-center justify-center text-[20px]">
            ✨
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-primary">
              「{targetName}」灵魂蒸馏完成！
            </h4>
            <p className="text-secondary mt-1">
              共提取 {stats.totalCount} 条消息，识别高频口头禅：
              {stats.topCatchphrases.join(" / ")}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleFinish}
            className="w-full"
          >
            立即与「{targetName}」对话 →
          </Button>
        </div>
      )}
    </Modal>
  );
}
