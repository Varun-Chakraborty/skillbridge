import { prisma } from "@/lib/db";

/**
 * Hard retention. Deletes every row whose materialized `ttlExpiresAt` has passed.
 *
 * Retention is materialized onto each row at write time from its source's
 * `ttlDays`, so this is one indexed range scan with no join. It also means a
 * row is deleted under the policy that was in force when it was last written:
 * shortening a source's TTL does not retroactively reach rows that have not
 * been re-fetched since, and lengthening it does not rescue rows already past
 * their deadline. That asymmetry is deliberate and is why the workflow runs
 * every six hours — the TTL is only as current as the last sync.
 *
 * `Bookmark`, `Application` and `OpportunitySkill` all cascade from
 * `Opportunity` in the schema, so this removes a student's saved rows along
 * with the posting. That is the intended reading of "hard TTL" for a listing
 * that has aged out of its feed, but it is the one irreversible edge in the
 * pipeline: a bookmark on an expired posting is deleted rather than flagged.
 */
export async function sweepExpired(): Promise<number> {
  const now = new Date();
  const { count } = await prisma.opportunity.deleteMany({
    where: { ttlExpiresAt: { lt: now } },
  });
  return count;
}

/**
 * Current retention pressure, for the sync report.
 *
 * Counts rows already past their deadline rather than deleting them, so a
 * failing or never-run sweeper is visible in the report instead of silently
 * looking like a healthy database.
 */
export async function pendingExpiry(): Promise<number> {
  return prisma.opportunity.count({
    where: { ttlExpiresAt: { lt: new Date() } },
  });
}
