import IntakeWizard from "@/components/IntakeWizard";
import Link from "next/link";

export default function CreatePersonaPage() {
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
          <div className="text-sm text-zinc-500">创建新的 Persona</div>
        </header>

        <section className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <IntakeWizard />
        </section>
      </div>
    </main>
  );
}
