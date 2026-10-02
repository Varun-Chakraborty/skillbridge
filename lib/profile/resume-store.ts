import { prisma } from "@/lib/db";
import { extractResumeSkills, type ResumeInput } from "@/lib/resume";
import { setUserSkills } from "@/lib/user-skills";

/**
 * Writes a resume and re-derives the user's skills from it.
 *
 * The form and a future ATS parser both land here, so a parsed resume is
 * indistinguishable from a typed one once stored, and neither path can skip
 * skill extraction. That is deliberate: the resume is the source of truth for
 * matching, and letting the two paths diverge is how profiles end up with
 * skills that no longer match what the resume says.
 */
export async function saveResume(
  userId: string,
  input: ResumeInput,
  { source = "MANUAL" as "MANUAL" | "PARSED" } = {},
): Promise<{ known: number; custom: number }> {
  // Skill extraction runs first so the two writes below are independent and a
  // failure in either leaves the other consistent.
  const { known, custom } = extractResumeSkills(input);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        // Headline and school live on User because team matching reads them
        // there; everything else is resume detail.
        headline: input.headline || null,
        school: input.school || null,
        graduationYear: input.graduationYear,
      },
    }),
    prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        bio: input.bio || null,
        location: input.location || null,
        remoteOnly: input.remoteOnly,
        hoursPerWeek: input.hoursPerWeek,
        experience: input.experience || null,
        education: input.education || null,
        projects: input.projects || null,
        skillsText: input.skillsText || null,
        githubUrl: input.githubUrl || null,
        linkedinUrl: input.linkedinUrl || null,
        portfolioUrl: input.portfolioUrl || null,
        source,
        // Only stamp the parse time when a parser produced this, so a hand-typed
        // edit does not claim to have been parsed.
        parsedAt: source === "PARSED" ? new Date() : null,
      },
      update: {
        bio: input.bio || null,
        location: input.location || null,
        remoteOnly: input.remoteOnly,
        hoursPerWeek: input.hoursPerWeek,
        experience: input.experience || null,
        education: input.education || null,
        projects: input.projects || null,
        skillsText: input.skillsText || null,
        githubUrl: input.githubUrl || null,
        linkedinUrl: input.linkedinUrl || null,
        portfolioUrl: input.portfolioUrl || null,
        source,
        parsedAt: source === "PARSED" ? new Date() : null,
      },
    }),
  ]);

  // Only the derived set is rewritten here. Skills the student picked in the
  // editor stay untouched, since the resume is not authoritative about choices
  // the student made deliberately elsewhere.
  await setUserSkills(userId, { derived: [...known, ...custom] });

  return { known: known.length, custom: custom.length };
}

export type StoredResume = {
  headline: string;
  school: string;
  graduationYear: number | null;
  bio: string;
  location: string;
  remoteOnly: boolean;
  hoursPerWeek: number | null;
  experience: string;
  education: string;
  projects: string;
  skillsText: string;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  source: "MANUAL" | "PARSED";
  parsedAt: Date | null;
  /** True once the student has saved anything, so onboarding can be skipped. */
  saved: boolean;
};

const EMPTY: StoredResume = {
  headline: "",
  school: "",
  graduationYear: null,
  bio: "",
  location: "",
  remoteOnly: false,
  hoursPerWeek: null,
  experience: "",
  education: "",
  projects: "",
  skillsText: "",
  githubUrl: "",
  linkedinUrl: "",
  portfolioUrl: "",
  source: "MANUAL",
  parsedAt: null,
  saved: false,
};

/**
 * Reads a resume for display, flattening the User-owned and Profile-owned
 * columns back into one shape. A user with no profile row yet is not an error:
 * that is a student who has not finished onboarding.
 */
export async function getResume(userId: string): Promise<StoredResume> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      headline: true,
      school: true,
      graduationYear: true,
      profile: {
        select: {
          bio: true,
          location: true,
          remoteOnly: true,
          hoursPerWeek: true,
          experience: true,
          education: true,
          projects: true,
          skillsText: true,
          githubUrl: true,
          linkedinUrl: true,
          portfolioUrl: true,
          source: true,
          parsedAt: true,
        },
      },
    },
  });

  if (!user) return EMPTY;
  const profile = user.profile;
  if (!profile) {
    return {
      ...EMPTY,
      headline: user.headline ?? "",
      school: user.school ?? "",
      graduationYear: user.graduationYear,
      saved: Boolean(user.headline || user.school || user.graduationYear),
    };
  }

  return {
    headline: user.headline ?? "",
    school: user.school ?? "",
    graduationYear: user.graduationYear,
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    remoteOnly: profile.remoteOnly,
    hoursPerWeek: profile.hoursPerWeek,
    experience: profile.experience ?? "",
    education: profile.education ?? "",
    projects: profile.projects ?? "",
    skillsText: profile.skillsText ?? "",
    githubUrl: profile.githubUrl ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    portfolioUrl: profile.portfolioUrl ?? "",
    source: profile.source,
    parsedAt: profile.parsedAt,
    saved: true,
  };
}
