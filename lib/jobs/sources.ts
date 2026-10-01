import {
  type EmploymentType,
  type NormalizedJob,
  SourceError,
  fetchJson,
  inferKind,
  normalizeEmploymentType,
  stripHtml,
  toDate,
} from "./normalize";

type Json = Record<string, unknown>;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

const asId = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return asString(v);
};

const asNumber = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const asJson = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;

export async function fetchGreenhouse(boardToken: string): Promise<NormalizedJob[]> {
  const source = `greenhouse:${boardToken}`;
  const data = await fetchJson(
    source,
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    { timeoutMs: 15000 },
  );
  const jobs = asArray(asJson(data)?.jobs);
  if (!jobs.length) throw new SourceError(source, "board returned no jobs");

  return jobs.flatMap((entry) => {
    const job = asJson(entry);
    if (!job) return [];
    const id = asId(job.id);
    const title = asString(job.title);
    if (!id || !title) return [];

    const locationName = asString(asJson(job.location)?.name);
    const departments = asArray(job.departments).flatMap((d) =>
      [asString(asJson(d)?.name)].filter((x): x is string => !!x),
    );
    const offices = asArray(job.offices).flatMap((o) =>
      [asString(asJson(o)?.name)].filter((x): x is string => !!x),
    );

    const descriptionHtml = stripHtml(asString(job.content), 6000);
    const employmentType = normalizeEmploymentType(asString(job.employment_type));
    const tags = [...departments, ...offices];

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, tags, employmentType),
        title,
        company: asString(job.company_name) ?? boardToken,
        location: locationName,
        remote: locationName === null ? false : /remote/i.test(locationName),
        employmentType,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        description: descriptionHtml,
        applyUrl: asString(job.absolute_url),
        logoUrl: null,
        publishedAt: toDate(job.updated_at ?? job.first_published),
        expiresAt: toDate(job.application_deadline),
        tags,
        raw: job,
      } satisfies NormalizedJob,
    ];
  });
}

export async function fetchLever(company: string): Promise<NormalizedJob[]> {
  const source = `lever:${company}`;
  const data = await fetchJson(
    source,
    `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`,
    { timeoutMs: 15000 },
  );
  const jobs = Array.isArray(data) ? data : [];
  if (!jobs.length) throw new SourceError(source, "company returned no postings");

  return jobs.flatMap((entry) => {
    const job = asJson(entry);
    if (!job) return [];
    const id = asId(job.id);
    const title = asString(job.text);
    if (!id || !title) return [];

    const categories = asJson(job.categories);
    const employmentType = normalizeEmploymentType(asString(categories?.commitment));
    const workplaceType = asString(job.workplaceType);
    const location =
      asString(categories?.location) ??
      ([asString(job.country), workplaceType].filter(Boolean).join(" · ") || null);

    const salaryRange = asJson(job.salaryRange);
    const interval = asString(salaryRange?.interval);
    const hourly = interval === "per-hour-wage";
    const rawMin = asNumber(salaryRange?.min);
    const rawMax = asNumber(salaryRange?.max);
    const scale = hourly ? 2080 : 1;
    const salaryMin = rawMin !== null ? Math.round(rawMin * scale) : null;
    const salaryMax = rawMax !== null ? Math.round(rawMax * scale) : null;
    const currency = asString(salaryRange?.currency);

    const lists = asArray(job.lists).flatMap((l) =>
      [asString(asJson(l)?.text)].filter((x): x is string => !!x),
    );

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, lists, employmentType),
        title,
        company,
        location,
        remote: /remote/i.test(location ?? ""),
        employmentType,
        salaryMin: salaryMin !== null ? Math.round(salaryMin) : null,
        salaryMax: salaryMax !== null ? Math.round(salaryMax) : null,
        currency,
        description: stripHtml(asString(job.descriptionPlain) ?? asString(job.description), 6000),
        applyUrl: asString(job.applyUrl) ?? asString(job.hostedUrl),
        logoUrl: null,
        publishedAt: toDate(job.createdAt),
        expiresAt: null,
        tags: lists,
        raw: job,
      } satisfies NormalizedJob,
    ];
  });
}

