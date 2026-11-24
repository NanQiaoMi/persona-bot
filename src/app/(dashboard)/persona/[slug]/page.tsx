import { redirect } from "next/navigation";

export default async function PersonaDetailRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/chat/${encodeURIComponent(slug)}?inspector=1`);
}
