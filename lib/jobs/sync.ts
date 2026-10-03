import { prisma } from "@/lib/db";
import {
  fetchArbeitnow,
  fetchAshby,
  fetchGreenhouse,
  fetchLever,
  fetchRemoteok,
  fetchRemotive,
} from "./sources";
import { SourceError, type NormalizedJob } from "./normalize";
import { skillsForOpportunity, VOCABULARY_VERSION } from "./skills";
import { allocateBudget, compareWithinSource, isEntryLevel } from "./relevance";
import { loadSourceConfigs, type SourceConfig } from "./source-registry";
import { sweepExpired } from "./ttl";

type Fetcher = () => Promise<NormalizedJob[]>;

/**
 * Total rows one sync may write across all sources, before per-source shares.
 *
 * This is a share governor, not a storage guard. The database is 44 MB against
 * a 1 GB ceiling, so capacity is not what is being defended — balance is. Without
 * a governor the largest feed wins by default, and Arbeitnow alone was 62% of
 * the table. Override with `SYNC_ROW_BUDGET`.
 */
const DEFAULT_ROW_BUDGET = 6000;

function rowBudget(): number {
  const configured = Number(process.env.SYNC_ROW_BUDGET);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_ROW_BUDGET;
}

function fetcherFor(config: SourceConfig): Fetcher {
  if (config.kind === "ATS") {
    if (!config.boardToken) {
      return async () => {
        throw new SourceError(config.key, "registry row has no boardToken");
      };
    }
    const token = config.boardToken;
    if (config.key.startsWith("greenhouse:")) return () => fetchGreenhouse(token);
    if (config.key.startsWith("ashby:")) return () => fetchAshby(token);
    if (config.key.startsWith("lever:")) return () => fetchLever(token);
    return async () => {
      throw new SourceError(config.key, `no fetcher for board token ${token}`);
    };
  }

  if (config.key === "arbeitnow") return fetchArbeitnow;
  if (config.key === "remotive") return fetchRemotive;
  if (config.key === "remoteok") return fetchRemoteok;
  return async () => {
    throw new SourceError(config.key, "no fetcher for aggregator");
  };
}

export type SyncReport = {
  source: string;
  ok: boolean;
  fetched: number;
  written: number;
  /** This source's share of the row budget for this run. */
  budget: number;
  error?: string;
};

type WriteOptions = {
  /** Retention materialized onto each written row. Defaults to the registry's. */
  ttlDays?: number;
};

export async function syncSource(
  name: string,
  fetcher: Fetcher,
  options: WriteOptions = {},
): Promise<SyncReport> {
  let jobs: NormalizedJob[];
  try {
    jobs = await fetcher();
  } catch (error) {
    const message =
      error instanceof SourceError
        ? error.message
        : error instanceof Error
          ? error.message
          : "unknown error";
    return { source: name, ok: false, fetched: 0, written: 0, budget: 0, error: message };
  }

  const written = await writeJobs(name, jobs, options.ttlDays ?? 30);
  return { source: name, ok: true, fetched: jobs.length, written, budget: written };
}

/**
 * Persist a source's postings and rebuild their skill links.
 *
 * `ttlDays` is materialized onto each row as `ttlExpiresAt`, measured from the
 * moment of this write rather than from the posting's publish date. That
 * distinction is the whole reason retention is safe here: no source publishes a
 * closing date, and Greenhouse in particular serves roles that were first
 * published months ago and are still open today. A deadline measured from
 * `publishedAt` would delete a live req. Measured from last-seen, a posting
 * that keeps appearing in its feed keeps extending its own deadline, and only a
 * posting that has stopped appearing for `ttlDays` is actually deleted — which
 * makes this the absence signal the feeds never provided, bounded per source by
 * that feed's own depth.
 */
