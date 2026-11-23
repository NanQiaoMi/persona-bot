import GrokWorkspace from "@/components/workspace/GrokWorkspace";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GrokWorkspace initialSlug={slug} />;
}
