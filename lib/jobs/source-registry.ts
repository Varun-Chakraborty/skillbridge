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
 * `entryLevelOnly` is on for Arbeitnow only. It is the one source whose feed is
 * 85% senior or unclassifiable; the ATS boards are senior by design and
 * filtering them would leave nothing to show.
 */
const DEFAULT_SOURCES: SourceConfig[] = [
  { key: "arbeitnow", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 7, entryLevelOnly: true },
  { key: "remotive", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 14, entryLevelOnly: false },
  { key: "remoteok", kind: "AGGREGATOR", boardToken: null, weight: 100, ttlDays: 60, entryLevelOnly: false },
  { key: "greenhouse:stripe", kind: "ATS", boardToken: "stripe", weight: 100, ttlDays: 30, entryLevelOnly: false },
  { key: "greenhouse:figma", kind: "ATS", boardToken: "figma", weight: 100, ttlDays: 30, entryLevelOnly: false },
  { key: "ashby:ashby", kind: "ATS", boardToken: "ashby", weight: 100, ttlDays: 30, entryLevelOnly: false },
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
      entryLevelOnly: false,
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
  // Self-healing on an empty table rather than failing: a database that has
  // been migrated but never synced would otherwise ingest nothing at all and
  // report success, which reads exactly like "every source is broken".
  const count = await prisma.ingestSource.count();
  if (count === 0) await seedSources();

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
