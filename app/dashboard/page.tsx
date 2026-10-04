import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/dashboard/actions";
import SkillsEditor from "@/app/dashboard/skills-editor";
import { buttonVariants } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { findComplementaryStudents, rankOpportunitiesForUser } from "@/lib/matching";
import type { ScoredOpportunity } from "@/lib/matching";
import { NON_EMPLOYMENT_KINDS, type EmploymentType, type OpportunityKind } from "@/lib/jobs/normalize";

export const dynamic = "force-dynamic";

const KIND_FILTERS: { label: string; value: OpportunityKind | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Internships", value: "INTERNSHIP" },
  { label: "Hackathons", value: "HACKATHON" },
  { label: "Conferences", value: "CONFERENCE" },
  { label: "Workshops", value: "WORKSHOP" },
  { label: "Jobs", value: "JOB" },
];

const KIND_LABEL: Record<string, string> = {
  INTERNSHIP: "Internship",
  HACKATHON: "Hackathon",
  CONFERENCE: "Conference",
  WORKSHOP: "Workshop",
  JOB: "Job",
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERNSHIP: "Internship",
  VOLUNTEER: "Volunteer",
  OTHER: "",
};

const SKILL_LABEL_CACHE = new Map<string, string>();

function skillLabel(slug: string): string {
  const cached = SKILL_LABEL_CACHE.get(slug);
  if (cached) return cached;
  const label = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  SKILL_LABEL_CACHE.set(slug, label);
  return label;
}

const DAY_MS = 86_400_000;

/**
 * `en-GB` deliberately, and pinned with an explicit locale rather than left to the
 * runtime, so a `5 Oct` card reads the same on every machine regardless of locale.
 * `timeZone: "UTC"` because the dates come from upstream feeds that publish local
 * times in their own timezone; reinterpreting them in the server's zone would show
 * a deadline a day early or late depending on where CI happens to run.
 *
 * Constructed once at module scope rather than per card. It is not free, and this
 * runs for every row in the dashboard's scan window.
 */
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDay(date: Date): string {
  return DAY_FORMAT.format(date);
}

/**
 * The line that answers the only question that matters for an event: can I still
 * act on it, and when does it actually happen.
 *
 * Events carry two deadlines that are genuinely different and routinely weeks
 * apart — Unstop publishes both `end_regn_dt` and `end_date`, and a hackathon can
 * close submissions on the 19th and run until the 17th of next month. Printing
 * one number for both would either hide the deadline or hide the event.
 *
 * Past 30 days a countdown stops carrying information worth the space, so it
 * falls back to a date. Inside 30 days the countdown is the useful form, because
 * "closes in 6 days" is what changes whether a student bothers today.
 *
 * `ceil` rather than a raw division so "closes in 1 day" means a day is left
 * rather than "0 days, i.e. today": a deadline one hour out floors to 0 and would
 * be mislabelled as closed while still reachable.
 */
function scheduleNote(match: ScoredOpportunity): string | null {
  const parts: string[] = [];
  const isEvent = NON_EMPLOYMENT_KINDS.has(match.kind as OpportunityKind);

  if (isEvent && match.startsAt && match.endsAt) {
    parts.push(`${formatDay(match.startsAt)} – ${formatDay(match.endsAt)}`);
  }

  if (match.expiresAt) {
    const days = Math.ceil((match.expiresAt.getTime() - Date.now()) / DAY_MS);
    if (days < 0) {
      parts.push("Closed");
    } else if (days === 0) {
      parts.push("Closes today");
    } else if (days <= 30) {
      parts.push(`Closes in ${days} day${days === 1 ? "" : "s"}`);
    } else {
      parts.push(`${isEvent ? "Register" : "Apply"} by ${formatDay(match.expiresAt)}`);
    }
  }

  return parts.length ? parts.join(" · ") : null;
}

/**
 * What the call to action actually does, which is not "apply" for an event — you
 * register for a conference and enter a hackathon. Keyed by kind rather than
 * derived from the event set, so a kind added without an entry here falls back to
 * neutral wording instead of rendering a blank button.
 */
