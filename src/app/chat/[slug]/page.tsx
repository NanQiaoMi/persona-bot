import ChatWindow from "@/components/ChatWindow";

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#EDEDED]">
      <div className="w-full max-w-2xl bg-[#EDEDED] min-h-screen flex flex-col">
        <ChatWindow slug={slug} />
      </div>
    </main>
  );
}
