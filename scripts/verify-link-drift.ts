import "dotenv/config";

import { prisma } from "@/lib/db";
import { VOCABULARY_VERSION } from "@/lib/jobs/skills";
import { repairVocabulary } from "@/lib/jobs/vocab-repair";
import { syncSource } from "../lib/jobs/sync";
import type { NormalizedJob } from "../lib/jobs/normalize";

/**
 * Two related guarantees about how skill links stay honest.
 *
 * 1. Replacing a posting's links must delete the old set even when the new set
 *    is empty. The bug this exists for: the delete used to sit inside
 *    `if (skills.length)`, so a posting edited to stop mentioning any recognised
 *    skill kept the links it had before and went on matching on skills its
 *    description no longer contained.
 *
 * 2. A posting whose links came from an older vocabulary must gain the skills
 *    the current one finds, without ever losing ones it already has. Sync only
 *    re-derives postings still in a feed, so anything that aged out goes stale
 *    until something looks at it; matching does that lazily, on read.
 *
 * Writes only to the `test:link-drift` source and deletes it on the way out.
 */

const SOURCE = "test:link-drift";
const EXTERNAL_ID = "drift-1";

function job(description: string | null, tags: string[] = []): NormalizedJob {
  return {
    source: SOURCE,
    externalId: EXTERNAL_ID,
    kind: "JOB",
    title: "Backend Engineer",
    company: "Drift Co",
    location: null,
    remote: true,
    employmentType: "FULL_TIME",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    description,
    applyUrl: "https://example.com/apply",
    logoUrl: null,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    tags,
  };
}

async function currentLinks(): Promise<string[]> {
  const row = await prisma.opportunity.findUnique({
    where: { source_externalId: { source: SOURCE, externalId: EXTERNAL_ID } },
    select: { matches: { select: { skillSlug: true } } },
  });
  return (row?.matches ?? []).map((m) => m.skillSlug).sort();
}