export async function fetchAshby(board: string): Promise<NormalizedJob[]> {
  const source = `ashby:${board}`;
  const data = await fetchJson(
    source,
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`,
    { timeoutMs: 15000 },
  );
  const jobs = asArray(asJson(data)?.jobs);
  if (!jobs.length) throw new SourceError(source, "board returned no jobs");

  return jobs.flatMap((entry) => {
    const job = asJson(entry);
    if (!job) return [];
    const id = asId(job.id);
    const title = asString(job.title);
    if (!id || !title || job.isListed === false) return [];

    const employmentType = normalizeEmploymentType(asString(job.employmentType));
    const secondary = asArray(job.secondaryLocations).flatMap((l) =>
      [asString(asJson(l)?.location)].filter((x): x is string => !!x),
    );
    const location =
      [asString(job.location), ...secondary].filter(Boolean).join(" · ") || null;

    const tags = [
      asString(job.department),
      asString(job.team),
      asString(job.workplaceType),
    ].filter((x): x is string => !!x);

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, tags, employmentType),
        title,
        company: board,
        location,
        remote: job.isRemote === true || /remote/i.test(location ?? ""),
        employmentType,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        description: stripHtml(asString(job.descriptionPlain) ?? asString(job.descriptionHtml), 6000),
        applyUrl: asString(job.applyUrl) ?? asString(job.jobUrl),
        logoUrl: null,
        publishedAt: toDate(job.publishedAt),
        expiresAt: null,
        tags,
        raw: job,
      } satisfies NormalizedJob,
    ];
  });
}

export async function fetchArbeitnow(): Promise<NormalizedJob[]> {
  const source = "arbeitnow";
  const data = await fetchJson(source, "https://www.arbeitnow.com/api/job-board-api");
  const jobs = asArray(asJson(data)?.data);
  if (!jobs.length) throw new SourceError(source, "feed returned no jobs");

  return jobs.flatMap((entry) => {
    const job = asJson(entry);
    if (!job) return [];
    const id = asString(job.slug);
    const title = asString(job.title);
    if (!id || !title) return [];

    const employmentType = normalizeEmploymentType(asString(asArray(job.job_types)[0]));
    const location = asString(job.location);
    const tags = asArray(job.tags).filter((t): t is string => typeof t === "string");

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, tags, employmentType),
        title,
        company: asString(job.company_name),
        location,
        remote: job.remote === true,
        employmentType,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        description: stripHtml(asString(job.description), 5000),
        applyUrl: asString(job.url),
        logoUrl: null,
        publishedAt: toDate(job.created_at),
        expiresAt: null,
        tags,
        raw: job,
      } satisfies NormalizedJob,
    ];
  });
}

export async function fetchRemotive(): Promise<NormalizedJob[]> {
  const source = "remotive";
  const data = await fetchJson(source, "https://remotive.com/api/remote-jobs");
  const jobs = asArray(asJson(data)?.jobs);
  if (!jobs.length) throw new SourceError(source, "feed returned no jobs");

  return jobs.flatMap((entry) => {
    const job = asJson(entry);
    if (!job) return [];
    const id = asId(job.id);
    const title = asString(job.title);
    if (!id || !title) return [];

    const employmentType = normalizeEmploymentType(asString(job.job_type));
    const tags = asArray(job.tags).filter((t): t is string => typeof t === "string");

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, tags, employmentType),
        title,
        company: asString(job.company_name),
        location: asString(job.candidate_required_location),
        remote: true,
        employmentType,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        description: stripHtml(asString(job.description), 5000),
        applyUrl: asString(job.url),
        logoUrl: asString(job.company_logo_url),
        publishedAt: toDate(job.publication_date),
        expiresAt: null,
        tags,
        raw: job,
      } satisfies NormalizedJob,
    ];
  });
}

export async function fetchRemoteok(): Promise<NormalizedJob[]> {
  const source = "remoteok";
  const data = await fetchJson(source, "https://remoteok.com/api");
  const jobs = Array.isArray(data) ? data.slice(1) : [];
  if (!jobs.length) throw new SourceError(source, "feed returned no jobs");

  return jobs.flatMap((entry) => {
    const job = asJson(entry);
    if (!job) return [];
    const id = asId(job.id) ?? asString(job.slug);
    const title = asString(job.position);
    if (!id || !title) return [];

    const tags = asArray(job.tags).filter((t): t is string => typeof t === "string");
    const location = asString(job.location);
    const employmentType: EmploymentType =
      tags.map((tag) => normalizeEmploymentType(tag)).find((type) => type !== "OTHER") ??
      "FULL_TIME";
    const salaryMin = asNumber(job.salary_min);
    const salaryMax = asNumber(job.salary_max);

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, tags, employmentType),
        title,
        company: asString(job.company),
        location,
        remote: true,
        employmentType,
        salaryMin,
        salaryMax,
        currency: salaryMin !== null ? "USD" : null,
        description: stripHtml(asString(job.description), 5000),
        applyUrl: asString(job.apply_url) ?? asString(job.url),
        logoUrl: asString(job.company_logo) ?? asString(job.logo),
        publishedAt: toDate(job.date ?? job.epoch),
        expiresAt: null,
        tags,
        raw: job,
      } satisfies NormalizedJob,
    ];
  });
}

export const SOURCE_ATTRIBUTION: Record<string, { label: string; url: string }> = {
  remoteok: { label: "Jobs from RemoteOK", url: "https://remoteok.com" },
  arbeitnow: { label: "Jobs via Arbeitnow", url: "https://www.arbeitnow.com" },
  remotive: { label: "Jobs via Remotive", url: "https://remotive.com" },
  greenhouse: { label: "Greenhouse job boards", url: "https://www.greenhouse.io" },
  lever: { label: "Lever postings", url: "https://jobs.lever.co" },
  ashby: { label: "Ashby job boards", url: "https://jobs.ashbyhq.com" },
};