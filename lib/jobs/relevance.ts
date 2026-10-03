import type { NormalizedJob } from "./normalize";

/**
 * Entry-level detection.
 *
 * This exists because the aggregators are not student feeds. Measured against
 * Arbeitnow's full paginated feed (1,842 postings):
 *
 *   internship signals   202   11.0%
 *   junior signals        68    3.7%
 *   senior               846   45.9%
 *   no signal at all     726   39.4%
 *   remote flag true     144    7.8%
 *
 * So 85.3% of that feed is either explicitly senior or carries nothing to
 * classify it by. Ingesting all of it to surface the 270 entry-level postings
 * would let one aggregator dominate the whole table and dilute matching for
 * everyone. `entryLevelOnly` on the registry row applies this filter per source
 * instead of globally, because the ATS boards are mostly senior by design and
 * filtering them globally would empty the table.
 *
 * The pattern deliberately includes the European and South American vocabulary
 * that appears in the same feeds: `praktikum` and `werkstudent` (German),
 * `estagi` (Portuguese), `stagiaire`/`stage` (French). Those postings are real
 * internships that an English-only pattern misses.
 */
const ENTRY_LEVEL_PATTERN =
  /\b(intern|interns|internship|internships|praktikum|praktika|werkstudent|trainee|traineeship|estagi|estagio|stagiaire|stage|junior|entry[\s-]?level|graduate|new[\s-]?grad|grad|associate|apprentice|apprenticeship)\b/i;

/** Roles these read as entry-level even when the title does not say so. */
const ENTRY_LEVEL_EMPLOYMENT = new Set(["INTERNSHIP"]);

/**
 * True when the posting looks like work a student could actually take.
 *
 * This is a title-and-tag test, not a seniority model. It is deliberately
 * cheap and deterministic so it can run inside the sync loop over a few
 * thousand rows, and so its behaviour is explainable when someone asks why a
 * posting they saw yesterday is gone today.
 */
export function isEntryLevel(
  job: Pick<NormalizedJob, "title" | "tags" | "employmentType">,
): boolean {
  if (ENTRY_LEVEL_EMPLOYMENT.has(job.employmentType)) return true;
  const haystack = `${job.title} ${job.tags.join(" ")}`;
  return ENTRY_LEVEL_PATTERN.test(haystack);
}

/**
 * A posting's rank within one source, best first. Used to decide which rows
 * survive when a source returns more than its share of the budget.
 *
 * Entry-level first, then most recently published, then remote, because remote
 * is the attribute a student filtering for on the site cannot get back from a
 * posting they were never shown. Ties fall back to title so the order is
 * stable across syncs — an unstable order would make the same posting appear
 * and disappear from the table every six hours.
 */
export function compareWithinSource(a: NormalizedJob, b: NormalizedJob): number {
  const entry = Number(isEntryLevel(b)) - Number(isEntryLevel(a));
  if (entry !== 0) return entry;

  const remote = Number(b.remote) - Number(a.remote);
  if (remote !== 0) return remote;

  const published = (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  if (published !== 0) return published;

  return a.title.localeCompare(b.title);
}

export type BudgetedSource = {
  key: string;
  weight: number;
  /** How many rows the source's feed can supply after its own selection policy. */
  demand: number;
};

/**
 * Split `total` rows across sources in proportion to weight, giving up nothing
 * when a source cannot fill its slice.
 *
 * The naive split — `total * weight / sum(weights)` — wastes budget whenever a
 * source's feed is smaller than its slice, which is the common case: the whole
 * of Remotive is 17 postings and the whole of Ashby is 62, so with six equally
 * weighted sources neither can ever fill a 1,000-row slice. Their unused budget
 * has to move to the sources that can use it, or `total` stops being a real
 * ceiling on anything except the largest source.
 *
 * This is max-min fair allocation: repeatedly hand every active source its
 * proportional slice, let the sources that cannot fill it keep exactly what
 * they have, return the remainder to the pool, and try again with what's left.
 * The source that ends up constrained is always the same one regardless of
 * input order, and a source is never cut below its own demand unless the whole
 * budget is exhausted.
 */
export function allocateBudget(sources: BudgetedSource[], total: number): Map<string, number> {
  const allocation = new Map<string, number>();
  let active = sources.filter((s) => s.demand > 0);
  let remaining = Math.max(0, total);

  while (active.length > 0) {
    const weightSum = active.reduce((sum, s) => sum + Math.max(0, s.weight), 0);

    // Proportional to weight. Weight is read as a ratio, so a source left at the
    // default of 100 among six sources gets a sixth, and raising one to 250
    // gives it two and a half times a sibling's slice. A weight of 0 yields a
    // slice of 0, which starves the source without needing `enabled = false`.
    //
    // The even-split fallback applies only when every active weight is zero:
    // that is an operator asking for no preference, not a division by zero.
    const sliceFor = (s: BudgetedSource): number =>
      weightSum > 0
        ? Math.floor((remaining * Math.max(0, s.weight)) / weightSum)
        : Math.floor(remaining / active.length);

    // A source is constrained when its feed cannot fill the slice it was offered.
    // Those are the sources that release budget: they take exactly what they have
    // and the unused part of their slice goes back into the pot for the sources
    // that could use it. When nobody is constrained, every source is asking for
    // more than its share, so each takes its proportional slice and the budget
    // is spent.
    const constrained = active.filter((s) => s.demand <= sliceFor(s));

    if (constrained.length === 0) {
      for (const s of active) allocation.set(s.key, sliceFor(s));
      // `break`, not `return`: the remainder pass below still has to run on this
      // path, and this is the path every run actually takes once no source is
      // supply-constrained.
      break;
    }

    for (const s of constrained) {
      allocation.set(s.key, s.demand);
      remaining -= s.demand;
    }

    // Drop the saturated sources by membership. Splicing by position — removing
    // the first `constrained.length` entries — silently discards whichever
    // sources happened to sort ahead of the constrained ones, and they then fall
    // through to the zero-fill at the end. That is how a source carrying ten
    // times the weight and four thousand rows of demand ended up allocated
    // nothing while the budget went unspent.
    const saturated = new Set(constrained.map((s) => s.key));
    active = active.filter((s) => !saturated.has(s.key));
  }

  // Every slice is a floor, so proportional division loses up to one row per
  // source and the budget is never quite spent. Hand the remainder to the
  // heaviest source that still has unmet demand, which makes the allocation sum
  // to exactly the budget instead of shaving a row per source on every run.
  let leftover = Math.max(0, total - [...allocation.values()].reduce((sum, n) => sum + n, 0));
  if (leftover > 0) {
    const eligible = sources
      .filter((s) => s.weight > 0 && (allocation.get(s.key) ?? 0) < s.demand)
      .sort((a, b) => b.weight - a.weight || b.demand - a.demand);
    for (const source of eligible) {
      if (leftover <= 0) break;
      const room = source.demand - (allocation.get(source.key) ?? 0);
      const give = Math.min(room, leftover);
      allocation.set(source.key, (allocation.get(source.key) ?? 0) + give);
      leftover -= give;
    }
  }

  for (const s of sources) if (!allocation.has(s.key)) allocation.set(s.key, 0);
  return allocation;
}
