import { prisma } from "@/lib/db";
import {
  fetchArbeitnow,
  fetchAshby,
  fetchGreenhouse,
  fetchLever,
  fetchRemoteok,
  fetchRemotive,
} from "./sources";
import { SourceError, type NormalizedJob } from "./normalize";
import { skillsForOpportunity } from "./skills";

type Fetcher = () => Promise<NormalizedJob[]>;

function atsSourcesFromEnv(): Record<string, Fetcher> {
  const sources: Record<string, Fetcher> = {};

  for (const entry of (process.env.ATS_SOURCES ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;
    const ats = trimmed.slice(0, separator).trim().toLowerCase();
    const token = trimmed.slice(separator + 1).trim();
    if (!token) continue;

    if (ats === "greenhouse") sources[trimmed] = () => fetchGreenhouse(token);
    else if (ats === "lever") sources[trimmed] = () => fetchLever(token);
    else if (ats === "ashby") sources[trimmed] = () => fetchAshby(token);
  }

  return sources;
}

export function registeredSources(): Record<string, Fetcher> {
  return {
    arbeitnow: fetchArbeitnow,
    remotive: fetchRemotive,
    remoteok: fetchRemoteok,
    ...atsSourcesFromEnv(),
  };
}

export type SyncReport = {
  source: string;
  ok: boolean;
  fetched: number;
  written: number;
  error?: string;
};

export async function syncSource(name: string, fetcher: Fetcher): Promise<SyncReport> {
  let jobs: NormalizedJob[];
  try {
    jobs = await fetcher();
  } catch (error) {
    const message =
      error instanceof SourceError ? error.message : error instanceof Error ? error.message : "unknown error";
    return { source: name, ok: false, fetched: 0, written: 0, error: message };
  }

  const extracted = jobs.map((job) => skillsForOpportunity(job));
  const labelBySlug = new Map<string, string>();
  for (const skills of extracted) {
    for (const skill of skills) labelBySlug.set(skill.slug, skill.label);
  }
  if (labelBySlug.size) {
    await prisma.skillDefinition.createMany({
      data: [...labelBySlug].map(([slug, label]) => ({ slug, label })),
      skipDuplicates: true,
    });
  }

  let written = 0;
  for (const [index, job] of jobs.entries()) {
    const skills = extracted[index]!;
    const opportunity = await prisma.opportunity.upsert({
      where: { source_externalId: { source: job.source, externalId: job.externalId } },
      create: {
        source: job.source,
        externalId: job.externalId,
        kind: job.kind,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        description: job.description,
        applyUrl: job.applyUrl,
        logoUrl: job.logoUrl,
        publishedAt: job.publishedAt,
        expiresAt: job.expiresAt,
        raw: job.raw ? (job.raw as object) : undefined,
        fetchedAt: new Date(),
      },
      update: {
        kind: job.kind,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        description: job.description,
        applyUrl: job.applyUrl,
        logoUrl: job.logoUrl,
        publishedAt: job.publishedAt,
        expiresAt: job.expiresAt,
        raw: job.raw ? (job.raw as object) : undefined,
        fetchedAt: new Date(),
      },
      select: { id: true },
    });

    // Replacing the links is unconditional in the delete direction. A posting
    // that stops mentioning a skill has to stop matching on it, and guarding
    // this on `skills.length` skipped the delete whenever the new set came back
    // empty — which left the previous links in place, so a re-fetched posting
    // could keep scoring on skills its description no longer contained.
    //
    // The create is still conditional, since there is no point issuing an empty
    // insert, and the two stay in one transaction so a reader never observes a
    // posting with no links between the delete and the insert.
    await prisma.$transaction([
      prisma.opportunitySkill.deleteMany({ where: { opportunityId: opportunity.id } }),
      ...(skills.length
        ? [
            prisma.opportunitySkill.createMany({
              data: skills.map((skill) => ({
                opportunityId: opportunity.id,
                skillSlug: skill.slug,
              })),
            }),
          ]
        : []),
    ]);
    written += 1;
  }

  return { source: name, ok: true, fetched: jobs.length, written };
}

export async function syncAllSources(): Promise<SyncReport[]> {
  const sources = registeredSources();
  const entries = Object.entries(sources);
  const reports = await Promise.all(
    entries.map(([name, fetcher]) =>
      syncSource(name, fetcher).catch(
        (error): SyncReport => ({
          source: name,
          ok: false,
          fetched: 0,
          written: 0,
          error: error instanceof Error ? error.message : "unknown error",
        }),
      ),
    ),
  );
  return reports;
}