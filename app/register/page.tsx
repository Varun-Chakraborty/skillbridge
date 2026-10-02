"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { inputClass, labelClass, sectionTitleClass } from "@/components/ui/form";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not create your account.");
        return;
      }
      // Onboarding is a separate screen so the account step stays quick, and so
      // the resume form has room to be a real form rather than a collapsed
      // extra on this one.
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
            S
          </span>
          <span className="font-display text-xl font-bold">SkillBridge</span>
        </Link>

        <h1 className="mt-8 font-display text-3xl font-bold">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Next step is your resume. We read the skills out of it, so you never have to tag
          them by hand.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className={labelClass}>Name</span>
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
            <span className="mt-1.5 block text-xs text-muted-foreground">
              At least 8 characters.
            </span>
          </label>

          {error ? (
            <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className={`${buttonVariants()} w-full`}>
            {pending ? "Creating…" : "Continue to resume"}
          </button>
        </form>

        <p className={`mt-6 text-sm text-muted-foreground ${sectionTitleClass}`}>
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
