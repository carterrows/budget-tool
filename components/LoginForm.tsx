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
    <section className="card w-full max-w-md p-8">
      <div className="mb-8 space-y-2">
        <p className="caps-label text-xs font-semibold uppercase text-forest-600">Budget Tool</p>
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">Personal Budget</h1>
        <p className="text-sm text-forest-700/80">Sign in to access your private budget.</p>
      </div>

      <div className="mb-6 flex gap-2 rounded-lg border border-forest-200/70 bg-paper/80 p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`btn h-10 flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            mode === "login"
              ? "bg-forest-900 text-white shadow-sm focus-visible:ring-forest-500"
              : "bg-transparent text-forest-700 hover:bg-forest-100/80 focus-visible:ring-forest-400"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          disabled={!canUseSignup}
          onClick={() => setMode("signup")}
          className={`btn h-10 flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            mode === "signup"
              ? "bg-forest-900 text-white shadow-sm focus-visible:ring-forest-500"
              : "bg-transparent text-forest-700 hover:bg-forest-100/80 focus-visible:ring-forest-400"
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
            className="input"
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
            className="input"
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
    </section>
  );
}
