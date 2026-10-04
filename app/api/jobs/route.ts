import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { SOURCE_ATTRIBUTION } from "@/lib/jobs/sources";

const KINDS = ["INTERNSHIP", "HACKATHON", "WORKSHOP", "JOB", "CONFERENCE"] as const;
const EMPLOYMENT = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "VOLUNTEER", "OTHER"] as const;

type Kind = (typeof KINDS)[number];
type Employment = (typeof EMPLOYMENT)[number];

function parseList<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is T => (allowed as readonly string[]).includes(v));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const kinds = parseList<Kind>(url.searchParams.get("kind"), KINDS);
  const employment = parseList<Employment>(url.searchParams.get("employment"), EMPLOYMENT);
  const remoteOnly = url.searchParams.get("remote") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 24) || 24, 100);

  const where = {
    ...(kinds.length ? { kind: { in: kinds } } : {}),
    ...(employment.length ? { employmentType: { in: employment } } : {}),
    ...(remoteOnly ? { remote: true } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { company: { contains: query, mode: "insensitive" as const } },
            { location: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: {
        id: true,
        source: true,
        externalId: true,
        kind: true,
        title: true,
        company: true,
        location: true,
        remote: true,
        employmentType: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        applyUrl: true,
        publishedAt: true,
        matches: { select: { skillSlug: true }, take: 12 },
      },
    }),
    prisma.opportunity.count({ where }),
  ]);

  const present = new Set(items.map((item) => item.source.split(":")[0]));
  const attribution = Object.entries(SOURCE_ATTRIBUTION)
    .filter(([key]) => present.has(key))
    .map(([key, value]) => ({ source: key, ...value }));

  return NextResponse.json({
    items: items.map(({ matches, ...rest }) => ({
      ...rest,
      skills: matches.map((m) => m.skillSlug),
    })),
    total,
    attribution,
  });
}