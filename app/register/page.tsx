"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";

const SUGGESTED = ["Python", "JavaScript", "React", "Figma", "SQL", "Go"];

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function addSkill(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSkills((current) =>
      current.some((s) => s.toLowerCase() === trimmed.toLowerCase()) ? current : [...current, trimmed],
    );
    setSkillDraft("");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, skills }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not create your account.");
        return;
      }
      router.push("/dashboard");
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

        <h1 className="mt-8 font-display text-3xl font-bold">Create your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a few skills so we can rank the openings that actually fit.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold">Name</span>
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground"
            />
          </label>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground"
            />
            <span className="mt-1.5 block text-xs text-muted-foreground">
              At least 8 characters.
            </span>
          </label>

          <div>
            <span className="text-sm font-semibold">Skills</span>
            <div className="mt-1.5 flex gap-2">
              <input
                type="text"
                value={skillDraft}
                onChange={(event) => setSkillDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSkill(skillDraft);
                  }
                }}
                placeholder="Type a skill and press Enter"
                className="min-w-0 flex-1 rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground"
              />
              <button type="button" onClick={() => addSkill(skillDraft)} className={buttonVariants({ variant: "outline" })}>
                Add
              </button>
            </div>

            {skills.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => setSkills((current) => current.filter((s) => s !== skill))}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature hover:line-through"
                  >
                    {skill}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTED.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => addSkill(skill)}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature hover:bg-muted/70"
                  >
                    + {skill}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className={`${buttonVariants()} w-full`}>
            {pending ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}