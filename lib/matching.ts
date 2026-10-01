import { prisma } from "@/lib/db";

export type ScoredOpportunity = {
  id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  applyUrl: string | null;
  kind: string;
  employmentType: string;
  remote: boolean;
  publishedAt: Date | null;
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
};

const SCAN_LIMIT = 500;

export async function rankOpportunitiesForUser(
  userId: string,
  { limit = 50, kinds }: { limit?: number; kinds?: string[] } = {},
): Promise<ScoredOpportunity[]> {
  const skills = await prisma.skill.findMany({
    where: { userId },
    select: { slug: true, level: true },
  });
  const levelBySlug = new Map(skills.map((s) => [s.slug, s.level]));

  const opportunities = await prisma.opportunity.findMany({
    where: kinds?.length ? { kind: { in: kinds as never } } : {},
    orderBy: { publishedAt: "desc" },
    take: SCAN_LIMIT,
    select: {
      id: true,
      source: true,
      title: true,
      company: true,
      location: true,
      applyUrl: true,
      kind: true,
      employmentType: true,
      remote: true,
      publishedAt: true,
      matches: { select: { skillSlug: true } },
    },
  });

  return opportunities
    .map((opportunity): ScoredOpportunity => {
      const required = opportunity.matches.map((m) => m.skillSlug);
      const matchedSkills = required.filter((slug) => levelBySlug.has(slug));
      const missingSkills = required.filter((slug) => !levelBySlug.has(slug));

      const score = required.length
        ? Math.round(
            (matchedSkills.reduce((sum, slug) => sum + (levelBySlug.get(slug) ?? 0), 0) /
              (required.length * 5)) *
              100,
          )
        : null;

      return {
        id: opportunity.id,
        source: opportunity.source,
        title: opportunity.title,
        company: opportunity.company,
        location: opportunity.location,
        applyUrl: opportunity.applyUrl,
        kind: opportunity.kind,
        employmentType: opportunity.employmentType,
        remote: opportunity.remote,
        publishedAt: opportunity.publishedAt,
        score,
        matchedSkills,
        missingSkills,
      };
    })
    .sort((a, b) => {
      if (a.score === null && b.score === null) return recency(a.publishedAt, b.publishedAt);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      if (a.score !== b.score) return b.score - a.score;
      return recency(a.publishedAt, b.publishedAt);
    })
    .slice(0, limit);
}

function recency(a: Date | null, b: Date | null): number {
  return (b?.getTime() ?? 0) - (a?.getTime() ?? 0);
}

export async function findComplementaryStudents(userId: string, limit = 10) {
  const others = await prisma.skill.groupBy({
    by: ["userId"],
    where: { userId: { not: userId } },
    _count: { slug: true },
    orderBy: { _count: { slug: "desc" } },
    take: 50,
  });

  const candidates = await prisma.user.findMany({
    where: { id: { in: others.map((o) => o.userId) } },
    select: {
      id: true,
      name: true,
      headline: true,
      school: true,
      skills: { select: { slug: true, level: true } },
    },
  });

  const mySlugs = new Set(
    (await prisma.skill.findMany({ where: { userId }, select: { slug: true } })).map(
      (s) => s.slug,
    ),
  );

  return candidates
    .map((user) => {
      const theirSlugs = user.skills.map((s) => s.slug);
      const overlap = theirSlugs.filter((slug) => mySlugs.has(slug)).length;
      const complement = theirSlugs.length - overlap;
      return {
        id: user.id,
        name: user.name,
        headline: user.headline,
        school: user.school,
        skills: theirSlugs,
        overlapCount: overlap,
        complementCount: complement,
        score: complement * 2 - overlap,
      };
    })
    .filter((candidate) => candidate.complementCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
