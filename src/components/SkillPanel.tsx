"use client";

import { useState, useEffect } from 'react';

interface Skill {
  slug: string;
  name: string;
  identity: string;
  version: string;
  corrections_count: number;
}

interface SkillPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSkill?: (skill: Skill) => void;
}

export default function SkillPanel({ isOpen, onClose, onSelectSkill }: SkillPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSkills();
    }
  }, [isOpen]);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ex-skill?action=list');
      const data = await res.json();
      if (data.success) {
        setSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    onSelectSkill?.(skill);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-md glass-strong rounded-2xl overflow-hidden animate-scale-in max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#576B95]/10 flex items-center justify-center">
              <span className="text-sm">🧩</span>
            </div>
            <h3 className="text-base font-semibold text-[#353535]">技能管理</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-[#999999]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-[#E5E5E5]" />
                <div className="absolute inset-0 rounded-full border-2 border-t-[#576B95] animate-spin" />
              </div>
              <p className="text-sm text-[#999999]">加载技能列表...</p>
            </div>
          ) : skills.length === 0 ? (
            <div className="py-12 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F7F7F7] flex items-center justify-center mb-4">
                <span className="text-3xl">🧩</span>
              </div>
              <h4 className="text-base font-medium text-[#353535] mb-1">暂无技能</h4>
              <p className="text-sm text-[#999999] text-center max-w-[240px]">
                导入聊天记录后，系统会自动创建对应的技能
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#999999] font-medium uppercase tracking-wider">
                已安装 {skills.length} 个技能
              </p>
              
              {skills.map((skill) => {
                const isSelected = selectedSkill?.slug === skill.slug;
                return (
                  <button
                    key={skill.slug}
                    onClick={() => handleSelect(skill)}
                    className={`w-full text-left p-4 rounded-xl transition-all ${
                      isSelected
                        ? 'glass-card border-[#07C160]/30 bg-[#07C160]/5'
                        : 'glass-card hover:bg-white/60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="text-sm font-medium text-[#353535] truncate">
                            {skill.name}
                          </h5>
                          {skill.version && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-[#576B95]/10 text-[#576B95] rounded font-medium">
                              {skill.version}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#999999] truncate">
                          {skill.identity || skill.slug}
                        </p>
                        {skill.corrections_count > 0 && (
                          <p className="text-[10px] text-[#07C160] mt-1.5">
                            已纠正 {skill.corrections_count} 次
                          </p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-[#D0D0D0] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#E5E5E5]/50 shrink-0">
          <button
            onClick={loadSkills}
            className="w-full py-2.5 rounded-xl glass text-sm text-[#666666] font-medium hover:bg-white/80 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新列表
          </button>
        </div>
      </div>
    </div>
  );
}
