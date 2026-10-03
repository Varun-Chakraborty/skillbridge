# SkillBridge

A student opportunity hub. Postings are pulled from public job boards every six
hours, tagged with skills from one curated vocabulary, and matched against what a
student claims on their resume.

The premise is that a student should not have to translate their experience into
a taxonomy before a job board will talk to them. A resume is prose; the matching
vocabulary is slugs. Both sides run through the same extractor, so "built a React
and Postgres dashboard" counts as evidence without anyone tagging anything.

## Stack

| | |
|---|---|
| Next.js | 16.3.8, App Router, Turbopack |
| React | 19.2.8 |
| Tailwind | v4, CSS-first config in `app/globals.css` |
| Database | Postgres (Neon in production) |
| ORM | Prisma 7.10.0 with the `@prisma/adapter-pg` driver adapter |
| Auth | hand-rolled cookie sessions — no NextAuth, no Clerk |

There are no tests and no CI beyond the sync workflow. Two verification scripts
exist instead (see [Verifying](#verifying)).

## Quickstart

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL and AUTH_SECRET
docker run -d --name pg-dev -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=skillbridge postgres:16
npm run db:migrate
npm run dev
```

The build does not require any secret to be present — `prisma.config.ts` falls
back to a localhost URL and `lib/db.ts` constructs the client lazily — so a fresh
clone can be built and type-checked before a database exists.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `AUTH_SECRET` | yes | ≥32 chars. Keys the session-token HMAC. |
| `CRON_SECRET` | production | Bearer token for `POST /api/jobs/sync`. |
| `ATS_SOURCES` | no | Comma-separated `ats:token` list, e.g. `greenhouse:figma,lever:acme`. |

Set the first three identically in GitHub Actions secrets and in the Vercel
production environment. `CRON_SECRET` gates the sync endpoint; without it that
endpoint is open.

`AUTH_SECRET` is the one that matters most. The raw session token is never
stored — only `HMAC-SHA256(token, AUTH_SECRET)` — so rotating it invalidates
every session at once. Do that if the secret is ever exposed.

## How it works

Six flows share one vocabulary file (`lib/jobs/skills.ts`) and one database.

### Ingestion — unattended, every 6 hours

`.github/workflows/sync-jobs.yml` runs on `0 */6 * * *` and applies migrations
before syncing. Six adapters in `lib/jobs/sources.ts` (Arbeitnow, Remotive,
RemoteOK, Greenhouse, Lever, Ashby) each return `NormalizedJob[]`, and each is
written defensively — a malformed field becomes `null` rather than throwing, so
one bad entry cannot lose a whole feed.

Identity is `(source, externalId)`, where `source` embeds the board token
(`greenhouse:figma`). The same job from two boards is two rows, and dropping a
token from `ATS_SOURCES` orphans its rows rather than merging them.

### Tagging

`skillsForOpportunity` extracts from title and description, then folds in the
source's own tags — but only where a tag slugifies to a known vocabulary slug.
That is how `greenhouse:figma` contributes `figma` even though the word never
appears in the posting.

The vocabulary carries `aliases` and `require` guards. `postgres` is what people
type while the slug stays `postgresql`; `go`, `r`, and `c` need surrounding
context so they do not fire on the English words.

### Matching

`rankOpportunitiesForUser` scans the newest 500 opportunities and scores each as
coverage: `Σ level(matched) / (required × 5) × 100`. A posting with no links
scores `null` and is shown as "Skills not listed" rather than given a fabricated
number.

Ordering is nulls last, then seniority, then coverage, then recency. Seniority is
a **separate signal, not part of the score**, because the dashboard labels that
number "skill coverage" — folding role fit into it would make the label lie.

### Resume

`PUT /api/profile/resume` → `parseResumeInput` → `saveResume`. Skills found in
prose become `DERIVED` rows at level 3; skills a student claims by hand are
`MANUAL` at level 4, so a deliberate claim outranks an inferred keyword. Each set
is rewritten independently, which means re-extraction cannot clobber a manual
claim and clearing the skills editor cannot erase resume evidence.

The parser is expected to call `parseResumeInput`/`saveResume` rather than write
around them, so it inherits the same limits and URL rules for free.

### Staying honest

Three mechanisms, each guarding a specific way the data goes stale:

- **Unconditional link replacement.** Deleting a posting's skill links must not
  be skipped when the new set is empty, or an edited posting keeps matching on
  skills its description no longer mentions.
- **Vocabulary versioning.** Each posting records the vocabulary version that
  produced its links. Sync stamps the current version on every write, so only
  postings that aged out of a feed carry an old one. Matching notices them on a
  query it was already making and repairs them in `after()` — the request that
  first serves a stale row is scored against the links it has, and the fix lands
  for whoever arrives next. Each repair re-stamps the row, so it happens once per
  change. Bump `VOCABULARY_VERSION` when the vocabulary gains a skill, alias or
  guard.
- **Insert-only repair.** The repair never deletes. The drift is always missing
  links, never phantom ones, and insertion-only avoids dropping tag-derived
  links on rows that have not been re-synced since `tags` became a real column.

## Verifying

```bash
npm run jobs:verify-links   # link replacement + vocabulary repair invariants
npm run jobs:sync           # run every source now, print a per-source report
```

`jobs:verify-links` drives the real `syncSource` with a stub fetcher and writes
only to a `test:` source, deleting it on exit. It covers the cases that are easy
to regress: all skills dropped, skills reintroduced, a partial shrink, a null
description, insertion-only repair, idempotency, tag recovery, and three
concurrent repairs racing on the same row.

## Deployment

Pushing to `main` deploys to Vercel. Migrations are applied by the sync workflow,
not by the build — so apply them before shipping code that reads new columns,
or the deploy will query a schema that is not there yet. The workflow runs
`prisma migrate deploy` on every sync, which makes this self-healing once the
merge lands.

The workflow's concurrency group is scoped per ref
(`sync-jobs-${{ github.ref }}`) so a manual dispatch is not cancelled by the next
scheduled run. Sync tolerates the resulting overlap: the skill-link insert uses
`skipDuplicates`.

## Known gaps

- `Bookmark`, `Application` and `Invitation` have server actions but no UI. The
  dashboard renders an applications count sourced from `Application`, which is
  therefore always zero, and an "Applied" state that cannot be reached.
- Dead postings are never removed. Measured, only ~2% of the catalog is older
  than 90 days, `fetchedAt` is uniform across the table so it cannot signal
  liveness, and absence from a feed is not proof a job closed.
- `Opportunity.expiresAt` is never populated.
- No search on the dashboard; the scan is recency-ordered and capped at 500.
- `README` had been deleted in an earlier commit; this restores it.