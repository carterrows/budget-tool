"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

  const canUseSignup = allowSignup;
  const submitLabel = useMemo(
    () => (mode === "login" ? "Sign In" : "Create Account"),
    [mode]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }

    if (mode === "signup" && !canUseSignup) {
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
    <section className="w-full max-w-md rounded-2xl border border-forest-200 bg-white p-8 shadow-card">
      <div className="mb-8 space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-forest-600">Budget Tool</p>
        <h1 className="text-3xl font-semibold">Personal Budget</h1>
        <p className="text-sm text-forest-700/80">Sign in to access your private budget.</p>
      </div>

      <div className="mb-6 flex gap-2 rounded-lg bg-paper p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "login"
              ? "bg-forest-900 text-white"
              : "text-forest-700 hover:bg-forest-100"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          disabled={!canUseSignup}
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "signup"
              ? "bg-forest-900 text-white"
              : "text-forest-700 hover:bg-forest-100"
          } disabled:cursor-not-allowed disabled:opacity-45`}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-forest-800">Username</span>
          <input
            type="text"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-forest-500"
            placeholder="your-name"
            required
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-forest-800">Password</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-forest-500"
            placeholder="********"
            required
          />
        </label>

        {mode === "signup" && (
          <p className="text-xs text-forest-700/80">
            Use lowercase letters, numbers, <code>_</code> or <code>-</code>.
          </p>
        )}

        {!canUseSignup && (
          <p className="text-xs text-forest-700/80">
            Sign up disabled. Set <code>ALLOW_SIGNUP=true</code> to enable account
            creation.
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
          className="w-full rounded-lg bg-forest-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Please wait..." : submitLabel}
        </button>

        {allowDevLogin && (
          <button
            type="button"
            disabled={loading || devLoading}
            onClick={handleDevLogin}
            className="w-full rounded-lg border border-forest-300 px-4 py-2.5 text-sm font-semibold text-forest-800 transition hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {devLoading ? "Opening development session..." : "Continue as Dev User"}
          </button>
        )}
      </form>
    </section>
  );
}
