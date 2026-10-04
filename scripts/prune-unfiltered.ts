import "dotenv/config";
import { prisma } from "../lib/db";
import { isEntryLevel } from "../lib/jobs/relevance";
import { loadSourceConfigs } from "../lib/jobs/source-registry";

/**
 * Delete rows that the current entry-level filter would reject.
 *
 * Every source now runs `isEntryLevel` on the way in, but that only governs what
 * sync *writes*. Turning the filter on does not remove what an earlier unfiltered
 * sync already stored: `writeJobs` upserts by (source, externalId), so the rows
 * that were written before the switch are still in the table, still inside their
 * TTL, and still shown to students. The sweeper does not help either — it deletes
 * on `ttlExpiresAt`, and the first filtered sync reports `0 expired rows deleted`
 * precisely because nothing has aged out yet.
 *
 * Measured on the run that flipped the registry: 336 rows written, 0 deleted. The
 * ~1,000 senior rows the filter exists to hide were all still live, and would have
 * stayed live for up to 60 days — the RemoteOK TTL — while the hub looked like the
 * change had done nothing.
 *
 * So this applies the filter to what is already stored, using the stored title,
 * tags and employment type, and deletes what fails. Rows that pass are left
 * alone: a posting that has aged out of its feed without being re-fetched is the
 * TTL sweeper's business, not this script's.
 *
 * Only sources whose registry row has `entryLevelOnly` set are considered, so a
 * source someone has deliberately left unfiltered keeps all of its rows.
 *
 * Idempotent, and dry-run unless --apply is passed. Deletes cascade to
 * bookmarks, applications and skill links, which is intended: they hang off a
 * posting a student cannot apply to.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const configs = await loadSourceConfigs();
  const filtered = configs.filter((config) => config.entryLevelOnly).map((c) => c.key);

  console.log(
    apply ? "APPLYING" : "dry run — pass --apply to delete",
  );
  console.log(`filtering ${filtered.length} of ${configs.length} enabled sources\n`);

  let totalScanned = 0;
  let totalDeleted = 0;
  const examples: string[] = [];

  for (const key of filtered) {
    const rows = await prisma.opportunity.findMany({
      where: { source: key },
      select: { id: true, title: true, tags: true, employmentType: true },
    });

    const doomed = rows.filter((row) => !isEntryLevel(row));

    totalScanned += rows.length;
    totalDeleted += doomed.length;

    const share = rows.length === 0 ? 0 : ((doomed.length / rows.length) * 100).toFixed(0);
    console.log(
      `  ${key.padEnd(20)} ${String(rows.length).padStart(5)} stored, ${String(doomed.length).padStart(5)} rejected  ${share}%`,
    );

    for (const row of doomed.slice(0, 3)) {
      examples.push(`      ${JSON.stringify(row.title.slice(0, 56))}  tags=${JSON.stringify(row.tags.slice(0, 3))}`);
    }

    if (apply && doomed.length > 0) {
      // Chunked because a single `in` list is one parameter per id, and the
      // table is expected to hold a few thousand rows per source before this
      // runs once and never again.
      for (let i = 0; i < doomed.length; i += 500) {
        const chunk = doomed.slice(i, i + 500).map((row) => row.id);
        await prisma.opportunity.deleteMany({ where: { id: { in: chunk } } });
      }
    }
  }

  if (examples.length > 0) {
    console.log("\nsample of what the filter rejects:");
    for (const example of examples) console.log(example);
  }

  console.log(
    `\n${totalDeleted === 0
      ? `nothing to prune: all ${totalScanned} stored rows already pass`
      : `${apply ? "deleted" : "would delete"} ${totalDeleted} of ${totalScanned} stored rows`}`,
  );
  if (!apply && totalDeleted > 0) {
    console.log("re-run with --apply to delete them");
  }

  await prisma.$disconnect();
}

void main();
