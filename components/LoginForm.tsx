"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

type LoginFormProps = {
  allowSignup: boolean;
  allowDevLogin: boolean;
};

type AuthMode = "login" | "signup";

export default function LoginForm({ allowSignup, allowDevLogin }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [error, setError] = useState("");

  const submitLabel = mode === "login" ? "Sign In" : "Create Account";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }

    if (mode === "signup" && !allowSignup) {
      setError("Sign up is disabled.");
      return;
    }

    setLoading(true);
    setError("");

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? "Authentication failed.");
        return;
      }

      router.push("/budget");
      router.refresh();
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setDevLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/dev-login", {
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? "Development login failed.");
        return;
      }

      router.push("/budget");
      router.refresh();
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <section className="login-shell">
      <aside className="login-story">
        <div className="relative z-10 flex items-center gap-3">
          <span className="app-mark">B</span>
          <span className="text-sm font-semibold tracking-wide">Budget</span>
        </div>
        <div className="relative z-10 max-w-xl">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
            Your money, made clear
          </p>
          <h2 className="font-display text-5xl font-medium leading-[0.98] tracking-[-0.045em] text-[#f7fff9] xl:text-6xl">
            A calmer way to see where your money goes.
          </h2>
          <p className="mt-6 max-w-md text-base leading-7 text-emerald-50/70">
            Plan your month, grow your savings, and keep every dollar working toward the life you want.
          </p>
        </div>
        <p className="relative z-10 text-xs text-emerald-50/45">Private. Self-hosted. Yours.</p>
      </aside>

      <div className="relative flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-14">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md pt-14 lg:pt-0">
          <div className="mb-9">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <span className="app-mark">B</span>
              <span className="font-semibold">Budget</span>
            </div>
            <p className="eyebrow">Welcome back</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Your financial home.</h1>
            <p className="mt-3 text-sm text-forest-600">Sign in to continue to your private budget.</p>
          </div>

          <div className="mb-7 flex gap-1 rounded-full border border-forest-200 bg-forest-50 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`btn h-10 flex-1 px-3 py-2 text-sm ${
                mode === "login"
                  ? "btn-primary"
                  : "bg-transparent text-forest-600 hover:text-forest-900"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              disabled={!allowSignup}
              onClick={() => setMode("signup")}
              className={`btn h-10 flex-1 px-3 py-2 text-sm ${
                mode === "signup"
                  ? "btn-primary"
                  : "bg-transparent text-forest-600 hover:text-forest-900"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-forest-800">Username</span>
          <input
            type="text"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            className="input"
            placeholder="your-name"
            required
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-semibold text-forest-800">Password</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(event) => setPassword(event.target.value)}
            className="input"
            placeholder="Enter your password"
            required
          />
        </label>

        {mode === "signup" && (
          <p className="text-xs text-forest-700/80">
            Use lowercase letters, numbers, <code>_</code> or <code>-</code>.
          </p>
        )}

        {!allowSignup && (
          <p className="text-xs text-forest-700/80">
            Sign up disabled.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || devLoading}
          className="btn-primary w-full"
        >
          {loading ? "Please wait..." : submitLabel}
        </button>

        {allowDevLogin && (
          <button
            type="button"
            disabled={loading || devLoading}
            onClick={handleDevLogin}
            className="btn-secondary w-full"
          >
            {devLoading ? "Opening development session..." : "Continue as Dev User"}
          </button>
        )}
          </form>
        </div>
      </div>
    </section>
  );
}