async function main() {
  let failures = 0;

  async function check(label: string, expected: string[]) {
    const actual = await currentLinks();
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures += 1;
    const mark = ok ? "PASS" : "FAIL";
    process.stdout.write(
      `${mark}  ${label}\n      expected ${JSON.stringify(expected)}  got ${JSON.stringify(actual)}\n`,
    );
  }

  /** Same shape as `check`, for assertions that are not about the link set. */
  async function expect(label: string, ok: boolean, expected: string, actual: string) {
    if (!ok) failures += 1;
    process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${label}\n      expected ${expected}  got ${actual}\n`);
  }

  // `go` requires context (golang / go engineer) so it does not fire on the
  // English word, which shapes the text used below.
  await syncSource(SOURCE, async () => [
    job("We use PostgreSQL and TypeScript on the backend team."),
  ]);
  await check("initial sync links", ["postgresql", "typescript"]);

  await syncSource(SOURCE, async () => [job("Great team, fast pace, lots of autonomy.")]);
  await check("description edited to drop all skills", []);

  await syncSource(SOURCE, async () => [job("React frontend, golang backend services.")]);
  await check("skills reintroduced", ["go", "react"]);

  // The text has to genuinely stop naming the dropped skill, otherwise `go`
  // legitimately still matches and the case proves nothing.
  await syncSource(SOURCE, async () => [
    job("React only now; the backend services were archived."),
  ]);
  await check("partial shrink drops the stale member", ["react"]);

  await syncSource(SOURCE, async () => [job(null)]);
  await check("null description clears links", []);

  process.stdout.write("\nvocabulary repair:\n");

  // Rows for the repair cases, read back with exactly the fields matching
  // hands to it.
  const repairable = async () => {
    const row = await prisma.opportunity.findUnique({
      where: { source_externalId: { source: SOURCE, externalId: EXTERNAL_ID } },
      select: { id: true, title: true, description: true, tags: true, vocabVersion: true },
    });
    if (!row) throw new Error("test opportunity missing");
    return row;
  };

  const synced = await repairable();
  await expect(
    "sync stamps the current vocabulary version",
    synced.vocabVersion === VOCABULARY_VERSION,
    String(VOCABULARY_VERSION),
    String(synced.vocabVersion),
  );

  // Pretend an older vocabulary derived this row's links: rewind the version
  // and remove links the current vocabulary can see.
  await prisma.opportunitySkill.deleteMany({
    where: { opportunityId: synced.id, skillSlug: "rust" },
  });
  await prisma.opportunity.update({
    where: { id: synced.id },
    data: { vocabVersion: 0 },
  });
  await syncSource(SOURCE, async () => [
    job("Rust and TypeScript, with some Kubernetes on the platform side."),
  ]);
  await prisma.opportunity.update({
    where: { id: synced.id },
    data: { vocabVersion: 0 },
  });
  await prisma.opportunitySkill.deleteMany({
    where: { opportunityId: synced.id, skillSlug: "rust" },
  });

  const first = await repairVocabulary([synced.id]);
  await expect("repair adds links an older vocabulary missed", first.linksAdded > 0, ">0", String(first.linksAdded));
  await check("repaired links", ["kubernetes", "rust", "typescript"]);

  const second = await repairVocabulary([synced.id]);
  await expect("repair is idempotent", second.linksAdded === 0, "0", String(second.linksAdded));
  await expect("repair stamped the version", (await repairable()).vocabVersion === VOCABULARY_VERSION, String(VOCABULARY_VERSION), String((await repairable()).vocabVersion));

  // Insertion-only: a link the repair cannot justify must survive it.
  await prisma.opportunitySkill.create({
    data: { opportunityId: synced.id, skillSlug: "c++" },
  });
  await prisma.opportunity.update({ where: { id: synced.id }, data: { vocabVersion: 0 } });
  await repairVocabulary([synced.id]);
  await check("repair never deletes an existing link", ["c++", "kubernetes", "rust", "typescript"]);

  // Tags are a real column now, so a repair can recover a tag-derived link
  // instead of silently dropping it.
  await syncSource(SOURCE, async () => [job("No skills named in the body at all.", ["Figma"])]);
  const tagged = await repairable();
  await expect("tags are persisted on the row", JSON.stringify(tagged.tags) === JSON.stringify(["Figma"]), '["Figma"]', JSON.stringify(tagged.tags));
  await check("tag-derived link created by sync", ["figma"]);

  await prisma.opportunitySkill.deleteMany({ where: { opportunityId: tagged.id } });
  await prisma.opportunity.update({ where: { id: tagged.id }, data: { vocabVersion: 0 } });
  await repairVocabulary([tagged.id]);
  await check("repair recovers a link from the persisted tags", ["figma"]);

  // Two requests repairing the same row at once must not collide on the
  // (opportunityId, skillSlug) key.
  await prisma.opportunitySkill.deleteMany({ where: { opportunityId: tagged.id } });
  await prisma.opportunity.update({ where: { id: tagged.id }, data: { vocabVersion: 0 } });
  let raced = false;
  try {
    await Promise.all([
      repairVocabulary([tagged.id]),
      repairVocabulary([tagged.id]),
      repairVocabulary([tagged.id]),
    ]);
  } catch {
    raced = true;
  }
  await expect("concurrent repairs do not collide", !raced, "no throw", raced ? "threw" : "clean");
  await check("concurrent repairs converge on the right links", ["figma"]);

  // An id that no longer exists must be a no-op rather than an error, since the
  // caller hands over ids from a query that may already be out of date.
  const ghost = await repairVocabulary(["does-not-exist"]);
  await expect("unknown id is a no-op", ghost.scanned === 0 && ghost.linksAdded === 0, "0/0", `${ghost.scanned}/${ghost.linksAdded}`);

  process.stdout.write(failures === 0 ? "\nall cases pass\n" : `\n${failures} case(s) failed\n`);
  return failures;
}

main()
  .then((failures) => {
    if (failures) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.opportunity.deleteMany({ where: { source: SOURCE } });
    const leftovers = await prisma.opportunity.count({ where: { source: SOURCE } });
    process.stdout.write(`cleanup: ${leftovers} test opportunity rows remain\n`);
    await prisma.$disconnect();
  });