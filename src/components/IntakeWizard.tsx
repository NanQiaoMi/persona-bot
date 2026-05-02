"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PIPELINE_STAGES = [
  { id: 'input',    icon: '📝', label: '信息录入',    desc: '填写基础信息和性格碎片' },
  { id: 'imagine',  icon: '🎭', label: 'AI 人物想象', desc: 'AI 正在创造完整的人物形象...' },
  { id: 'analyze',  icon: '🔬', label: '深度分析',    desc: 'ex-skill 引擎提取性格结构' },
  { id: 'build',    icon: '🧪', label: '精准构建',    desc: '生成 Persona + Memories' },
  { id: 'done',     icon: '✨', label: '创建完成',    desc: '已就绪，即将进入聊天' },
];

interface PipelineResult {
  success: boolean;
  slug: string;
  stages?: {
    aiProfile: string;
    analysis: string;
    persona: string;
    memories: string;
  };
  summary: {
    name: string;
    mbti: string;
    attachment: string;
    tags: string[];
  };
  error?: string;
}

export default function IntakeWizard() {
  const router = useRouter();
  const [phase, setPhase] = useState<'form' | 'processing' | 'review'>('form');
  const [formStep, setFormStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    basicInfo: '',
    personalityInfo: ''
  });

  const [pipelineStage, setPipelineStage] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const stageTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (stageTimerRef.current) clearInterval(stageTimerRef.current); };
  }, []);

  const startPipeline = async () => {
    setPhase('processing');
    setPipelineStage(1);
    setError('');
    setPreviewContent('');

    stageTimerRef.current = setInterval(() => {
      setPipelineStage(prev => {
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 10000);

    try {
      const res = await fetch('/api/persona/pipeline-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          basicInfo: formData.basicInfo,
          personalityInfo: formData.personalityInfo,
        })
      });

      if (stageTimerRef.current) clearInterval(stageTimerRef.current);

      const data: PipelineResult = await res.json();

      if (data.success) {
        setPipelineStage(4);
        setResult(data);
        if (data.stages?.aiProfile) {
          setPreviewContent(data.stages.aiProfile);
        }
        setTimeout(() => setPhase('review'), 1500);
      } else {
        setError(data.error || '创建失败');
        setPhase('form');
      }
    } catch (e: unknown) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setError(e instanceof Error ? e.message : '创建失败');
      setPhase('form');
    }
  };

  const goToChat = () => {
    if (result?.slug) router.push(`/chat/${result.slug}`);
  };

  // --- FORM PHASE ---
  if (phase === 'form') {
    return (
      <div className="px-4 py-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="w-9 h-9 rounded-lg bg-white/60 backdrop-blur-sm flex items-center justify-center text-[#576B95] hover:text-[#07C160] hover:bg-white/80 transition-all border border-white/40">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-semibold text-[#353535]">创建角色</h1>
          <div className="w-9" />
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                step <= formStep 
                  ? 'bg-gradient-to-r from-[#07C160] to-[#06AD56] shadow-sm shadow-[#07C160]/30' 
                  : 'bg-[#E5E5E5]/60'
              }`}
            />
          ))}
        </div>

        {/* Form Card */}
        <div className="glass-card rounded-2xl p-6 mb-4">
          {formStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-[#353535] mb-1.5">她叫什么名字？</h2>
                <p className="text-sm text-[#999999]">可以是真名，也可以是你们之间的代号</p>
              </div>
              <input
                autoFocus
                type="text"
                className="w-full glass-input rounded-xl px-4 py-3.5 text-[15px] text-[#353535] placeholder-[#CCCCCC]"
                placeholder="例如：小美、糖糖、Luna..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && formData.name.trim() && setFormStep(2)}
              />
            </div>
          )}

          {formStep === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-[#353535] mb-1.5">你们的故事</h2>
                <p className="text-sm text-[#999999]">在一起多久、怎么认识的、她做什么的...</p>
              </div>
              <textarea
                autoFocus
                className="w-full glass-input rounded-xl px-4 py-3.5 h-32 text-[15px] text-[#353535] placeholder-[#CCCCCC] leading-relaxed resize-none"
                placeholder="例如：大学同学，在一起三年，毕业后异地分手一年了，她做设计..."
                value={formData.basicInfo}
                onChange={(e) => setFormData({ ...formData, basicInfo: e.target.value })}
              />
            </div>
          )}

          {formStep === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-[#353535] mb-1.5">她是什么样的人？</h2>
                <p className="text-sm text-[#999999]">MBTI、依恋类型、恋爱中的样子...</p>
              </div>
              <textarea
                autoFocus
                className="w-full glass-input rounded-xl px-4 py-3.5 h-32 text-[15px] text-[#353535] placeholder-[#CCCCCC] leading-relaxed resize-none"
                placeholder="例如：ENFP，焦虑型依恋，爱撒娇也爱翻旧账..."
                value={formData.personalityInfo}
                onChange={(e) => setFormData({ ...formData, personalityInfo: e.target.value })}
              />
              <div>
                <p className="text-xs text-[#999999] mb-2.5">快速标签（点击添加）</p>
                <div className="flex flex-wrap gap-2">
                  {['爱撒娇', '冷暴力', '翻旧账', '黏人', '独立', '细腻敏感', '忽冷忽热', '情绪稳定', '焦虑型', '回避型'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        const current = formData.personalityInfo;
                        if (!current.includes(tag)) {
                          setFormData({ ...formData, personalityInfo: current ? `${current} ${tag}` : tag });
                        }
                      }}
                      className={`px-3 py-1.5 text-xs rounded-full transition-all duration-200 ${
                        formData.personalityInfo.includes(tag)
                          ? 'bg-[#07C160] text-white shadow-sm shadow-[#07C160]/30'
                          : 'bg-white/60 text-[#666666] border border-[#E5E5E5]/60 hover:bg-white/80 hover:border-[#07C160]/30'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3.5 mb-4 rounded-xl bg-[#FA5151]/10 backdrop-blur-sm text-[#FA5151] text-sm border border-[#FA5151]/20">
            {error}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3">
          {formStep > 1 && (
            <button
              onClick={() => setFormStep(formStep - 1)}
              className="flex-1 py-3 rounded-xl glass text-[#666666] text-sm font-medium hover:bg-white/80 transition-all"
            >
              上一步
            </button>
          )}
          
          {formStep < 3 ? (
            <button
              onClick={() => setFormStep(formStep + 1)}
              disabled={formStep === 1 && !formData.name.trim()}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#07C160] to-[#06AD56] hover:from-[#06AD56] hover:to-[#059A4F] text-white text-sm font-medium transition-all shadow-sm shadow-[#07C160]/30 hover:shadow-md hover:shadow-[#07C160]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {formStep === 2 && !formData.basicInfo.trim() ? '跳过' : '下一步'}
            </button>
          ) : (
            <button
              onClick={startPipeline}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#07C160] to-[#06AD56] hover:from-[#06AD56] hover:to-[#059A4F] text-white text-sm font-medium transition-all shadow-sm shadow-[#07C160]/30 hover:shadow-md hover:shadow-[#07C160]/40"
            >
              开始构建
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- PROCESSING PHASE ---
  if (phase === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="w-full max-w-sm space-y-8 animate-scale-in">
          {/* Animation */}
          <div className="relative w-28 h-28 mx-auto">
            <div className="absolute inset-0 rounded-full bg-[#07C160]/5 animate-pulse-soft" />
            <div className="absolute inset-2 rounded-full border-2 border-[#E5E5E5]/60" />
            <div className="absolute inset-2 rounded-full border-2 border-t-[#07C160] animate-spin" />
            <div className="absolute inset-5 rounded-full border-2 border-[#E5E5E5]/40" />
            <div className="absolute inset-5 rounded-full border-2 border-t-[#576B95] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">
              {PIPELINE_STAGES[pipelineStage]?.icon}
            </div>
          </div>

          {/* Stage Info */}
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-[#353535]">{PIPELINE_STAGES[pipelineStage]?.label}</h2>
            <p className="text-sm text-[#999999]">{PIPELINE_STAGES[pipelineStage]?.desc}</p>
          </div>

          {/* Progress Steps */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            {PIPELINE_STAGES.slice(1).map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 transition-all duration-500 ${
                  i + 1 < pipelineStage 
                    ? 'bg-[#07C160] text-white shadow-sm shadow-[#07C160]/30' :
                  i + 1 === pipelineStage 
                    ? 'bg-[#07C160]/10 text-[#07C160] animate-pulse-soft' :
                    'bg-[#F7F7F7]/60 text-[#CCCCCC]'
                }`}>
                  {i + 1 < pipelineStage ? '✓' : stage.icon}
                </div>
                <span className={`text-sm transition-colors ${
                  i + 1 <= pipelineStage ? 'text-[#353535]' : 'text-[#CCCCCC]'
                }`}>
                  {stage.label}
                </span>
                {i + 1 === pipelineStage && (
                  <div className="flex-1 h-1 bg-[#E5E5E5]/60 rounded-full overflow-hidden ml-auto">
                    <div className="h-full bg-gradient-to-r from-[#07C160] to-[#06AD56] rounded-full animate-shimmer" style={{ width: '60%' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-[#999999]">
            正在为 {formData.name} 创造完整的人物形象...
          </p>
        </div>
      </div>
    );
  }

  // --- REVIEW PHASE ---
  return (
    <div className="px-4 py-8 space-y-5 animate-fade-in">
      {/* Success */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#07C160]/20 to-[#576B95]/20 flex items-center justify-center text-3xl backdrop-blur-sm border border-white/40">
          ✨
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[#353535]">{result?.summary.name} 已就绪</h1>
          <p className="text-sm text-[#999999] mt-1">AI 已完成人格建模</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {result?.summary.mbti && (
          <div className="glass-card rounded-xl p-3.5 text-center">
            <p className="text-[10px] text-[#999999] mb-1.5 font-medium uppercase tracking-wider">MBTI</p>
            <p className="text-sm font-semibold text-[#07C160]">{result.summary.mbti}</p>
          </div>
        )}
        {result?.summary.attachment && (
          <div className="glass-card rounded-xl p-3.5 text-center">
            <p className="text-[10px] text-[#999999] mb-1.5 font-medium uppercase tracking-wider">依恋类型</p>
            <p className="text-sm font-semibold text-[#576B95]">{result.summary.attachment}</p>
          </div>
        )}
        <div className="glass-card rounded-xl p-3.5 text-center">
          <p className="text-[10px] text-[#999999] mb-1.5 font-medium uppercase tracking-wider">性格标签</p>
          <p className="text-xs font-medium text-[#666666]">{result?.summary.tags?.slice(0, 2).join('·') || '—'}</p>
        </div>
      </div>

      {/* Preview */}
      {previewContent && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-[#07C160]/10 flex items-center justify-center">
              <span className="text-xs">🤖</span>
            </div>
            <span className="text-xs font-medium text-[#353535]">AI 创造的人物形象</span>
          </div>
          <div className="text-sm leading-relaxed text-[#666666] whitespace-pre-line">
            {previewContent}
          </div>
        </div>
      )}

      {/* Action */}
      <button
        onClick={goToChat}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#07C160] to-[#06AD56] hover:from-[#06AD56] hover:to-[#059A4F] text-white font-medium transition-all shadow-sm shadow-[#07C160]/30 hover:shadow-md hover:shadow-[#07C160]/40"
      >
        开始对话
      </button>
    </div>
  );
}
