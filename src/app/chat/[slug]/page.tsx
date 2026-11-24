import GrokWorkspace from "@/components/workspace/GrokWorkspace";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ inspector?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearch = await searchParams;
  return (
    <GrokWorkspace
      initialSlug={slug}
      initialInspectorOpen={resolvedSearch?.inspector === "1"}
    />
  );
}
