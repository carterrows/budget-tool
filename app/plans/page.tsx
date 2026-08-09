import { redirect } from "next/navigation";
import PlansManager from "@/components/PlansManager";
import { getCurrentUser } from "@/lib/auth";

export default async function PlansPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1280px] px-4 py-5 sm:px-6 md:py-8 lg:px-8">
      <PlansManager username={user.username} />
    </main>
  );
}
