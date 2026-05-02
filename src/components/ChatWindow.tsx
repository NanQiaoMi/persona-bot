"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import WeChatInput from './ui/WeChatInput';
import ChatHeader from './chat/ChatHeader';

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
  const [emotionState, setEmotionState] = useState<any>(null);
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
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
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
    } catch (e) {
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
      <div className="w-full max-w-2xl mx-auto h-[600px] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-b from-[#F7F7F7] to-[#EDEDED] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-[#07C160]/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-[#07C160] rounded-full animate-spin" />
          </div>
          <p className="text-[#999999] text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto h-[600px] flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-[#EDEDED]">
      {/* 聊天头部 */}
      <ChatHeader
        personaName={personaInfo.name}
        personaAvatar={personaInfo.avatar}
        currentMood={personaInfo.currentMood}
      />

      {/* 亲密度条 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border-b border-[#E5E5E5]">
        <svg className={`w-4 h-4 text-[#FA5151] transition-transform ${intimacy > 70 ? 'scale-110' : ''}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{ 
              width: `${intimacy}%`,
              background: `linear-gradient(90deg, #FA5151 0%, #F0A020 50%, #07C160 100%)`
            }}
          />
        </div>
        <span className="text-xs font-medium text-[#666666] min-w-[40px] text-right">{intimacy}%</span>
      </div>

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-3"
        style={{ 
          backgroundColor: '#EDEDED',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-[#999999] animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-white/50 flex items-center justify-center mb-4 shadow-inner">
              <span className="text-4xl">💬</span>
            </div>
            <p className="text-base font-medium text-[#666666] mb-1">开始与 {personaInfo.name} 对话</p>
            <p className="text-xs text-[#999999]">所有回复均由蒸馏出的 Persona 驱动</p>
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
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#07C160] to-[#06AD56] flex items-center justify-center text-white text-sm font-medium mr-2 flex-shrink-0 shadow-md">
                {personaInfo.name.charAt(0)}
              </div>
            )}
            {msg.role === 'assistant' && i > 0 && messages[i - 1]?.role === msg.role && (
              <div className="w-10 mr-2 flex-shrink-0" />
            )}

            {/* 消息气泡 */}
            <div className="relative group max-w-[75%]">
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
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
                      ? 'right-[-8px] border-l-[8px] border-l-[#95EC69] border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent'
                      : 'left-[-8px] border-r-[8px] border-r-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent'
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
                  className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 text-[#CCCCCC] hover:text-[#07C160] opacity-0 group-hover:opacity-100 transition-all"
                  title="纠正这条回复"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>

            {/* 用户头像 */}
            {msg.role === 'user' && (i === 0 || messages[i - 1]?.role !== msg.role) && (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#576B95] to-[#4A5D82] flex items-center justify-center text-white text-sm font-medium ml-2 flex-shrink-0 shadow-md">
                我
              </div>
            )}
            {msg.role === 'user' && i > 0 && messages[i - 1]?.role === msg.role && (
              <div className="w-10 ml-2 flex-shrink-0" />
            )}
          </div>
        ))}

        {/* 输入中动画 */}
        {loading && (
          <div className="flex justify-start animate-message-in">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#07C160] to-[#06AD56] flex items-center justify-center text-white text-sm font-medium mr-2 flex-shrink-0 shadow-md">
              {personaInfo.name.charAt(0)}
            </div>
            <div className="bg-white px-5 py-3.5 rounded-2xl rounded-tl-md shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#07C160] rounded-full typing-dot" />
                <span className="w-2.5 h-2.5 bg-[#07C160] rounded-full typing-dot" />
                <span className="w-2.5 h-2.5 bg-[#07C160] rounded-full typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div className="p-3 bg-white/90 backdrop-blur-sm border-t border-[#E5E5E5]">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-[#353535]">纠正人格偏差</h3>
            <p className="text-sm text-[#999999]">你觉得这条回复哪里不像她？</p>
            <textarea
              autoFocus
              className="w-full bg-[#F7F7F7] border border-[#E5E5E5] rounded-xl p-4 h-28 focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all text-sm text-[#353535] resize-none"
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
                className="px-5 py-2.5 bg-[#07C160] hover:bg-[#06AD56] rounded-lg text-sm font-medium text-white transition-all shadow-md shadow-[#07C160]/25"
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
  );
}
