import IntakeWizard from "@/components/IntakeWizard";

export default function CreatePersonaPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#EDEDED]">
      <div className="w-full max-w-2xl bg-[#EDEDED] min-h-screen">
        <IntakeWizard />
      </div>
    </main>
  );
}
