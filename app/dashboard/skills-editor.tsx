"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateSkillsAction } from "@/app/dashboard/actions";
import { buttonVariants } from "@/components/ui/button";
import { knownSkills } from "@/lib/jobs/skills";

const SUGGESTED = knownSkills().slice(0, 14);

export default function SkillsEditor({
  current,
  derived = [],
}: {
  /** Skills the student picked by hand. Editable here. */
  current: string[];
  /** Skills read out of the resume. Shown for context, not editable here. */
  derived?: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(current);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(slug: string) {
    setSelected((existing) =>
      existing.includes(slug) ? existing.filter((s) => s !== slug) : [...existing, slug],
    );
  }

  function addDraft() {
    const value = draft.trim();
    if (!value) return;
    const slug = value
      .toLowerCase()
      .replace(/\.(js|ts|py)$/i, "")
      .replace(/[^a-z0-9+#]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug.length >= 2 && !selected.includes(slug)) {
      setSelected((existing) => [...existing, slug]);
    }
    setDraft("");
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSkillsAction(selected);
      if (!result.ok) {
        setError(result.error ?? "Could not save your skills.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addDraft();
            }
          }}
          placeholder="Type a skill and press Enter"
          className="min-w-0 flex-1 rounded-full border-2 border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
        <button
          type="button"
          onClick={addDraft}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Add
        </button>
      </div>

      {selected.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => toggle(slug)}
                className="rounded-full bg-feature/15 px-2.5 py-1 text-xs font-semibold text-feature hover:line-through"
              >
                {slug.replace(/-/g, " ")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing added here yet. Your resume still counts on its own.
        </p>
      )}

      {derived.length ? (
        <>
          <p className="mt-6 text-xs font-bold uppercase text-muted-foreground">
            From your resume
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {derived.map((slug) => (
              <li
                key={slug}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
              >
                {slug.replace(/-/g, " ")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            These come from your resume and are matched automatically. Edit the resume to change
            them.
          </p>
        </>
      ) : null}

      <p className="mt-4 text-xs font-bold uppercase text-muted-foreground">Common skills</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTED.map((skill) => (
          <button
            key={skill.slug}
            type="button"
            onClick={() => toggle(skill.slug)}
            aria-pressed={selected.includes(skill.slug)}
            className={
              selected.includes(skill.slug)
                ? "rounded-full bg-feature px-2.5 py-1 text-xs font-semibold text-feature-foreground"
                : "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature hover:bg-muted/70"
            }
          >
            {selected.includes(skill.slug) ? "✓ " : "+ "}
            {skill.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className={`${buttonVariants({ variant: "ink" })} mt-4`}
      >
        {pending ? "Saving…" : "Save skills"}
      </button>
    </div>
  );
}
