import { prisma } from "@/lib/db";

/**
 * The ingestion registry.
 *
 * Sources used to be a comma-separated `ATS_SOURCES` secret parsed in
 * `sync.ts`, duplicated across GitHub Actions and Vercel. That works for three
 * sources and does not work for thirty: a board token list is configuration,
 * not a credential, and a secret cannot be reviewed in a diff. It lives in the
 * database now so adding a company is a row, and so share and retention can be
 * tuned per source without a redeploy.
 */
export type SourceConfig = {
  key: string;
  kind: "ATS" | "AGGREGATOR";
  boardToken: string | null;
  weight: number;
  ttlDays: number;
  entryLevelOnly: boolean;
};

/**
 * Defaults for a fresh database. Retention is set from each feed's measured
 * depth rather than picked round:
 *
 *   arbeitnow   7d   the feed is a 6-day rolling window (1,842 rows across 14
 *                    pages), so a longer TTL only stores rows the feed already
 *                    dropped.
 *   remotive    14d  the entire feed is 17 rows and they expire quickly.
 *   remoteok    60d  the endpoint returns the newest ~99 postings spanning
 *                    roughly two months.
 *   ATS boards  30d  a role stays listed well past a student's deadline, so
 *                    these age out on a slow clock rather than the feed's.
 *
 * `entryLevelOnly` is on for every source. This reverses an earlier decision
 * that filtered Arbeitnow alone, on the reasoning that the ATS boards were
 * "senior by design and filtering them would leave nothing to show". Measured
 * against the live feeds, that was right that the boards are senior and wrong
 * that filtering empties them. Yield once filtered, against what each feed
 * actually returned:
 *
 *   arbeitnow            334 / 2145   16%
 *   greenhouse:stripe     47 /  716    7%
 *   remoteok               9 /   99    9%
 *   greenhouse:figma       7 /  162    4%
 *   ashby:ashby            0 /   62    0%
 *   remotive               0 /   16    0%
 *
 * A hub aimed at students that lists 900 Stripe postings they cannot apply to
 * is worse than a smaller table they can act on, so filtering is the default
 * and letting a source through unfiltered is now the deliberate exception,
 * recorded per source in the registry.
 *
 * Two sources currently filter to nothing (`ashby:ashby`, `remotive`). They
 * stay enabled because zero yield on one snapshot is not a permanent property
 * of a feed, and because a source that starts yielding needs no redeploy to
 * be picked up. They are the first candidates for
 * `npm run jobs:sources -- set <key> enabled=false`.
 *
 * Weights express how much of the row budget a source may claim, and are only
 * meaningful once the budget binds. Measured across every feed in this table,
 * total demand is ~1,400 rows against `DEFAULT_ROW_BUDGET` of 6,000, so every
 * source is supply-constrained, each takes exactly what it has, and the weights
 * are inert — `allocateBudget` was measured returning identical allocations at
 * budgets of 6,000 and 1,000, and returning arbeitnow's full demand even with
 * its weight raised from 100 to 250. They are recorded here anyway, and they
 * start working the moment `SYNC_ROW_BUDGET` is lowered toward real demand.
 *
 * The two high-volume, low-signal sources are weighted down relative to the
 * curated boards: `arbeitnow` is a general German job board where 84% of rows
 * are senior or unclassifiable, and `unstop:internships` is a 696-row student
 * feed that would otherwise take nine times the share of a single company's ATS
 * board. Devpost and the conferences feed stay at 100 because they are small,
 * current, and the events they carry are the point of adding them.
 */
