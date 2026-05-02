import ChatWindow from "@/components/ChatWindow";
import Link from "next/link";

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-24 relative overflow-hidden">
      <div className="z-10 w-full max-w-5xl space-y-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group">
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            退出对话
          </Link>
          <div className="flex gap-4">
            <button className="text-xs px-3 py-1 rounded-full glass hover:bg-white/5 transition-all text-zinc-400">查看记忆</button>
            <button className="text-xs px-3 py-1 rounded-full glass hover:bg-white/5 transition-all text-zinc-400">性格设定</button>
          </div>
        </header>

        <section className="animate-in fade-in zoom-in duration-700">
          <ChatWindow slug={slug} />
        </section>
      </div>
    </main>
  );
}
