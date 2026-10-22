import { Suspense } from "react";
import { navigation } from "next/cache";
import { redirect } from "next/navigation";
import BudgetApp from "@/components/BudgetApp";
import { getCurrentUser } from "@/lib/auth";

async function BudgetContent() {
  await navigation();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <BudgetApp username={user.username} />
  );
}

export default function BudgetPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <Suspense fallback={<p role="status" className="text-sm text-forest-600">Loading budget...</p>}>
        <BudgetContent />
      </Suspense>
    </main>
  );
}
