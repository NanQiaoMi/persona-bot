"use client";

import { Modal } from "@/components/primitives";

interface ShortcutItem {
  keys: string[];
  description: string;
}

const SHORTCUT_ITEMS: ShortcutItem[] = [
  { keys: ["⌘", "K"], description: "打开全局命令面板 / 快速搜索角色" },
  { keys: ["⌘", "N"], description: "创建或导入新人格角色" },
  { keys: ["⌘", "⇧", "I"], description: "展开 / 收起右侧人物洞察与记忆面板" },
  { keys: ["⌘", "1~9"], description: "快速切换到侧边栏第 1~9 个角色" },
  { keys: ["Enter"], description: "发送消息（Shift + Enter 换行）" },
  { keys: ["?"], description: "打开 / 关闭此快捷键速查面板" },
  { keys: ["Esc"], description: "关闭当前弹窗或抽屉" },
];

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={
        <span className="inline-flex items-center gap-2">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-brand"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 16h10" />
          </svg>
          <span>键盘快捷键</span>
        </span>
      }
      description="在非输入框聚焦状态下按 ? 可随时呼出此速查表（Windows/Linux 请将 ⌘ 替换为 Ctrl）。"
    >
      <div className="space-y-2">
        {SHORTCUT_ITEMS.map((item) => (
          <div
            key={item.description}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5"
          >
            <span className="text-[13px] text-[var(--text-primary)]">{item.description}</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              {item.keys.map((key) => (
                <kbd
                  key={key}
                  className="inline-flex min-w-[24px] items-center justify-center rounded border border-[var(--border-default)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default ShortcutsModal;
