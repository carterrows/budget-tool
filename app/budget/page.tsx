import { redirect } from "next/navigation";
import BudgetApp from "@/components/BudgetApp";
import { getCurrentUser } from "@/lib/auth";

export default async function BudgetPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <BudgetApp username={user.username} />
    </main>
  );
}
