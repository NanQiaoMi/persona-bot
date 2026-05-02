"use client";

import { useState, useRef, useEffect } from 'react';
import WeChatInput from './ui/WeChatInput';
import MessageItem from './chat/MessageItem';
import ChatHeader from './chat/ChatHeader';
import { GlassCard } from './ui/GlassCard';

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
  const [personaInfo, setPersonaInfo] = useState<PersonaInfo>({ name: slug });
  const [intimacy, setIntimacy] = useState(50);
  const [isCorrecting, setIsCorrecting] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      alert('反馈已记录，她会记住这次教训。');
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
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          slug
        })
      });

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        const content = data.choices[0].message.content;

        const parts = content.split('[BURST]').map((p: string) => p.trim()).filter((p: string) => p);

        let delay = 0;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const partDelay = Math.min(Math.max(800, part.length * 40), 3000) + Math.random() * 500;
          delay += partDelay;

          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: part,
              timestamp: new Date().toISOString()
            }]);

            if (data.mood) {
              setPersonaInfo(prev => ({ ...prev, currentMood: data.mood }));
            }

            if (i === parts.length - 1) {
              setLoading(false);
            }
          }, delay);

          delay += 500 + Math.random() * 500;
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Chat failed:', error);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto h-[600px] flex flex-col bg-[#EDEDED] rounded-lg overflow-hidden shadow-lg">
      {/* 聊天头部 */}
      <ChatHeader
        personaName={personaInfo.name}
        personaAvatar={personaInfo.avatar}
        currentMood={personaInfo.currentMood}
      />

      {/* 亲密度条 */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-white border-b border-[#E5E5E5]">
        <svg className={`w-3.5 h-3.5 text-[#FA5151] ${intimacy > 70 ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#FA5151] to-[#F0A020] h-full transition-all duration-1000"
            style={{ width: `${intimacy}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-[#999999]">{intimacy}%</span>
      </div>

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ backgroundColor: '#EDEDED' }}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-[#999999] space-y-2">
            <p className="text-sm">开始与 {personaInfo.name} 对话</p>
            <p className="text-xs">所有回复均由蒸馏出的 Persona 驱动</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageItem
            key={i}
            message={msg}
            personaName={personaInfo.name}
            personaAvatar={personaInfo.avatar}
            showAvatar={i === 0 || messages[i - 1]?.role !== msg.role}
            onCorrect={msg.role === 'assistant' ? () => setIsCorrecting(i) : undefined}
          />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[#999999] rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-[#999999] rounded-full animate-bounce delay-100" />
                <span className="w-2 h-2 bg-[#999999] rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div className="p-3 bg-white border-t border-[#E5E5E5]">
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
          <GlassCard className="max-w-md w-full p-8 space-y-6">
            <h3 className="text-xl font-bold text-[#353535]">纠正人格偏差</h3>
            <p className="text-sm text-[#999999]">你觉得这条回复哪里不像她？你的反馈将直接更新她的行为准则。</p>
            <textarea
              autoFocus
              className="w-full bg-[#F7F7F7] border border-[#E5E5E5] rounded-lg p-4 h-32 focus:outline-none focus:border-[#07C160] transition-all text-sm text-[#353535]"
              placeholder="例如：她不会这么客气，或者她生气时通常会已读不回..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleCorrection(isCorrecting, e.currentTarget.value);
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsCorrecting(null)}
                className="px-4 py-2 text-sm text-[#999999] hover:text-[#353535] transition-colors"
              >
                取消
              </button>
              <button
                className="px-6 py-2 bg-[#07C160] rounded-lg text-sm font-semibold text-white hover:bg-[#06AD56] transition-all"
                onClick={(e) => {
                  const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
                  handleCorrection(isCorrecting, textarea.value);
                }}
              >
                提交反馈
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
