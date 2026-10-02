import Link from "next/link";
import { redirect } from "next/navigation";

import ResumeForm from "@/app/onboarding/resume-form";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { getResume } from "@/lib/profile/resume-store";
import { extractResumeSkills, resumeCompleteness } from "@/lib/resume";

export const dynamic = "force-dynamic";

/**
 * Onboarding and profile editing are the same screen. A student arrives here
 * straight after signing up, and comes back to it whenever their resume changes.
 * Splitting the two would mean maintaining one form twice.
 */
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fonboarding");

  const resume = await getResume(user.id);

  // Run the extractor on the server so the page can show the student which
  // skills their current text already yields, before they save anything. It is
  // the same code path the save uses, so the preview cannot overstate what
  // matching will see.
  //
  // A stored resume carries a few extra fields (its source, and whether it has
  // been saved) that the extractor ignores, so it is passed through as-is
  // rather than rebuilt field by field.
  const { known, custom } = extractResumeSkills(resume);
  const completeness = resumeCompleteness(resume);

  const isReturning = resume.saved;
  const detected = [...known, ...custom];

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/95">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
              S
            </span>
            <span className="font-display text-xl font-bold">SkillBridge</span>
          </Link>

          <div className="ml-auto">
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {isReturning ? "Back to dashboard" : "Skip for now"}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-5">
        <p className="inline-block rounded-full bg-secondary px-3 py-1.5 text-xs font-bold uppercase">
          {isReturning ? "Your resume" : "Step 2 of 2"}
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1] sm:text-5xl">
          {isReturning ? (
            "Update your resume"
          ) : (
            <>
              Tell us what you have
              <br />
              <span className="text-primary">actually built</span>
            </>
          )}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Write it the way you would in a CV. We read the skills out of your experience,
          projects and coursework, so there is no list of skills to maintain.
        </p>

        {resume.source === "PARSED" ? (
          <p className="mt-4 rounded-2xl bg-accent/15 px-4 py-3 text-sm font-semibold text-accent">
            This resume was filled in by a parser. Edit anything that looks wrong.
          </p>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border-2 border-border bg-card p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Skills we can already see
            </p>
            {detected.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detected.map((slug) => (
                  <span
                    key={slug}
                    className="rounded-full bg-feature/15 px-2.5 py-1 text-xs font-semibold text-feature"
                  >
                    {slug.replace(/-/g, " ")}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing yet. Add experience or projects and this fills in on its own.
              </p>
            )}
          </div>

          <div className="rounded-3xl border-2 border-border bg-card p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">Profile filled in</p>
            <p className="mt-2 font-display text-3xl font-bold text-warning">
              {completeness.filled}
              <span className="text-lg text-muted-foreground"> / {completeness.total}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              More detail means sharper matches, but it is all optional.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <ResumeForm resume={resume} />
        </div>
      </main>
    </div>
  );
}
