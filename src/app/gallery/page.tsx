import fs from 'fs/promises';
import path from 'path';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';

async function getPersonas() {
  const exesDir = path.join(process.cwd(), 'exes');
  try {
    const dirs = await fs.readdir(exesDir);
    const personas = await Promise.all(dirs.map(async (slug) => {
      const metaPath = path.join(exesDir, slug, 'meta.json');
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
        return { slug, ...meta };
      } catch {
        return null;
      }
    }));
    return personas.filter(p => p !== null);
  } catch {
    return [];
  }
}

export default async function GalleryPage() {
  const personas = await getPersonas();

  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-24 relative overflow-hidden">
      <div className="z-10 w-full max-w-5xl space-y-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group">
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </Link>
          <h1 className="text-2xl font-bold">已蒸馏的角色</h1>
        </header>

        {personas.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-zinc-500">目前还没有任何角色，快去创建一个吧。</p>
            <Link href="/create" className="inline-block px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all">
              创建第一个 Persona
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((p: any) => (
              <Link key={p.slug} href={`/chat/${p.slug}`}>
                <GlassCard className="hover:border-indigo-500/50 cursor-pointer group h-full">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600" />
                    <div>
                      <h3 className="text-xl font-bold group-hover:text-indigo-400 transition-colors">{p.name}</h3>
                      <p className="text-xs text-zinc-500">版本: {p.version}</p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 line-clamp-2">
                    {p.profile?.raw || "暂无描述"}
                  </p>
                  <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
                    <span className="text-[10px] text-zinc-500">创建于 {new Date(p.created_at).toLocaleDateString()}</span>
                    <span className="text-xs text-indigo-400 font-medium">进入对话 →</span>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
