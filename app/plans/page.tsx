import { Suspense } from "react";
import { navigation } from "next/cache";
import { redirect } from "next/navigation";
import PlansManager from "@/components/PlansManager";
import { getCurrentUser } from "@/lib/auth";

async function PlansContent() {
  await navigation();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <PlansManager username={user.username} />
  );
}

export default function PlansPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1280px] px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <Suspense fallback={<p role="status" className="text-sm text-forest-600">Loading plans...</p>}>
        <PlansContent />
      </Suspense>
    </main>
  );
}
