import { Suspense } from "react";
import { navigation } from "next/cache";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser, isDevLoginEnabled } from "@/lib/auth";

async function LoginContent() {
  await navigation();
  const user = await getCurrentUser();

  if (user) {
    redirect("/budget");
  }

  return (
    <LoginForm
      allowSignup={process.env.ALLOW_SIGNUP === "true"}
      allowDevLogin={isDevLoginEnabled()}
    />
  );
}

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:py-8">
      <Suspense fallback={<p role="status" className="text-sm text-forest-600">Loading sign in...</p>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
