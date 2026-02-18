import { redirect } from "next/navigation";
import BudgetApp from "@/components/BudgetApp";
import { getCurrentUser } from "@/lib/auth";

export default async function BudgetPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen px-4 py-10 md:py-12">
      <BudgetApp username={user.username} />
    </main>
  );
}
