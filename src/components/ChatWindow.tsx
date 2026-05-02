"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import WeChatInput from './ui/WeChatInput';
import ChatHeader from './chat/ChatHeader';
import SkillPanel from './SkillPanel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface PersonaInfo {
  name: string;
  avatar?: string;
  currentMood?: string;
}

export default function ChatWindow({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [personaInfo, setPersonaInfo] = useState<PersonaInfo>({ name: slug });
  const [intimacy, setIntimacy] = useState(50);
  const [isCorrecting, setIsCorrecting] = useState<number | null>(null);
  const [emotionState, setEmotionState] = useState<Record<string, unknown> | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 加载历史记录
  useEffect(() => {
    let isMounted = true;
    
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/conversations?slug=${encodeURIComponent(slug)}&limit=100`);
        
        if (!res.ok) {
          console.error('Failed to load history:', res.status);
          if (isMounted) setLoadingHistory(false);
          return;
        }
        
        const data = await res.json();

        if (isMounted && data.success && data.messages && data.messages.length > 0) {
          setMessages(data.messages);
          if (data.emotionState) {
            setEmotionState(data.emotionState);
          }
        }
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    };

    loadHistory();
    
    return () => {
      isMounted = false;
    };
  }, [slug]);

  // 保存聊天记录
  const saveMessages = useCallback(async (msgs: Message[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            messages: msgs,
            emotionState
          })
        });
      } catch (error) {
        console.error('Failed to save conversation:', error);
      }
    }, 1000);
  }, [slug, emotionState]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  // 播放提示音
  const playSound = (type: 'send' | 'receive') => {
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (type === 'send') {
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.1;
      } else {
        oscillator.frequency.value = 600;
        gainNode.gain.value = 0.08;
      }
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch {
      // 静默失败
    }
  };

  const handleCorrection = async (index: number, reason: string) => {
    const msg = messages[index];
    if (msg.role !== 'assistant') return;

    try {
      await fetch('/api/persona/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          correction: {
            original: msg.content,
            reason,
            type: 'style'
          }
        })
      });
      setIsCorrecting(null);
    } catch (e) {
      console.error('Correction failed:', e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    playSound('send');
    saveMessages(updatedMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          slug,
          emotionState
        })
      });

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        const content = data.choices[0].message.content;
        const parts = content.split('[BURST]').map((p: string) => p.trim()).filter((p: string) => p);

        let delay = 0;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const partDelay = Math.min(Math.max(500, part.length * 30), 2000) + Math.random() * 300;
          delay += partDelay;

          setTimeout(() => {
            const assistantMessage: Message = {
              role: 'assistant',
              content: part,
              timestamp: new Date().toISOString()
            };

            setMessages(prev => {
              const newMsgs = [...prev, assistantMessage];
              if (i === parts.length - 1) {
                saveMessages(newMsgs);
              }
              return newMsgs;
            });

            playSound('receive');

            if (data.mood) {
              setPersonaInfo(prev => ({ ...prev, currentMood: data.mood }));
            }

            if (data.emotionState) {
              setEmotionState(data.emotionState);
            }

            if (data.intimacyChange) {
              setIntimacy(prev => Math.max(0, Math.min(100, prev + data.intimacyChange)));
            }

            if (i === parts.length - 1) {
              setLoading(false);
            }
          }, delay);

          delay += 300 + Math.random() * 200;
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Chat failed:', error);
      setLoading(false);
    }
  };

  // 加载中状态
  if (loadingHistory) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 border-[#E5E5E5] rounded-full" />
            <div className="absolute inset-0 border-2 border-t-[#07C160] rounded-full animate-spin" />
          </div>
          <p className="text-[#999999] text-sm">加载聊天记录...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full flex flex-col h-[calc(100vh-56px)]">
        {/* 聊天头部 */}
        <ChatHeader
          personaName={personaInfo.name}
          personaAvatar={personaInfo.avatar}
          currentMood={personaInfo.currentMood}
        />

        {/* 亲密度条 */}
        <div className="flex items-center gap-2 px-4 py-2 glass border-b border-[#E5E5E5]/50">
          <svg className={`w-3.5 h-3.5 text-[#FA5151] transition-transform ${intimacy > 70 ? 'scale-110' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ 
                width: `${intimacy}%`,
                background: `linear-gradient(90deg, #FA5151 0%, #F0A020 50%, #07C160 100%)`
              }}
            />
          </div>
          <span className="text-[10px] font-medium text-[#999999] min-w-[32px] text-right">{intimacy}%</span>
        </div>

        {/* 消息列表 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          style={{ 
            backgroundColor: '#EDEDED',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-[#999999] animate-fade-in">
              <div className="w-20 h-20 rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center mb-4 border border-white/40">
                <span className="text-4xl">💬</span>
              </div>
              <p className="text-base font-medium text-[#666666] mb-1">开始与 {personaInfo.name} 对话</p>
              <p className="text-xs text-[#999999] mb-6">所有回复均由蒸馏出的 Persona 驱动</p>
              
              {/* Quick Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSkills(true)}
                  className="px-4 py-2 glass-card rounded-lg text-xs text-[#576B95] hover:bg-white/60 transition-all flex items-center gap-1.5"
                >
                  <span>🧩</span>
                  查看技能
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={`${msg.timestamp}-${i}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-message-in`}
              style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
            >
              {/* AI头像 */}
              {msg.role === 'assistant' && (i === 0 || messages[i - 1]?.role !== msg.role) && (
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#07C160] to-[#06AD56] flex items-center justify-center text-white text-xs font-medium mr-2 flex-shrink-0 shadow-sm">
                  {personaInfo.name.charAt(0)}
                </div>
              )}
              {msg.role === 'assistant' && i > 0 && messages[i - 1]?.role === msg.role && (
                <div className="w-9 mr-2 flex-shrink-0" />
              )}

              {/* 消息气泡 */}
              <div className="relative group max-w-[75%]">
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-[#95EC69] text-[#353535] rounded-tr-md'
                      : 'bg-white text-[#353535] rounded-tl-md'
                  }`}
                  style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                >
                  {/* 气泡箭头 */}
                  <div
                    className={`absolute top-3 w-0 h-0 ${
                      msg.role === 'user'
                        ? 'right-[-7px] border-l-[7px] border-l-[#95EC69] border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent'
                        : 'left-[-7px] border-r-[7px] border-r-white border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent'
                    }`}
                  />
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-[#5EBD3E] text-right' : 'text-[#B0B0B0]'}`}>
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>

                {/* 纠正按钮 */}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => setIsCorrecting(i)}
                    className="absolute -right-7 top-1/2 -translate-y-1/2 p-1 text-[#CCCCCC] hover:text-[#07C160] opacity-0 group-hover:opacity-100 transition-all"
                    title="纠正这条回复"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 用户头像 */}
              {msg.role === 'user' && (i === 0 || messages[i - 1]?.role !== msg.role) && (
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#576B95] to-[#4A5D82] flex items-center justify-center text-white text-xs font-medium ml-2 flex-shrink-0 shadow-sm">
                  我
                </div>
              )}
              {msg.role === 'user' && i > 0 && messages[i - 1]?.role === msg.role && (
                <div className="w-9 ml-2 flex-shrink-0" />
              )}
            </div>
          ))}

          {/* 输入中动画 */}
          {loading && (
            <div className="flex justify-start animate-message-in">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#07C160] to-[#06AD56] flex items-center justify-center text-white text-xs font-medium mr-2 flex-shrink-0 shadow-sm">
                {personaInfo.name.charAt(0)}
              </div>
              <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-md shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#07C160] rounded-full typing-dot" />
                  <span className="w-2 h-2 bg-[#07C160] rounded-full typing-dot" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[#07C160] rounded-full typing-dot" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 工具栏 */}
        <div className="px-3 py-1.5 glass border-t border-[#E5E5E5]/30 flex items-center gap-1">
          <button
            onClick={() => setShowSkills(true)}
            className="p-2 rounded-lg text-[#999999] hover:text-[#576B95] hover:bg-white/60 transition-all"
            title="技能管理"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </button>
          <button
            className="p-2 rounded-lg text-[#999999] hover:text-[#F0A020] hover:bg-white/60 transition-all"
            title="表情"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
            </svg>
          </button>
          <button
            className="p-2 rounded-lg text-[#999999] hover:text-[#07C160] hover:bg-white/60 transition-all"
            title="更多"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </button>
        </div>

        {/* 输入框 */}
        <div className="px-3 pb-3 glass">
          <WeChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            placeholder="输入消息..."
            disabled={loading}
          />
        </div>

        {/* 纠正弹窗 */}
        {isCorrecting !== null && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
            <div className="glass-strong rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-[#353535]">纠正人格偏差</h3>
              <p className="text-sm text-[#999999]">你觉得这条回复哪里不像她？</p>
              <textarea
                autoFocus
                className="w-full glass-input rounded-xl p-4 h-28 text-sm text-[#353535] resize-none"
                placeholder="例如：她不会这么客气..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCorrection(isCorrecting, e.currentTarget.value);
                  }
                }}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsCorrecting(null)}
                  className="px-5 py-2.5 text-sm text-[#999999] hover:text-[#353535] hover:bg-[#F5F5F5] rounded-lg transition-all"
                >
                  取消
                </button>
                <button
                  className="px-5 py-2.5 bg-[#07C160] hover:bg-[#06AD56] rounded-lg text-sm font-medium text-white transition-all shadow-sm"
                  onClick={(e) => {
                    const textarea = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement);
                    handleCorrection(isCorrecting, textarea.value);
                  }}
                >
                  提交反馈
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Skill Panel */}
      <SkillPanel
        isOpen={showSkills}
        onClose={() => setShowSkills(false)}
      />
    </>
  );
}
