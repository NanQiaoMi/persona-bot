"use client";

import { useRouter } from "next/navigation";
import SettingsModal from "@/components/settings/SettingsModal";

export default function SettingsPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <SettingsModal
        isOpen={true}
        onClose={() => router.push("/")}
      />
    </div>
  );
}
