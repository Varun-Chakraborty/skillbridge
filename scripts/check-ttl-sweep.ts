import "dotenv/config";
import { prisma } from "../lib/db";
import { sweepExpired } from "../lib/jobs/ttl";

async function main(): Promise<void> {
  // Force a few rows past their deadline, then confirm the sweeper removes them
  // and that their skill links cascade rather than being orphaned.
  const victims = await prisma.opportunity.findMany({
    where: { source: "remoteok" },
    take: 3,
    select: { id: true, title: true, _count: { select: { matches: true } } },
  });

  console.log(`arming ${victims.length} rows past their deadline:`);
  for (const v of victims) {
    console.log(`  ${v.title.slice(0, 50)} (${v._count.matches} skill links)`);
    await prisma.opportunity.update({
      where: { id: v.id },
      data: { ttlExpiresAt: new Date(Date.now() - 1000) },
    });
  }

  const before = await prisma.opportunity.count();
  const linksBefore = await prisma.opportunitySkill.count();

  const deleted = await sweepExpired();

  const after = await prisma.opportunity.count();
  const linksAfter = await prisma.opportunitySkill.count();

  console.log(`\nsweeper deleted ${deleted} rows`);
  console.log(`  opportunities ${before} -> ${after} (expected -${deleted})`);
  console.log(`  skill links   ${linksBefore} -> ${linksAfter}`);

  const ids = victims.map((v) => v.id);
  const survivors = await prisma.opportunity.count({ where: { id: { in: ids } } });
  const orphanLinks = await prisma.opportunitySkill.count({
    where: { opportunityId: { in: ids } },
  });

  console.log(`  victims still present: ${survivors} (expected 0)`);
  console.log(`  orphaned links left behind: ${orphanLinks} (expected 0)`);

  const ok = survivors === 0 && orphanLinks === 0 && after === before - deleted;
  console.log(ok ? "\nsweeper ok" : "\nSWEEPER FAILED");
  process.exitCode = ok ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
