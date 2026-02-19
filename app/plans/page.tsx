import { redirect } from "next/navigation";
import PlansManager from "@/components/PlansManager";
import { getCurrentUser } from "@/lib/auth";

export default async function PlansPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen px-4 py-10 md:py-12">
      <PlansManager username={user.username} />
    </main>
  );
}