async function writeJobs(source: string, jobs: NormalizedJob[], ttlDays: number): Promise<number> {
  const fetchedAt = new Date();
  const ttlExpiresAt = new Date(fetchedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const extracted = jobs.map((job) => skillsForOpportunity(job));
  const labelBySlug = new Map<string, string>();
  for (const skills of extracted) {
    for (const skill of skills) labelBySlug.set(skill.slug, skill.label);
  }
  if (labelBySlug.size) {
    await prisma.skillDefinition.createMany({
      data: [...labelBySlug].map(([slug, label]) => ({ slug, label })),
      skipDuplicates: true,
    });
  }

  let written = 0;
  for (const [index, job] of jobs.entries()) {
    const skills = extracted[index]!;
    const opportunity = await prisma.opportunity.upsert({
      where: { source_externalId: { source: job.source, externalId: job.externalId } },
      create: {
        source: job.source,
        externalId: job.externalId,
        kind: job.kind,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        description: job.description,
        applyUrl: job.applyUrl,
        logoUrl: job.logoUrl,
        tags: job.tags,
        vocabVersion: VOCABULARY_VERSION,
        publishedAt: job.publishedAt,
        expiresAt: job.expiresAt,
        fetchedAt,
        ttlExpiresAt,
      },
      update: {
        kind: job.kind,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        description: job.description,
        applyUrl: job.applyUrl,
        logoUrl: job.logoUrl,
        tags: job.tags,
        vocabVersion: VOCABULARY_VERSION,
        publishedAt: job.publishedAt,
        expiresAt: job.expiresAt,
        fetchedAt,
        ttlExpiresAt,
      },
      select: { id: true },
    });

    // Replacing the links is unconditional in the delete direction. A posting
    // that stops mentioning a skill has to stop matching on it, and guarding
    // this on `skills.length` skipped the delete whenever the new set came back
    // empty — which left the previous links in place, so a re-fetched posting
    // could keep scoring on skills its description no longer contained.
    //
    // The create is still conditional, since there is no point issuing an empty
    // insert, and the two stay in one transaction so a reader never observes a
    // posting with no links between the delete and the insert.
    await prisma.$transaction([
      prisma.opportunitySkill.deleteMany({ where: { opportunityId: opportunity.id } }),
      ...(skills.length
        ? [
            prisma.opportunitySkill.createMany({
              data: skills.map((skill) => ({
                opportunityId: opportunity.id,
                skillSlug: skill.slug,
              })),
              // Two syncs can overlap now that the workflow's concurrency group
              // is scoped per ref: a branch dispatch and a scheduled run may both
              // be writing. A delete takes no lock on rows that do not exist yet,
              // so both can clear the table for a posting and then race to
              // reinsert the same keys. Skipping duplicates makes the outcome
              // the same set of links either way.
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    written += 1;
  }

  return written;
}

type Fetched = {
  config: SourceConfig;
  jobs: NormalizedJob[];
  error?: string;
};

/**
 * Run every enabled source, then expire what is past its deadline.
 *
 * Three phases rather than one, because a per-source share cannot be computed
 * until every source's feed has been read. Fetching first also means one dead
 * board cannot starve the others: its budget is released rather than consumed.
 */
export async function syncAllSources(): Promise<SyncReport[]> {
  const configs = await loadSourceConfigs();
  const budget = rowBudget();

  // Phase 1: read every feed in parallel and apply each source's own selection
  // policy. `entryLevelOnly` is applied here rather than after budgeting so a
  // source's budget reflects what it can actually contribute, not what its feed
  // nominally contained.
  const fetched: Fetched[] = await Promise.all(
    configs.map(async (config): Promise<Fetched> => {
      try {
        const jobs = await fetcherFor(config)();
        return {
          config,
          jobs: config.entryLevelOnly ? jobs.filter(isEntryLevel) : jobs,
        };
      } catch (error) {
        return {
          config,
          jobs: [],
          error:
            error instanceof SourceError || error instanceof Error
              ? error.message
              : "unknown error",
        };
      }
    }),
  );

  // Phase 2: split the budget by weight, giving up slices that sources with
  // small feeds cannot fill.
  const allocation = allocateBudget(
    fetched.map((entry) => ({
      key: entry.config.key,
      weight: entry.config.weight,
      demand: entry.jobs.length,
    })),
    budget,
  );

  // Phase 3: write the capped slice, best rows first.
  const reports = await Promise.all(
    fetched.map(async (entry): Promise<SyncReport> => {
      const share = allocation.get(entry.config.key) ?? 0;

      if (entry.error) {
        return {
          source: entry.config.key,
          ok: false,
          fetched: 0,
          written: 0,
          budget: share,
          error: entry.error,
        };
      }

      // Ranking before the cap is what makes a share cut land on the right rows:
      // entry-level first, then remote, then newest. Without it, trimming a
      // 1,842-row feed to a few hundred would keep whichever rows happened to
      // sort first upstream rather than the ones a student can use.
      const capped = [...entry.jobs].sort(compareWithinSource).slice(0, share);

      try {
        const written = await writeJobs(entry.config.key, capped, entry.config.ttlDays);
        return {
          source: entry.config.key,
          ok: true,
          fetched: entry.jobs.length,
          written,
          budget: share,
        };
      } catch (error) {
        return {
          source: entry.config.key,
          ok: false,
          fetched: entry.jobs.length,
          written: 0,
          budget: share,
          error: error instanceof Error ? error.message : "unknown error",
        };
      }
    }),
  );

  // Phase 4: retention. Runs after the writes so a posting that just reappeared
  // in its feed has already had its deadline extended, and this sweep cannot
  // delete the row that was refreshed moments ago.
  const expired = await sweepExpired();

  reports.sort((a, b) => a.source.localeCompare(b.source));
  const okCount = reports.filter((report) => report.ok).length;
  console.log(
    `sync: ${okCount}/${reports.length} sources ok, ` +
      `${reports.reduce((sum, r) => sum + r.written, 0)} rows written, ` +
      `${expired} expired rows deleted, budget ${budget}`,
  );
  for (const report of reports) {
    console.log(
      `  ${report.ok ? "ok  " : "FAIL"} ${report.source.padEnd(22)} ` +
        `fetched ${String(report.fetched).padStart(5)} | budget ${String(report.budget).padStart(5)} | ` +
        `written ${String(report.written).padStart(5)}` +
        (report.error ? ` | ${report.error}` : ""),
    );
  }

  return reports;
}
