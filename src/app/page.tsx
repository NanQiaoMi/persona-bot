"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) setUser(data.data.user);
        })
        .catch(() => {});
    }
  }, []);

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <div className="relative px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-[#E5E5E5] shadow-sm mb-8">
            <span className="w-2 h-2 bg-[#07C160] rounded-full animate-pulse" />
            <span className="text-sm text-[#666666]">PersonaBot v1.0 - 现已支持情感引擎</span>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-[#353535] mb-6">
            从此以后
            <br />
            <span className="text-[#07C160]">不止有聊天记录</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-[#666666] max-w-2xl mx-auto leading-relaxed mb-10">
            将回忆蒸馏成 AI Skill，生成像她一样说话的 AI。
            <br className="hidden md:block" />
            支持微信、iMessage、短信记录导入，让记忆永不褪色。
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <>
                <Link
                  href="/create"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white font-semibold text-base shadow-lg shadow-[#07C160]/25 transition-all duration-200"
                >
                  开始蒸馏 Persona →
                </Link>
                <Link
                  href="/gallery"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-[#E5E5E5] text-[#353535] font-semibold text-base hover:bg-[#F7F7F7] transition-all duration-200"
                >
                  查看我的角色
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white font-semibold text-base shadow-lg shadow-[#07C160]/25 transition-all duration-200"
                >
                  立即注册 →
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-[#E5E5E5] text-[#353535] font-semibold text-base hover:bg-[#F7F7F7] transition-all duration-200"
                >
                  已有账号？登录
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mt-12 text-[#999999]">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#353535]">5层</div>
              <div className="text-sm">性格结构</div>
            </div>
            <div className="w-px h-8 bg-[#E5E5E5]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-[#353535]">实时</div>
              <div className="text-sm">情感演进</div>
            </div>
            <div className="w-px h-8 bg-[#E5E5E5]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-[#353535]">多角色</div>
              <div className="text-sm">自由切换</div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="px-4 py-16 bg-white/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#353535] mb-3">核心功能</h2>
            <p className="text-[#666666]">从聊天记录到拟人AI，一站式完成</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-white border border-[#E5E5E5] hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-[#07C160]/10 flex items-center justify-center text-2xl mb-4">
                💬
              </div>
              <h3 className="text-lg font-bold text-[#353535] mb-2">对话式录入</h3>
              <p className="text-sm text-[#666666] leading-relaxed">
                只需回答 3 个问题，即可初步建立人格模型。支持跳过，仅凭描述也能生成完整Persona。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-white border border-[#E5E5E5] hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-[#576B95]/10 flex items-center justify-center text-2xl mb-4">
                🧠
              </div>
              <h3 className="text-lg font-bold text-[#353535] mb-2">深度解析蒸馏</h3>
              <p className="text-sm text-[#666666] leading-relaxed">
                自动解析微信、iMessage聊天记录，提取共同记忆与五层性格结构，让AI真正理解她。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-white border border-[#E5E5E5] hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-[#FA5151]/10 flex items-center justify-center text-2xl mb-4">
                ❤️
              </div>
              <h3 className="text-lg font-bold text-[#353535] mb-2">情感逻辑演进</h3>
              <p className="text-sm text-[#666666] leading-relaxed">
                AI会根据当前情感状态和性格特征，推理回复语气与态度，不再是冰冷的复读机。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#353535] mb-3">如何使用</h2>
            <p className="text-[#666666]">简单三步，开始对话</p>
          </div>

          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#07C160] flex items-center justify-center text-white font-bold">
                1
              </div>
              <div>
                <h3 className="font-bold text-[#353535] mb-1">输入基本信息</h3>
                <p className="text-sm text-[#666666]">告诉我们她的昵称、你们的故事、她的性格特点。</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#576B95] flex items-center justify-center text-white font-bold">
                2
              </div>
              <div>
                <h3 className="font-bold text-[#353535] mb-1">AI深度分析</h3>
                <p className="text-sm text-[#666666]">系统会创造一个完整的人物形象，提取5层性格结构和共同记忆。</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#FA5151] flex items-center justify-center text-white font-bold">
                3
              </div>
              <div>
                <h3 className="font-bold text-[#353535] mb-1">开始对话</h3>
                <p className="text-sm text-[#666666]">现在你可以和"她"对话了。AI会用她的方式回复你。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 py-6 border-t border-[#E5E5E5] bg-white/50">
        <div className="max-w-4xl mx-auto text-center text-sm text-[#999999]">
          © 2024 PersonaBot. 将回忆变成永恒。
        </div>
      </footer>
    </main>
  );
}
