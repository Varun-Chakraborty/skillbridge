"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";

import { buttonVariants } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={`${buttonVariants()} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
            S
          </span>
          <span className="font-display text-xl font-bold">SkillBridge</span>
        </Link>

        <h1 className="mt-8 font-display text-3xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to see the openings matched to your skills.
        </p>

        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}