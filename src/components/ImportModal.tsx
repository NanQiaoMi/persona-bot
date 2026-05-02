"use client";

import { useState, useRef } from 'react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { slug: string; name: string }) => void;
}

export default function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<'select' | 'upload' | 'processing' | 'done'>('select');
  const [chatType, setChatType] = useState<'wechat' | 'imessage'>('wechat');
  const [targetName, setTargetName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ content?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file || !targetName.trim()) {
      setError('请选择文件并输入对方昵称');
      return;
    }

    setStep('processing');
    setError('');

    try {
      const formData = new FormData();
      formData.append('action', 'parse');
      formData.append('file', file);
      formData.append('targetName', targetName.trim());
      formData.append('type', chatType);

      const res = await fetch('/api/ex-skill', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.messages?.[0] || { content: '解析成功' });
        setStep('done');
        onSuccess?.({ slug: targetName.toLowerCase().replace(/\s+/g, '-'), name: targetName });
      } else {
        setError(data.error || '解析失败');
        setStep('upload');
      }
    } catch {
      setError('上传失败，请重试');
      setStep('upload');
    }
  };

  const reset = () => {
    setStep('select');
    setChatType('wechat');
    setTargetName('');
    setFile(null);
    setError('');
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md glass-strong rounded-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E5]/50">
          <h3 className="text-base font-semibold text-[#353535]">导入聊天记录</h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-[#999999]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {step === 'select' && (
            <div className="space-y-5 animate-fade-in">
              <p className="text-sm text-[#999999]">
                选择聊天记录类型，导入后 AI 将学习她的说话风格
              </p>

              {/* Chat Type Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setChatType('wechat')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    chatType === 'wechat'
                      ? 'border-[#07C160] bg-[#07C160]/5'
                      : 'border-[#E5E5E5] hover:border-[#D0D0D0]'
                  }`}
                >
                  <div className="text-2xl mb-2">💬</div>
                  <div className="text-sm font-medium text-[#353535]">微信</div>
                  <div className="text-[11px] text-[#999999] mt-0.5">支持导出的聊天记录</div>
                </button>
                <button
                  onClick={() => setChatType('imessage')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    chatType === 'imessage'
                      ? 'border-[#07C160] bg-[#07C160]/5'
                      : 'border-[#E5E5E5] hover:border-[#D0D0D0]'
                  }`}
                >
                  <div className="text-2xl mb-2">🍎</div>
                  <div className="text-sm font-medium text-[#353535]">iMessage</div>
                  <div className="text-[11px] text-[#999999] mt-0.5">macOS 导出格式</div>
                </button>
              </div>

              {/* Target Name */}
              <div>
                <label className="block text-sm font-medium text-[#353535] mb-2">
                  对方昵称
                </label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="例如：小美、糖糖..."
                  className="w-full glass-input rounded-xl px-4 py-3 text-sm text-[#353535] placeholder-[#CCCCCC]"
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-[#FA5151]/10 text-[#FA5151] text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={() => targetName.trim() && setStep('upload')}
                disabled={!targetName.trim()}
                className="w-full py-3 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一步
              </button>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setStep('select')}
                  className="text-[#576B95] hover:text-[#07C160] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h4 className="text-base font-medium text-[#353535]">
                  上传 {chatType === 'wechat' ? '微信' : 'iMessage'} 聊天记录
                </h4>
              </div>

              {/* File Upload Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  file
                    ? 'border-[#07C160] bg-[#07C160]/5'
                    : 'border-[#E5E5E5] hover:border-[#07C160]/50 hover:bg-[#F7F7F7]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={chatType === 'wechat' ? '.txt,.csv,.html' : '.chat.db,.txt'}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {file ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-[#07C160]/10 flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#07C160]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[#353535]">{file.name}</p>
                    <p className="text-xs text-[#999999]">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-[#F7F7F7] flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#999999]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-sm text-[#666666]">点击或拖拽文件到这里</p>
                    <p className="text-xs text-[#999999]">
                      {chatType === 'wechat' ? '支持 .txt .csv .html 格式' : '支持 .chat.db 或导出的 .txt 文件'}
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-[#FA5151]/10 text-[#FA5151] text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!file}
                className="w-full py-3 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                开始解析
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8 space-y-6 animate-fade-in">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-[#E5E5E5]" />
                <div className="absolute inset-0 rounded-full border-2 border-t-[#07C160] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">📝</span>
                </div>
              </div>
              <div className="text-center">
                <h4 className="text-base font-medium text-[#353535] mb-1">正在解析聊天记录</h4>
                <p className="text-sm text-[#999999]">这可能需要几分钟...</p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-6 space-y-5 animate-fade-in">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#07C160]/10 flex items-center justify-center mb-4">
                  <span className="text-3xl">✨</span>
                </div>
                <h4 className="text-base font-semibold text-[#353535] mb-1">解析完成</h4>
                <p className="text-sm text-[#999999]">聊天记录已成功导入</p>
              </div>

              {result?.content && (
                <div className="glass-card rounded-xl p-4 max-h-40 overflow-y-auto">
                  <p className="text-xs text-[#999999] mb-2 font-medium">预览</p>
                  <p className="text-sm text-[#666666] whitespace-pre-line line-clamp-6">
                    {result.content}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl glass text-sm text-[#666666] font-medium hover:bg-white/80 transition-all"
                >
                  继续导入
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-medium transition-all"
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
