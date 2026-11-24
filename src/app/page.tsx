import GrokWorkspace from "@/components/workspace/GrokWorkspace";
import { DEFAULT_PERSONA_SLUG } from "@/lib/persona/presets";

export default function HomePage() {
  return <GrokWorkspace initialSlug={DEFAULT_PERSONA_SLUG} />;
}
