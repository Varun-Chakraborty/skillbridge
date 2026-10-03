import "dotenv/config";
import { prisma } from "../lib/db";
import { repairMojibake } from "../lib/jobs/encoding";

/**
 * Repair mojibake already stored in the table.
 *
 * Sync repairs on the way in, so every row still present in a source's feed is
 * fixed within six hours on its own. This exists for the rows that are *not*:
 * a posting that closed between two syncs keeps its original text until its TTL
 * expires, which is up to 60 days for RemoteOK. Without this, the `--audit` gate
 * stays red for weeks on rows that no longer have a source to fix them.
 *
 * Idempotent, and safe to run against production. It only writes rows it
 * actually changes, and `repairMojibake` is a fixed point, so a second run
 * reports zero and touches nothing.
 */
async function main(): Promise<void> {
  const rows = await prisma.opportunity.findMany({
    select: {
      id: true,
      source: true,
      title: true,
      company: true,
      location: true,
      description: true,
      tags: true,
    },
  });

  const bySource = new Map<string, number>();
  let changedRows = 0;
  let changedFields = 0;
  const examples: string[] = [];

  for (const row of rows) {
    const title = repairMojibake(row.title);
    const company = row.company === null ? null : repairMojibake(row.company);
    const location = row.location === null ? null : repairMojibake(row.location);
    const description = row.description === null ? null : repairMojibake(row.description);
    const tags = row.tags.map(repairMojibake);

    const touched =
      title !== row.title ||
      company !== row.company ||
      location !== row.location ||
      description !== row.description ||
      tags.some((tag, i) => tag !== row.tags[i]);

    if (!touched) continue;

    changedRows++;
    changedFields +=
      Number(title !== row.title) +
      Number(company !== row.company) +
      Number(location !== row.location) +
      Number(description !== row.description) +
      tags.filter((tag, i) => tag !== row.tags[i]).length;

    bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    if (examples.length < 4) {
      const field = (["title", "company", "location", "description"] as const).find((name) => {
        const before = row[name];
        const after = name === "title" ? title : name === "company" ? company : name === "location" ? location : description;
        return before !== null && after !== null && before !== after;
      });
      const before = field ? row[field] : row.title;
      const after = field === "company" ? company : field === "location" ? location : field === "description" ? description : title;
      examples.push(`  ${row.source} ${field ?? "title"}: ${JSON.stringify(before!.slice(0, 48))} -> ${JSON.stringify((after ?? "").slice(0, 48))}`);
    }

    await prisma.opportunity.update({
      where: { id: row.id },
      data: { title, company, location, description, tags },
    });
  }

  console.log(
    changedRows === 0
      ? `nothing to repair: all ${rows.length} rows are already correctly encoded`
      : `repaired ${changedFields} field(s) across ${changedRows} of ${rows.length} rows`,
  );
  for (const [source, n] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`  ${source}: ${n}`);
  for (const example of examples) console.log(example);

  await prisma.$disconnect();
}

void main();