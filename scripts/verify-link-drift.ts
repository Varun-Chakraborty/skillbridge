import "dotenv/config";

import { prisma } from "@/lib/db";
import { syncSource } from "../lib/jobs/sync";
import type { NormalizedJob } from "../lib/jobs/normalize";

/**
 * Guards a subtle data-correctness bug: replacing a posting's skill links must
 * delete the old set even when the new set is empty.
 *
 * The bug this exists for: the delete used to sit inside `if (skills.length)`,
 * so a posting edited to stop mentioning any recognised skill kept the links it
 * had before and went on matching on skills its description no longer
 * contained. The create is still conditional, because there is no point issuing
 * an empty insert.
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