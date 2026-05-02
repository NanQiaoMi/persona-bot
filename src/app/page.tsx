import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-24 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="z-10 max-w-5xl w-full flex flex-col items-center text-center space-y-12">
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-block px-4 py-1.5 rounded-full glass text-sm font-medium text-indigo-400 mb-4">
            PersonaBot v1.0
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gradient">
            从此以后，你的手机里<br />
            不止有聊天记录，还有一个她。
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            将回忆蒸馏成 AI Skill。不是为了挽回，是为了记住。<br />
            支持微信、iMessage、短信记录导入，生成像她一样说话的 AI。
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <Link href="/create" className="px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2 group">
            开始蒸馏 Persona
            <svg 
              className="w-5 h-5 group-hover:translate-x-1 transition-transform" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link href="/gallery" className="px-8 py-4 rounded-2xl glass hover:bg-white/5 text-white font-semibold transition-all flex items-center gap-2">
            查看已有角色
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-24 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500">
          <div className="glass-card glass p-8 rounded-3xl text-left space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold">对话式录入</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">
              只需回答 3 个问题，即可初步建立人格模型。支持跳过，仅凭描述也能生成。
            </p>
          </div>

          <div className="glass-card glass p-8 rounded-3xl text-left space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold">深度解析蒸馏</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">
              自动解析微信、iMessage、照片元数据，提取共同记忆与五层性格结构。
            </p>
          </div>

          <div className="glass-card glass p-8 rounded-3xl text-left space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold">情感逻辑演进</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">
              不仅是复读机。AI 会根据当前情感状态和性格特征，推理回复语气与态度。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
