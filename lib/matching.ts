import { after } from "next/server";

import { prisma } from "@/lib/db";
import { VOCABULARY_VERSION } from "@/lib/jobs/skills";
import { repairVocabulary } from "@/lib/jobs/vocab-repair";
import { NON_EMPLOYMENT_KINDS, type OpportunityKind } from "@/lib/jobs/normalize";

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
  /** Last moment to apply, register or submit. Null when the source publishes none. */
  expiresAt: Date | null;
  /** When the event starts, or a submission window opens. Null for jobs. */
  startsAt: Date | null;
  /** When the event finishes. Null for jobs. */
  endsAt: Date | null;
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  /** -1 early career, 0 neutral, 1 aimed at experienced people. See below. */
  seniority: number;
};

const SCAN_LIMIT = 500;

/**
 * Words that mark a posting as aimed at someone already established. They do
 * not change a posting's skill coverage, which is a fact about the skills; they
 * only affect ordering, because a graduating student is a poor fit for a role
 * that asks for five years of the thing they are still learning.
 */
const SENIOR_TERMS = [
  "senior",
  "staff",
  "principal",
  "lead",
  "head of",
  "director",
  "manager",
  "architect",
  "vp",
  "vice president",
  "chief",
  "iii",
];

/**
 * Postings explicitly open to people early in a career.
 *
 * Matched as patterns rather than loose substrings, and each one has to survive
 * the possibility of appearing in a senior title. "Associate Director" and
 * "Associate Principal" are senior roles, so the bare word "associate" is not
 * enough on its own; the same goes for "graduate", which shows up in titles like
 * "Internal Audit Lead" as a description of the qualification rather than of the
 * role.
 */
/**
 * Entry-level words strong enough to outrank a seniority word elsewhere in the
 * title. These name the level of the role itself, so "Senior Intern" is still an
 * internship and "Lead Graduate" is still a graduate programme.
 */
const UNAMBIGUOUS_ENTRY_PATTERNS = [
  /\bintern(ship)?\b/,
  /\bworking\s+student\b/,
  /\bapprentice(ship)?\b/,
  /\bplacement\b/,
  /\bstudent\b/,
];

const ENTRY_LEVEL_PATTERNS = [
  /\bintern(ship)?\b/,
  /\bnew\s+grad\b/,
  // Covers both "Graduate Quant Researcher" and "Graduate Software Engineer".
  /\bgrad(uate)?\b(?!\s+(scheme|programme|program)\b)/,
  /\bentry[\s-]?level\b/,
  /\bjunior\b/,
  // "Associate" only reads as entry level when the title carries no seniority
  // word of its own, so "Senior Associate" and "Associate Director" stay senior.
  /\bassociate\b(?![\s\w]{0,24}\b(senior|director|principal|partner|head|vp|chief|manager|lead)\b)/,
  /\btrainee\b/,
  /\bapprentice(ship)?\b/,
  /\bplacement\b/,
  /\bworking\s+student\b/,
  /\bstudent\b/,
];

/**
 * How senior a posting looks, from -1 (explicitly early career) to 1 (clearly
 * established). Deliberately coarse: it exists to stop a "Director of
 * Engineering" outranking an internship purely on skill overlap, not to make a
 * fine judgement about whether someone is ready.
 *
 * The title is the signal rather than the description because a description
 * routinely says "you will be working with senior engineers", which describes
 * the team rather than the bar.
 */
