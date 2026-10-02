import { prisma } from "@/lib/db";
import { skillsForOpportunity, VOCABULARY_VERSION } from "./skills";

/**
 * Repairs skill links on postings whose links were derived by an older version
 * of the vocabulary.
 *
 * Why this exists: sync derives links from the live feed every six hours, but a
 * posting that ages out of its feed is never re-fetched. When the vocabulary
 * grows, those rows keep the skills the old version could see and never gain the
 * new ones, so they quietly under-report and under-score. Measured on the 500-row
 * matching window, 12 rows were missing 21 links between them.
 *
 * Why it is lazy: only a posting that someone actually served is worth
 * re-deriving. Rows outside the scan window are never read, so repairing them
 * would be work nobody benefits from. Detection therefore happens on the read
 * path and the write happens behind the response.
 *
 * Why it only ever adds: the drift is entirely missing links, never phantom
 * ones. Insertion-only also sidesteps a trap — re-deriving the *full* set from
 * stored columns would drop tag-derived links on ~45 rows, because `tags` was
 * only ever persisted inside the `raw` blob. Correcting that is why `tags` is
 * now a real column; until a row has been re-synced it has none, and deleting
 * based on that would lose links it legitimately has.
 */

export type RepairReport = {
  scanned: number;
  rowsChanged: number;
  linksAdded: number;
};

/**
 * Bounds how much a single request may write. Keeps one cold cache from
 * turning a cold dashboard load into a bulk update; whatever is left over gets
 * picked up by the next request that serves those rows.
 */
const MAX_ROWS_PER_REPAIR = 200;

/**
 * Takes ids rather than rows on purpose. The caller has just loaded the scan
 * window without descriptions — it does not need them, and pulling them for all
 * 500 rows would add megabytes to every dashboard load to repair the handful
 * that are actually stale. This loads the text only for those.
 */
export async function repairVocabulary(ids: string[]): Promise<RepairReport> {
  if (ids.length === 0) return { scanned: 0, rowsChanged: 0, linksAdded: 0 };

  // Newest first, so if the cap bites, the postings most likely to be served
  // again soon are the ones that got fixed.
  const batch = await prisma.opportunity.findMany({
    where: { id: { in: ids } },
    orderBy: { publishedAt: "desc" },
    take: MAX_ROWS_PER_REPAIR,
    select: { id: true, title: true, description: true, tags: true },
  });

  if (batch.length === 0) return { scanned: 0, rowsChanged: 0, linksAdded: 0 };

  const batchIds = batch.map((row) => row.id);
  const existing = await prisma.opportunitySkill.findMany({
    where: { opportunityId: { in: batchIds } },
    select: { opportunityId: true, skillSlug: true },
  });

  const have = new Map<string, Set<string>>();
  for (const link of existing) {
    let set = have.get(link.opportunityId);
    if (!set) have.set(link.opportunityId, (set = new Set()));
    set.add(link.skillSlug);
  }

  const additions: { opportunityId: string; skillSlug: string }[] = [];
  const touched: string[] = [];

  for (const row of batch) {
    const stored = have.get(row.id) ?? new Set<string>();
    const wanted = skillsForOpportunity({
      title: row.title,
      description: row.description,
      tags: row.tags,
    });

    const missing = wanted.filter((skill) => !stored.has(skill.slug));
    if (missing.length === 0) continue;

    // Only the definitions that are actually referenced need to exist, and
    // sync may never have seen these slugs.
    await prisma.skillDefinition.createMany({
      data: [...new Set(missing.map((skill) => skill.slug))].map((slug) => ({
        slug,
        label: wanted.find((skill) => skill.slug === slug)?.label ?? slug,
      })),
      skipDuplicates: true,
    });

    for (const skill of missing) {
      additions.push({ opportunityId: row.id, skillSlug: skill.slug });
    }
    touched.push(row.id);
  }

  // Stamping the version is what makes this self-limiting: once a row records
  // the current version it is never picked again. A failure here is harmless,
  // because the next pass recomputes an empty `missing` and stamps it then.
  await prisma.$transaction([
    ...(additions.length
      ? [
          // skipDuplicates keeps this safe when two requests repair the same row
          // at once: the second insert becomes a no-op instead of a unique
          // violation on (opportunityId, skillSlug).
          prisma.opportunitySkill.createMany({ data: additions, skipDuplicates: true }),
        ]
      : []),
    prisma.opportunity.updateMany({
      where: { id: { in: batchIds } },
      data: { vocabVersion: VOCABULARY_VERSION },
    }),
  ]);

  return { scanned: batch.length, rowsChanged: touched.length, linksAdded: additions.length };
}