const DEFAULT_SOURCES: SourceConfig[] = [
  { key: "arbeitnow", kind: "AGGREGATOR", boardToken: null, weight: 40, ttlDays: 7, entryLevelOnly: true },
  { key: "remotive", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 14, entryLevelOnly: true },
  { key: "remoteok", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 60, entryLevelOnly: true },
  { key: "greenhouse:stripe", kind: "ATS", boardToken: "stripe", weight: 100, ttlDays: 30, entryLevelOnly: true },
  { key: "greenhouse:figma", kind: "ATS", boardToken: "figma", weight: 100, ttlDays: 30, entryLevelOnly: true },
  { key: "ashby:ashby", kind: "ATS", boardToken: "ashby", weight: 100, ttlDays: 30, entryLevelOnly: true },
  { key: "devpost", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 30, entryLevelOnly: true },
  { key: "unstop:conferences", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 30, entryLevelOnly: true },
  { key: "unstop:hackathons", kind: "AGGREGATOR", boardToken: null, weight: 60, ttlDays: 30, entryLevelOnly: true },
  { key: "unstop:internships", kind: "AGGREGATOR", boardToken: null, weight: 50, ttlDays: 14, entryLevelOnly: true },
];

/**
 * Board tokens named in `ATS_SOURCES` are carried into the table on first run.
 *
 * This is the migration path, not a permanent second source of truth: the
 * existing secret keeps working on the first sync, and after that the database
 * is authoritative. Without this, deploying the registry would silently drop
 * every ATS board on the first run after the migration, because the table would
 * be empty and there is nothing in code to rebuild it from.
 */
function sourcesFromEnv(): SourceConfig[] {
  const supported = new Set(["greenhouse", "lever", "ashby"]);
  const configs: SourceConfig[] = [];

  for (const entry of (process.env.ATS_SOURCES ?? "").split(",")) {
    const trimmed = entry.trim();
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;

    const ats = trimmed.slice(0, separator).trim().toLowerCase();
    const token = trimmed.slice(separator + 1).trim();
    if (!token || !supported.has(ats)) continue;

    configs.push({
      key: trimmed,
      kind: "ATS",
      boardToken: token,
      weight: 100,
      ttlDays: 30,
      entryLevelOnly: true,
    });
  }

  return configs;
}

/**
 * Insert any missing default source without touching rows that already exist.
 *
 * `skipDuplicates` rather than an upsert on purpose: an upsert would reset the
 * weight, TTL and selection policy an operator has already tuned back to the
 * defaults on every sync. The registry is configuration, so seeding it must be
 * a one-way fill, not a recurring reconciliation.
 */
async function seedSources(): Promise<void> {
  const rows = [...DEFAULT_SOURCES, ...sourcesFromEnv()].filter(
    (config, index, all) => all.findIndex((c) => c.key === config.key) === index,
  );

  if (!rows.length) return;

  await prisma.ingestSource.createMany({
    data: rows.map((config) => ({
      key: config.key,
      kind: config.kind,
      boardToken: config.boardToken,
      weight: config.weight,
      ttlDays: config.ttlDays,
      entryLevelOnly: config.entryLevelOnly,
    })),
    skipDuplicates: true,
  });
}

export async function loadSourceConfigs(): Promise<SourceConfig[]> {
  // Seeded on every sync, not only on an empty table.
  //
  // The empty-table guard used to sit here, and it silently defeated what
  // `seedSources` was written to do. Its own comment says "insert any missing
  // default source", and `skipDuplicates` makes that safe to run repeatedly — but
  // gating it on `count === 0` meant a source added to DEFAULT_SOURCES only ever
  // reached a database that had never synced. Production already had six rows, so
  // adding `devpost` and the three `unstop:*` feeds to DEFAULT_SOURCES would have
  // created code and fetchers that CI never invoked, with no error anywhere: the
  // new sources simply would not exist. They would have needed a manual
  // `jobs:sources add` per deployment, which is a step that gets forgotten.
  //
  // Operator tuning survives this because the fill is one-way. `createMany` with
  // `skipDuplicates` inserts absent keys and leaves existing rows alone, so a
  // weight or TTL set via the CLI is never reset to the default on the next sync.
  // Disabling a source is `enabled=false`, not deleting the row; there is no
  // delete command, so nothing an operator did comes back.
  await seedSources();

  const rows = await prisma.ingestSource.findMany({
    where: { enabled: true },
    orderBy: { key: "asc" },
  });

  return rows.map((row) => ({
    key: row.key,
    kind: row.kind,
    boardToken: row.boardToken,
    weight: row.weight,
    ttlDays: row.ttlDays,
    entryLevelOnly: row.entryLevelOnly,
  }));
}