function senioritySignal(title: string, kind: string): number {
  const text = title.toLowerCase();

  // Internship and event kinds are early career by definition, whatever the
  // title says. "Senior Intern" exists, and the entry level is the fact that
  // matters to this audience.
  //
  // Events come from the shared NON_EMPLOYMENT_KINDS set rather than being named
  // out, for the same reason `isEntryLevel` uses it. Naming only INTERNSHIP and
  // WORKSHOP left HACKATHON exposed: "Lead Generation Hackathon" contains "lead"
  // and ranked as a role for experienced people, because nothing could tell that
  // the word meant marketing.
  if (kind === "INTERNSHIP" || NON_EMPLOYMENT_KINDS.has(kind as OpportunityKind)) return -1;

  // An unambiguous seniority word beats an entry-level word. "Senior Associate"
  // is a senior job that happens to contain the word "associate", and reading it
  // as entry level would surface it to students who are not its audience.
  const senior = SENIOR_TERMS.some((term) => text.includes(term));
  if (senior && !UNAMBIGUOUS_ENTRY_PATTERNS.some((pattern) => pattern.test(text))) return 1;

  if (ENTRY_LEVEL_PATTERNS.some((pattern) => pattern.test(text))) return -1;
  if (senior) return 1;
  return 0;
}

/**
 * Repairs postings whose skill links were derived by an older vocabulary,
 * after the response has already been sent.
 *
 * The scan window is the only place staleness costs anything, because rows
 * outside it are never scored. So the detection rides along with a query that
 * was happening anyway, and the write goes behind the response: the request that
 * first serves a stale row is scored against the links it already has, and the
 * repair lands for whoever arrives next. That also keeps the work proportional
 * to real usage instead of re-deriving the whole catalog on a timer.
 *
 * Each repair stamps the row with the current vocabulary version, which is what
 * makes it self-limiting — a row is touched once per vocabulary change, ever.
 */
function scheduleVocabularyRepair(ids: string[]): void {
  if (ids.length === 0) return;

  try {
    after(async () => {
      try {
        await repairVocabulary(ids);
      } catch (error) {
        console.error("skillbridge: vocabulary repair failed", error);
      }
    });
  } catch (error) {
    // `after` needs a request scope, and this module is also importable from
    // plain scripts. A repair that cannot be scheduled is not a failure worth
    // propagating: the links are unchanged and the next sync re-derives them.
    console.error("skillbridge: could not schedule vocabulary repair", error);
  }
}

export async function rankOpportunitiesForUser(
  userId: string,
  { limit = 50, kinds }: { limit?: number; kinds?: string[] } = {},
): Promise<ScoredOpportunity[]> {
  // `level` already encodes how much a skill is trusted: a skill the student
  // claimed by hand scores above one we inferred from resume prose, so an
  // explicit claim outranks a keyword that merely appeared in a sentence.
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
      expiresAt: true,
      startsAt: true,
      endsAt: true,
      matches: { select: { skillSlug: true } },
      // Cheap, and only used to decide whether the repair below has anything
      // to do. The description is deliberately *not* selected here: it would add
      // megabytes to every dashboard load, and the repair loads text for the
      // stale rows only.
      vocabVersion: true,
    },
  });

  scheduleVocabularyRepair(
    opportunities.filter((o) => o.vocabVersion !== VOCABULARY_VERSION).map((o) => o.id),
  );

  return opportunities
    .map((opportunity): ScoredOpportunity => {
      const required = opportunity.matches.map((m) => m.skillSlug);
      const matchedSkills = required.filter((slug) => levelBySlug.has(slug));
      const missingSkills = required.filter((slug) => !levelBySlug.has(slug));

      // The score stays a plain coverage number on purpose: the dashboard
      // labels it "skill coverage", so folding seniority or role fit into this
      // number would make the label lie. Those are separate, visible signals
      // used for ordering instead.
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
        expiresAt: opportunity.expiresAt,
        startsAt: opportunity.startsAt,
        endsAt: opportunity.endsAt,
        score,
        matchedSkills,
        missingSkills,
        seniority: senioritySignal(opportunity.title, opportunity.kind),
      };
    })
    .sort((a, b) => {
      if (a.score === null && b.score === null) return recency(a.publishedAt, b.publishedAt);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      // Seniority is compared before coverage. Two postings can have identical
      // coverage while one is aimed at a graduating student and the other asks
      // for a track record they do not have, and on this audience the second is
      // the less useful of the two. Coverage still breaks any remaining tie, so
      // this reorders rather than overrides.
      if (a.seniority !== b.seniority) return a.seniority - b.seniority;
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
