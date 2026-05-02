"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

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

    // 模拟阶段进度
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
        // 显示AI生成的人物预览
        if (data.stages?.aiProfile) {
          setPreviewContent(data.stages.aiProfile);
        }
        setTimeout(() => setPhase('review'), 1500);
      } else {
        setError(data.error || '创建失败');
        setPhase('form');
      }
    } catch (e: any) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setError(e.message);
      setPhase('form');
    }
  };

  const goToChat = () => {
    if (result?.slug) router.push(`/chat/${result.slug}`);
  };

  // --- FORM PHASE ---
  if (phase === 'form') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-6">
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-10 space-y-8 relative overflow-hidden">
          {/* Progress */}
          <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${(formStep / 3) * 100}%` }} />
          </div>

          {/* Step Counter */}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-mono">{formStep}/3</span>
            <span>基础信息录入</span>
          </div>

          {formStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-white">她叫什么名字？</h2>
                <p className="text-zinc-400">可以是真名，也可以是你们之间的代号。</p>
              </div>
              <input
                autoFocus
                type="text"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-lg text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                placeholder="例如：小美、糖糖、Luna..."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && formData.name.trim() && setFormStep(2)}
              />
            </div>
          )}

          {formStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-white">你们的故事</h2>
                <p className="text-zinc-400">在一起多久、怎么认识的、她做什么的...想到什么写什么，也可以跳过。</p>
              </div>
              <textarea
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 h-36 text-sm text-white placeholder-zinc-600 leading-relaxed focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                placeholder="例如：大学同学，在一起三年，毕业后异地分手一年了，她做设计..."
                value={formData.basicInfo}
                onChange={(e) => setFormData({ ...formData, basicInfo: e.target.value })}
              />
            </div>
          )}

          {formStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-white">她是什么样的人？</h2>
                <p className="text-zinc-400">MBTI、依恋类型、恋爱中的样子、你对她的印象...越详细越好</p>
              </div>
              <textarea
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 h-36 text-sm text-white placeholder-zinc-600 leading-relaxed focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                placeholder="例如：ENFP，焦虑型依恋，爱撒娇也爱翻旧账，嘴上说不在意其实比谁都在意..."
                value={formData.personalityInfo}
                onChange={(e) => setFormData({ ...formData, personalityInfo: e.target.value })}
              />
              {/* Quick Tags */}
              <div className="space-y-2">
                <p className="text-xs text-zinc-600">快速标签（点击添加）</p>
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
                      className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        formData.personalityInfo.includes(tag)
                          ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-300'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-300'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center pt-4">
            {formStep > 1 ? (
              <button onClick={() => setFormStep(formStep - 1)} className="text-zinc-500 hover:text-white transition-colors text-sm">
                ← 上一步
              </button>
            ) : <div />}

            {formStep < 3 ? (
              <button
                onClick={() => setFormStep(formStep + 1)}
                disabled={formStep === 1 && !formData.name.trim()}
                className="px-8 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-all text-sm font-medium text-white disabled:opacity-30"
              >
                {formStep === 2 && !formData.basicInfo.trim() ? '跳过' : '继续'}
              </button>
            ) : (
              <button
                onClick={startPipeline}
                className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
              >
                <span>开始构建</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- PROCESSING PHASE ---
  if (phase === 'processing') {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-10">
          {/* Central animation */}
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-3 border-4 border-purple-500/10 rounded-full" />
            <div className="absolute inset-3 border-4 border-t-transparent border-r-purple-500 border-b-transparent border-l-transparent rounded-full animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">
              {PIPELINE_STAGES[pipelineStage]?.icon}
            </div>
          </div>

          {/* Stage info */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">{PIPELINE_STAGES[pipelineStage]?.label}</h2>
            <p className="text-sm text-zinc-500">{PIPELINE_STAGES[pipelineStage]?.desc}</p>
          </div>

          {/* Pipeline progress */}
          <div className="space-y-3">
            {PIPELINE_STAGES.slice(1).map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 transition-all duration-500 ${
                  i + 1 < pipelineStage ? 'bg-emerald-500/20 text-emerald-400' :
                  i + 1 === pipelineStage ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' :
                  'bg-white/5 text-zinc-600'
                }`}>
                  {i + 1 < pipelineStage ? '✓' : stage.icon}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium transition-colors ${i + 1 <= pipelineStage ? 'text-white' : 'text-zinc-600'}`}>
                    {stage.label}
                  </p>
                </div>
                <div className={`w-16 h-1 rounded-full overflow-hidden bg-white/5`}>
                  <div className={`h-full transition-all duration-1000 ${
                    i + 1 < pipelineStage ? 'w-full bg-emerald-500' :
                    i + 1 === pipelineStage ? 'w-1/2 bg-indigo-500 animate-pulse' :
                    'w-0'
                  }`} />
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-zinc-600">
            正在为 {formData.name} 创造完整的人物形象... 请勿关闭页面
          </p>
        </div>
      </div>
    );
  }

  // --- REVIEW PHASE ---
  return (
    <div className="max-w-3xl mx-auto py-12 px-6 space-y-8">
      {/* Success Header */}
      <div className="text-center space-y-4 animate-in fade-in zoom-in duration-700">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 flex items-center justify-center text-4xl">
          ✨
        </div>
        <h1 className="text-3xl font-bold text-white">{result?.summary.name} 已就绪</h1>
        <p className="text-zinc-400 text-sm">AI 已完成人格建模，以下是她的核心画像</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        {result?.summary.mbti && (
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-center space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">MBTI</p>
            <p className="text-xl font-bold text-indigo-400">{result.summary.mbti}</p>
          </div>
        )}
        {result?.summary.attachment && (
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-center space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">依恋类型</p>
            <p className="text-lg font-bold text-purple-400">{result.summary.attachment}</p>
          </div>
        )}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-center space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">性格标签</p>
          <p className="text-sm font-medium text-zinc-300">{result?.summary.tags?.slice(0, 3).join('·') || '—'}</p>
        </div>
      </div>

      {/* AI Generated Profile Preview */}
      {previewContent && (
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
          <div className="flex items-center gap-2 text-indigo-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0z" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider">AI 创造的人物形象</span>
          </div>
          <div className="text-sm leading-[1.9] text-zinc-300/90 whitespace-pre-line">
            {previewContent}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="flex justify-center pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
        <button
          onClick={goToChat}
          className="px-12 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-lg transition-all shadow-xl shadow-indigo-500/30 flex items-center gap-3"
        >
          <span>开始对话</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
