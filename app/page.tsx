import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser, isDevLoginEnabled } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/budget");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <LoginForm
        allowSignup={process.env.ALLOW_SIGNUP === "true"}
        allowDevLogin={isDevLoginEnabled()}
      />
    </main>
  );
}
