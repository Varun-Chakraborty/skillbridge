import { extractSkills } from "@/lib/jobs/skills";

/**
 * Validation and normalization for resume input.
 *
 * This is the single boundary every resume write goes through, whether it came
 * from the signup form or from a parser later on. Keeping it here means a parser
 * can be bolted on without having to reproduce the limits and the URL rules.
 */

export const RESUME_LIMITS = {
  headline: 120,
  location: 80,
  bio: 600,
  experience: 4000,
  education: 1500,
  projects: 2000,
  skillsText: 1000,
  rawText: 20000,
  school: 120,
  githubUrl: 200,
  linkedinUrl: 200,
  portfolioUrl: 200,
} as const;

export type ResumeInput = {
  headline: string;
  school: string;
  graduationYear: number | null;
  location: string;
  bio: string;
  experience: string;
  education: string;
  projects: string;
  skillsText: string;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  remoteOnly: boolean;
  hoursPerWeek: number | null;
};

/**
 * Only http(s) links are accepted. Resumes carry user-supplied URLs that get
 * rendered as anchors, so anything else (javascript:, data:) is a script
 * injection vector rather than a typo to be lenient about.
 */
const SAFE_URL = /^https?:\/\/[^\s]+$/i;

export type FieldErrors = Partial<Record<keyof ResumeInput, string>>;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Collapse the runs of whitespace that arrive from pasted resumes, so a
  // student pasting a block of text does not store a wall of blank lines.
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function url(value: unknown, max: number): { value: string; error?: string } {
  const raw = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (!raw) return { value: "" };
  if (!SAFE_URL.test(raw)) {
    return { value: "", error: "Must start with http:// or https://" };
  }
  return { value: raw };
}

function year(value: unknown): { value: number | null; error?: string } {
  if (value === "" || value === null || value === undefined) return { value: null };
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return { value: null, error: "Enter a year like 2027" };
  const next = new Date().getFullYear() + 8;
  if (parsed < 1950 || parsed > next) {
    return { value: null, error: `Enter a year between 1950 and ${next}` };
  }
  return { value: parsed };
}

function hours(value: unknown): { value: number | null; error?: string } {
  if (value === "" || value === null || value === undefined) return { value: null };
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 80) {
    return { value: null, error: "Enter hours between 1 and 80" };
  }
  return { value: parsed };
}

export function parseResumeInput(
  body: Record<string, unknown>,
): { ok: true; value: ResumeInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const github = url(body.githubUrl, RESUME_LIMITS.githubUrl);
  const linkedin = url(body.linkedinUrl, RESUME_LIMITS.linkedinUrl);
  const portfolio = url(body.portfolioUrl, RESUME_LIMITS.portfolioUrl);
  const gradYear = year(body.graduationYear);
  const perWeek = hours(body.hoursPerWeek);

  if (github.error) errors.githubUrl = github.error;
  if (linkedin.error) errors.linkedinUrl = linkedin.error;
  if (portfolio.error) errors.portfolioUrl = portfolio.error;
  if (gradYear.error) errors.graduationYear = gradYear.error;
  if (perWeek.error) errors.hoursPerWeek = perWeek.error;

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      headline: text(body.headline, RESUME_LIMITS.headline),
      school: text(body.school, RESUME_LIMITS.school),
      graduationYear: gradYear.value,
      location: text(body.location, RESUME_LIMITS.location),
      bio: text(body.bio, RESUME_LIMITS.bio),
      experience: text(body.experience, RESUME_LIMITS.experience),
      education: text(body.education, RESUME_LIMITS.education),
      projects: text(body.projects, RESUME_LIMITS.projects),
      skillsText: text(body.skillsText, RESUME_LIMITS.skillsText),
      githubUrl: github.value,
      linkedinUrl: linkedin.value,
      portfolioUrl: portfolio.value,
      remoteOnly: body.remoteOnly === true || body.remoteOnly === "true",
      hoursPerWeek: perWeek.value,
    },
  };
}

/**
 * Reads skills out of free-form resume prose using the same curated vocabulary
 * that tags job postings.
 *
 * Reusing that vocabulary is what makes the two sides comparable: a slug here
 * means exactly the same thing as the same slug on an OpportunitySkill row, so
 * matching needs no translation layer. A student who writes "built a React and
 * Postgres dashboard" gets credited with skills they never bothered to tag.
 *
 * `skillsText` is a comma-separated list the student wrote deliberately, so each
 * entry is also slugified and kept even when the vocabulary does not know it.
 * That way a niche tool the student names survives into matching instead of
 * being silently dropped.
 */
export function extractResumeSkills(input: ResumeInput): {
  known: string[];
  custom: string[];
} {
  const prose = [input.headline, input.bio, input.experience, input.education, input.projects]
    .filter(Boolean)
    .join("\n");

  const known = extractSkills(prose).map((skill) => skill.slug);

  const knownSet = new Set(known);
  const custom: string[] = [];
  for (const part of input.skillsText.split(/[,;\n]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // A bare list entry like "React, TypeScript" slugifies to something the
    // vocabulary may already have matched from prose; skip the duplicate.
    const slug = trimmed
      .toLowerCase()
      .replace(/\.(js|ts|py)$/i, "")
      .replace(/[^a-z0-9+#]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug.length < 2 || slug.length > 40 || knownSet.has(slug)) continue;
    knownSet.add(slug);
    custom.push(slug);
  }

  return { known, custom };
}

/**
 * How much matchable evidence a resume carries. Used only to nudge the student
 * toward filling things in, never to rank them or to gate access.
 */
export function resumeCompleteness(input: ResumeInput): {
  filled: number;
  total: number;
  percent: number;
} {
  const checks: [keyof ResumeInput, (value: ResumeInput[keyof ResumeInput]) => boolean][] = [
    ["headline", (v) => Boolean(v)],
    ["school", (v) => Boolean(v)],
    ["graduationYear", (v) => v !== null],
    ["location", (v) => Boolean(v)],
    ["bio", (v) => Boolean(v)],
    ["experience", (v) => Boolean(v)],
    ["projects", (v) => Boolean(v)],
    ["skillsText", (v) => Boolean(v)],
    ["githubUrl", (v) => Boolean(v)],
    ["linkedinUrl", (v) => Boolean(v)],
    ["portfolioUrl", (v) => Boolean(v)],
  ];
  const filled = checks.filter(([key, ok]) => ok(input[key])).length;
  return { filled, total: checks.length, percent: Math.round((filled / checks.length) * 100) };
}
