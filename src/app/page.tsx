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
    <main className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-500/10 blur-[150px] rounded-full animate-pulse delay-1000" />
        <div className="absolute top-[40%] left-[50%] w-[40%] h-[40%] bg-pink-500/5 blur-[100px] rounded-full animate-pulse delay-500" />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-24">
        <div className="max-w-5xl w-full text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm text-zinc-300">PersonaBot v1.0 - 现已支持情感引擎</span>
          </div>

          {/* Main Title */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              从此以后
            </span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              不止有聊天记录
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto leading-relaxed">
            将回忆蒸馏成 AI Skill，生成像她一样说话的 AI。
            <br className="hidden md:block" />
            支持微信、iMessage、短信记录导入，让记忆永不褪色。
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            {user ? (
              <>
                <Link
                  href="/create"
                  className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-lg shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 hover:-translate-y-1"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    开始蒸馏 Persona
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </Link>
                <Link
                  href="/gallery"
                  className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-semibold text-lg hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 backdrop-blur-sm"
                >
                  查看我的角色
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-lg shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 hover:-translate-y-1"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    立即注册
                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </Link>
                <Link
                  href="/login"
                  className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-semibold text-lg hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 backdrop-blur-sm"
                >
                  已有账号？登录
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 pt-12 text-zinc-400">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">5层</div>
              <div className="text-sm">性格结构</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">实时</div>
              <div className="text-sm">情感演进</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">多角色</div>
              <div className="text-sm">自由切换</div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="relative z-10 px-6 py-24 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                核心功能
              </span>
            </h2>
            <p className="text-zinc-400 text-lg">从聊天记录到拟人AI，一站式完成</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-3xl mb-6">
                  💬
                </div>
                <h3 className="text-xl font-bold mb-3">对话式录入</h3>
                <p className="text-zinc-400 leading-relaxed">
                  只需回答 3 个问题，即可初步建立人格模型。支持跳过，仅凭描述也能生成完整Persona。
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-purple-500/30 transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-3xl mb-6">
                  🧠
                </div>
                <h3 className="text-xl font-bold mb-3">深度解析蒸馏</h3>
                <p className="text-zinc-400 leading-relaxed">
                  自动解析微信、iMessage聊天记录，提取共同记忆与五层性格结构，让AI真正理解她。
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-pink-500/30 transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-b from-pink-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-pink-500/10 flex items-center justify-center text-3xl mb-6">
                  ❤️
                </div>
                <h3 className="text-xl font-bold mb-3">情感逻辑演进</h3>
                <p className="text-zinc-400 leading-relaxed">
                  AI会根据当前情感状态和性格特征，推理回复语气与态度，不再是冰冷的复读机。
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-3xl mb-6">
                  👥
                </div>
                <h3 className="text-xl font-bold mb-3">多角色切换</h3>
                <p className="text-zinc-400 leading-relaxed">
                  支持创建5-10个不同角色，每个角色独立的情感状态和记忆，随时切换。
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-amber-500/30 transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-3xl mb-6">
                  📱
                </div>
                <h3 className="text-xl font-bold mb-3">微信风格界面</h3>
                <p className="text-zinc-400 leading-relaxed">
                  熟悉的聊天界面设计，支持消息气泡、表情、语音等多种消息类型。
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 transition-all duration-300 hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-3xl mb-6">
                  🔒
                </div>
                <h3 className="text-xl font-bold mb-3">私密安全</h3>
                <p className="text-zinc-400 leading-relaxed">
                  邀请码注册机制，数据本地存储，你的回忆只属于你自己。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="relative z-10 px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                如何使用
              </span>
            </h2>
            <p className="text-zinc-400 text-lg">简单三步，开始对话</p>
          </div>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                1
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">输入基本信息</h3>
                <p className="text-zinc-400 leading-relaxed">
                  告诉我们她的昵称、你们的故事、她的性格特点。只需要碎片化的信息，AI会自动补全。
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                2
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">AI深度分析</h3>
                <p className="text-zinc-400 leading-relaxed">
                  系统会创造一个完整的人物形象，然后通过ex-skill引擎提取5层性格结构和共同记忆。
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white font-bold text-lg">
                3
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">开始对话</h3>
                <p className="text-zinc-400 leading-relaxed">
                  现在你可以和"她"对话了。AI会根据情感状态、记忆和性格，用她的方式回复你。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative z-10 px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-b from-white/[0.02] to-transparent border border-white/5">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              准备好了吗？
            </h2>
            <p className="text-zinc-400 text-lg mb-8">
              开始创建你的第一个Persona，让记忆永不褪色。
            </p>
            <Link
              href={user ? "/create" : "/register"}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-lg shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 hover:-translate-y-1"
            >
              {user ? "开始蒸馏 Persona" : "立即注册"}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-8 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">💬</span>
            <span className="font-semibold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              PersonaBot
            </span>
          </div>
          <div className="text-sm text-zinc-500">
            © 2024 PersonaBot. 将回忆变成永恒。
          </div>
        </div>
      </footer>
    </main>
  );
}
