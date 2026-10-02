import { prisma } from "@/lib/db";
import { slugifySkill } from "@/lib/jobs/normalize";

/**
 * Skills a student claims by hand, either in the resume form or the skills
 * editor. Derived skills carry slightly less weight in match scoring, so a claim
 * the student actually made outranks a keyword we inferred from prose.
 */
export const MANUAL_LEVEL = 4;
export const DERIVED_LEVEL = 3;

const MAX_LEVEL = 5;

export type SkillWrite = {
  /**
   * Slugs the student claims. Omit the key to leave claimed skills untouched;
   * pass an empty array to clear them. That distinction matters, since clearing
   * every claimed skill and not mentioning them at all are different intents.
   */
  manual?: string[];
  /** Slugs read out of resume text. Same omit-versus-empty rule applies. */
  derived?: string[];
};

function clean(slugs: string[] | undefined): string[] {
  if (!slugs?.length) return [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = slugifySkill(raw);
    // Two-character floor drops empty tokens and stray punctuation slugs such as
    // "-" or "&"; the ceiling keeps a pasted sentence out of the catalog.
    if (slug.length >= 2 && slug.length <= 40) seen.add(slug);
  }
  return [...seen];
}

/**
 * Reconciles a user's skills with the requested set for a given origin.
 *
 * Only rows of the passed origin are considered for deletion, so re-running
 * resume extraction replaces the skills it inferred last time without touching
 * anything the student picked themselves. A slug claimed manually is never
 * demoted back to derived, and a student claiming a skill that was previously
 * only inferred promotes that row to manual.
 */
export async function setUserSkills(userId: string, write: SkillWrite) {
  const manualSlugs = clean(write.manual);
  const derivedSlugs = clean(write.derived).filter((slug) => !manualSlugs.includes(slug));

  const wanted = [
    ...manualSlugs.map((slug) => ({ slug, origin: "MANUAL" as const, level: MANUAL_LEVEL })),
    ...derivedSlugs.map((slug) => ({ slug, origin: "DERIVED" as const, level: DERIVED_LEVEL })),
  ];

  const bySlug = new Map(wanted.map((entry) => [entry.slug, entry]));

  // Catalog rows are resolved first: a user skill carries a foreign key to one,
  // so the definition has to exist before the skill rows can reference its id.
  const definitionIds = new Map<string, string>();
  for (const { slug } of wanted) {
    const definition = await prisma.skillDefinition.upsert({
      where: { slug },
      create: { slug, label: slug.replace(/-/g, " ") },
      update: {},
      select: { id: true },
    });
    definitionIds.set(slug, definition.id);
  }

  // Clear out rows belonging to an origin we are rewriting, unless the slug is
  // still wanted. Only origins present in this write are touched, so a resume
  // re-parse never deletes skills the student picked by hand, and clearing the
  // skills editor never resurrects stale inferred rows.
  //
  // A slug the student claims manually is therefore never demoted: it is wanted,
  // so it survives, and it is promoted to MANUAL below.
  for (const origin of ["MANUAL", "DERIVED"] as const) {
    if (write[origin.toLowerCase() as "manual" | "derived"] === undefined) continue;
    await prisma.skill.deleteMany({
      where: { userId, origin, slug: { notIn: [...bySlug.keys()] } },
    });
  }

  const existing = await prisma.skill.findMany({
    where: { userId, slug: { in: [...bySlug.keys()] } },
    select: { slug: true, origin: true },
  });
  const existingBySlug = new Map(existing.map((row) => [row.slug, row.origin]));

  await prisma.$transaction(
    wanted.map((entry) => {
      const current = existingBySlug.get(entry.slug);
      // Keep a manual row manual even if it also matched the derived pass, and
      // never demote a claim to inferred.
      const origin = current === "MANUAL" ? "MANUAL" : entry.origin;
      const level = Math.min(origin === "MANUAL" ? MANUAL_LEVEL : DERIVED_LEVEL, MAX_LEVEL);

      return prisma.skill.upsert({
        where: { userId_slug: { userId, slug: entry.slug } },
        create: {
          userId,
          slug: entry.slug,
          name: entry.slug.replace(/-/g, " "),
          origin,
          level,
          definitionId: definitionIds.get(entry.slug)!,
        },
        update: { origin, level },
      });
    }),
  );
}