const ACTION_LABEL: Record<string, string> = {
  HACKATHON: "Enter",
  CONFERENCE: "Register",
  WORKSHOP: "Sign up",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * Reads the kind filter straight off the search params so filtering happens in
 * Postgres rather than in the browser.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fdashboard");

  const { kind } = await searchParams;
  const activeKind = (Object.keys(KIND_LABEL) as string[]).includes(kind ?? "")
    ? (kind as OpportunityKind)
    : null;

  const [matches, suggestions, skills, bookmarkCount, applicationCount, inviteCount, applied] =
    await Promise.all([
      rankOpportunitiesForUser(user.id, {
        limit: 24,
        kinds: activeKind ? [activeKind] : undefined,
      }),
      findComplementaryStudents(user.id, 6),
      prisma.skill.findMany({
        where: { userId: user.id },
        orderBy: { slug: "asc" },
        select: { slug: true, name: true, origin: true },
      }),
      prisma.bookmark.count({ where: { userId: user.id } }),
      prisma.application.count({ where: { userId: user.id } }),
      prisma.invitation.count({ where: { inviterId: user.id } }),
      prisma.application.findMany({
        where: { userId: user.id },
        select: { opportunityId: true },
      }),
    ]);

  const appliedIds = new Set(applied.map((row) => row.opportunityId));

  // Manual and derived skills are edited in different places, so the dashboard
  // only needs to hand each group to the right one.
  const manualSkills = skills.filter((skill) => skill.origin === "MANUAL");
  const derivedSkills = skills.filter((skill) => skill.origin === "DERIVED");

  // Only credit an upstream that actually appears in what we just returned, and
  // only that specific board, so a page of Figma roles links Figma rather than
  // every Greenhouse board we happen to poll.
  const presentSources = new Set(matches.map((match) => match.source));

  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const scored = matches.filter((match) => match.score !== null);
  const topMatch = scored[0];

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
              S
            </span>
            <span className="font-display text-xl font-bold">SkillBridge</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <Link
              href="/dashboard"
              aria-current="page"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
            >
              Discover
            </Link>
            <Link
              href="/dashboard#teams"
              className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Teams
            </Link>
            <Link href="/dashboard#skills" className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted">
              My skills
            </Link>
            <Link href="/onboarding" className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted">
              Resume
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-full border-2 border-border bg-card py-1.5 pl-2 pr-4">
              <span className="grid size-8 place-items-center rounded-full bg-feature text-sm font-bold text-feature-foreground">
                {initials(user.name)}
              </span>
              <span className="hidden text-sm font-semibold sm:inline">{user.name}</span>
            </div>
            <form action={signOutAction}>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-5">
        <section className="grid items-end gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="inline-block rounded-full bg-secondary px-3 py-1.5 text-xs font-bold uppercase">
              {matches.length} listing{matches.length === 1 ? "" : "s"} for your skills
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1] sm:text-5xl md:text-6xl">
              Welcome back,
              <br />
              <span className="text-primary">{firstName}</span> — here&apos;s
              <br />
              <span className="text-feature">what fits your stack</span>
            </h1>
            {skills.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {skills.slice(0, 8).map((skill) => (
                  <span
                    key={skill.slug}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature"
                  >
                    {skill.name}
                  </span>
                ))}
                {skills.length > 8 ? (
                  <span className="px-1 py-1 text-xs font-semibold text-muted-foreground">
                    +{skills.length - 8} more
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 max-w-md text-lg text-muted-foreground">
                Nothing to match against yet. Add your resume and we will read your skills out of
                it.
              </p>
            )}
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-feature p-6 text-feature-foreground shadow-studio">
              <p className="text-xs font-semibold uppercase">Strongest match</p>
              {topMatch ? (
                <>
                  <h2 className="mt-2 font-display text-2xl font-bold">{topMatch.title}</h2>
                  <p className="mt-1 text-sm">
                    {topMatch.score}% skill coverage
                    {topMatch.location ? ` · ${topMatch.location}` : ""}
                  </p>
                  {topMatch.matchedSkills.length ? (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {topMatch.matchedSkills.map((slug) => (
                        <span
                          key={slug}
                          className="rounded-full bg-background/20 px-2.5 py-1 text-xs font-semibold"
                        >
                          {skillLabel(slug)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <h2 className="mt-2 font-display text-2xl font-bold">Nothing scored yet</h2>
                  <p className="mt-1 text-sm">
                    Add your resume and we will read your skills out of it, then rank every
                    listing against them.
                  </p>
                  <Link
                    href="/onboarding"
                    className="mt-4 inline-block rounded-full bg-background px-4 py-2 text-sm font-bold text-foreground"
                  >
                    Add your resume
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Your activity">
          {[
            [String(applicationCount), "Applications", "text-primary"],
            [String(bookmarkCount), "Bookmarked", "text-accent"],
            [String(inviteCount), "Team invites", "text-feature"],
            [String(skills.length), "Skills listed", "text-warning"],
          ].map(([value, label, tone]) => (
            <div key={label} className="rounded-2xl border-2 border-border bg-card p-4">
              <p className={`font-display text-3xl font-bold ${tone}`}>{value}</p>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
            </div>
          ))}
        </section>

        <section id="discover" className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">
                Matched to your skills
              </p>
              <h2 className="font-display text-3xl font-bold">Explore opportunities</h2>
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Filter by type">
              {KIND_FILTERS.map((option) => (
                <Link
                  key={option.value}
                  href={option.value === "ALL" ? "/dashboard" : `/dashboard?kind=${option.value}`}
                  aria-current={activeKind === option.value ? "true" : undefined}
                  className={buttonVariants({
                    variant: activeKind === option.value ? "ink" : "outline",
                    size: "sm",
                  })}
                >
                  {option.label}
                </Link>
              ))}
            </nav>
          </div>

          {matches.length ? (
            <ul className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {matches.map((match) => {
                const employment = EMPLOYMENT_LABEL[
                  match.employmentType as EmploymentType
                ];
                // Computed once. Calling it inline in the markup would run it twice
                // per card, and since it reads the clock a deadline landing on
                // midnight could render "Closes in 1 day" and "Closes today" in the
                // same card.
                const schedule = scheduleNote(match);
                const action = ACTION_LABEL[match.kind] ?? "View & apply";
                return (
                  <li
                    key={match.id}
                    className="card-rise flex flex-col rounded-3xl border-2 border-border bg-card p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                        {KIND_LABEL[match.kind] ?? match.kind}
                      </span>
                      {match.remote ? (
                        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                          Remote
                        </span>
                      ) : null}
                      {employment ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature">
                          {employment}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-3 font-display text-lg font-bold leading-snug">
                      {match.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {match.company ?? "Independent"}
                      {match.location ? ` · ${match.location}` : ""}
                    </p>

                    {schedule ? (
                      <p className="mt-1 text-xs font-semibold text-feature">{schedule}</p>
                    ) : null}

                    {match.matchedSkills.length || match.missingSkills.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {match.matchedSkills.map((slug) => (
                          <span
                            key={slug}
                            className="rounded-full bg-feature/15 px-2.5 py-1 text-xs font-semibold text-feature"
                          >
                            {skillLabel(slug)}
                          </span>
                        ))}
                        {match.missingSkills.slice(0, 4).map((slug) => (
                          <span
                            key={slug}
                            className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                          >
                            {skillLabel(slug)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {match.seniority > 0 ? (
                      <p className="mt-3 text-xs font-semibold text-warning">
                        Aimed at experienced candidates. The skills overlap, but the role likely
                        wants a track record you have not started yet.
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between gap-2 border-t-2 border-border pt-4">
                      {match.score === null ? (
                        <span className="text-sm font-semibold text-muted-foreground">
                          Skills not listed
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-accent">
                          {match.score}% skill coverage
                        </span>
                      )}
                      {match.applyUrl ? (
                        <a
                          href={match.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className={buttonVariants({
                            variant: appliedIds.has(match.id) ? "secondary" : "ink",
                            size: "sm",
                          })}
                        >
                          {appliedIds.has(match.id)
                            ? "Applied · View post"
                            : action}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No direct link</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-6 rounded-3xl border-2 border-dashed border-border bg-card p-10 text-center">
              <p className="font-display text-xl font-bold">No listings in this category</p>
              <p className="text-sm text-muted-foreground">
                Run a sync to pull the latest openings, or try another category.
              </p>
            </div>
          )}

          {presentSources.size ? (
            <p className="mt-6 text-xs text-muted-foreground">
              Listings are pulled from public job board feeds and belong to their owners. Sources:{" "}
              {[...presentSources].sort().join(", ")}
            </p>
          ) : null}
        </section>

        <section id="skills" className="mt-10 scroll-mt-24 rounded-3xl border-2 border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Skills we match on</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your resume supplies most of these. Add anything it missed.
              </p>
            </div>
            <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Edit resume
            </Link>
          </div>
          <SkillsEditor
            current={manualSkills.map((skill) => skill.slug)}
            derived={derivedSkills.map((skill) => skill.slug)}
          />
        </section>

        <section id="teams" className="mt-10 grid scroll-mt-24 gap-6 lg:grid-cols-12">
          <div className="rounded-3xl border-2 border-border bg-card p-5 sm:p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl font-bold">Build your team</h2>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-feature">
                Complementary skills
              </span>
            </div>
            {suggestions.length ? (
              <ul className="mt-5 space-y-3">
                {suggestions.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 rounded-2xl bg-background p-3 sm:gap-4"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-foreground">
                      {initials(member.name)}
                    </span>
                    <div className="min-w-0 grow">
                      <p className="font-bold">{member.name}</p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        {member.skills.slice(0, 4).map(skillLabel).join(" · ") || "No skills listed"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature">
                      {member.complementCount} new skill{member.complementCount === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                No complementary students found yet. Matching needs at least two students with
                skills on file.
              </p>
            )}
          </div>

          <div className="rounded-3xl bg-foreground p-6 text-background lg:col-span-5">
            <h2 className="font-display text-2xl font-bold">How matching works</h2>
            <ul className="mt-4 space-y-4 text-sm opacity-85">
              <li>
                <span className="font-bold text-secondary">Skills from your resume</span> — we
                read the skills out of what you have written, so you never tag them yourself.
                Anything you claim by hand counts for more than something we inferred.
              </li>
              <li>
                <span className="font-bold text-secondary">Coverage</span> — the score is the
                weighted share of a posting&apos;s skills that you have, so a posting asking for
                more than you do scores lower.
              </li>
              <li>
                <span className="font-bold text-secondary">Level</span> — internships and junior
                roles come first. Senior postings are shown too, but flagged, because the skills
                overlapping does not mean the role is open to you.
              </li>
              <li>
                <span className="font-bold text-secondary">Honest gaps</span> — postings we
                cannot read any skills out of are marked &quot;Skills not listed&quot; rather
                than given a made-up score.
              </li>
            </ul>
          </div>
        </section>

        <footer className="mt-12 flex flex-col gap-2 border-t-2 border-foreground py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>SkillBridge · Turn learning into momentum.</p>
          <p>Listings belong to the companies and boards that published them.</p>
        </footer>
      </main>
    </div>
  );
}
