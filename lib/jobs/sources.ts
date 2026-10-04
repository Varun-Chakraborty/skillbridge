import {
  asArray,
  asId,
  asJson,
  asNumber,
  asString,
  type EmploymentType,
  type NormalizedJob,
  SourceError,
  fetchJson,
  inferKind,
  normalizeEmploymentType,
  stripHtml,
  toDate,
} from "./normalize";

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
        // Job feeds publish no event window; the event feeds set these.
        startsAt: null,
        endsAt: null,
        tags,
      } satisfies NormalizedJob,
    ];
  });
}

/**
 * Per-request ceiling for Lever, well above the shared default.
 *
 * Lever returns every posting for a board in one undifferentiated response,
 * with no pagination and no size hint, so cost scales with how many roles a
 * company happens to have open. Measured against `matchgroup` (72 postings,
 * 1.09 MB): 12.4s, 12.7s, 19.8s across three consecutive requests, with
 * time-to-first-byte alone reaching 9.6s before any body transferred.
 *
 * The previous 15s sat inside that spread, so roughly half of all runs to a
 * board that size failed. Retrying in `fetchJson` does not rescue that case —
 * three attempts at 15s still lose to a board that reliably needs 20s — so the
 * ceiling is raised rather than the retries leaned on. 45s is ~2x the worst
 * observation, not a tuned value.
 */
const LEVER_TIMEOUT_MS = 45000;

export async function fetchLever(company: string): Promise<NormalizedJob[]> {
  const source = `lever:${company}`;
  const data = await fetchJson(
    source,
    `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`,
    { timeoutMs: LEVER_TIMEOUT_MS },
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

    // Taxonomy comes from `categories`, mirroring Ashby above. It deliberately
    // does not come from `lists`: on Lever that field is the posting's own
    // description outline — `[{text: "In this role, you will:", content: "<div>…"}]` —
    // so reading it as tags stored prose section headings as skill evidence and
    // threw away the only field naming the team ("Engineering", "AI/ML"), which
    // is exactly what a student's skills are matched against.
    const tags = [
      asString(categories?.team),
      asString(categories?.department),
      asString(job.workplaceType),
    ].filter((x): x is string => !!x);

    return [
      {
        source,
        externalId: id,
        kind: inferKind(title, tags, employmentType),
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
        // Job feeds publish no event window; the event feeds set these.
        startsAt: null,
        endsAt: null,
        tags,
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
        // Job feeds publish no event window; the event feeds set these.
        startsAt: null,
        endsAt: null,
        tags,
      } satisfies NormalizedJob,
    ];
  });
}

/**
 * Arbeitnow caps its response at `per_page` rows and documents `?page=` for the
 * rest. Fetching page 1 alone returned 325 of 1,842 live postings, so 1,226 rows
 * already in the database were live jobs the sync simply never asked about, and
 * their absence from the table was indistinguishable from a closed req.
 *
 * Two details of the feed are load-bearing and were measured, not assumed:
 *
 *  - Pages are a clean partition. Pages 1-14 return rows, 15+ come back empty,
 *    and no slug appears on two pages, so iterating to an empty page is safe.
 *  - The `meta.from` / `meta.to` offsets are wrong (page 1 reports 1-325, page 2
 *    reports 101-325) and the ordering is not stable across pages, so neither is
 *    used to decide when to stop.
 *
 * `ARBEITNOW_MAX_PAGES` is a guard against a feed that keeps returning rows
 * forever. It sits well above the observed 14 so normal operation never reaches
 * it, and hitting it is not treated as success — the loop reports how many pages
 * it walked so a truncated read is visible in the sync log.
 */
const ARBEITNOW_MAX_PAGES = 40;

/**
 * Pause between pages.
 *
 * Arbeitnow's response carries "This is a free public API for jobs, please do
 * not abuse", and paging turned one sync into fourteen requests against it. With
 * no pause, back-to-back syncs reliably drew HTTP 429 and the source dropped to
 * zero rows for the run. Four hundred milliseconds over fourteen pages adds about
 * five seconds to a job that already takes twenty, which is a fair price for
 * not being the reason the feed slows down for everyone else.
 */
const ARBEITNOW_PAGE_DELAY_MS = 400;

async function fetchArbeitnowPage(page: number): Promise<NormalizedJob[]> {
  const source = "arbeitnow";
  const data = await fetchJson(
    source,
    `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
    { timeoutMs: 20000 },
  );

  return asArray(asJson(data)?.data).flatMap((entry) => {
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
        // Job feeds publish no event window; the event feeds set these.
        startsAt: null,
        endsAt: null,
        tags,
      } satisfies NormalizedJob,
    ];
  });
}

export async function fetchArbeitnow(): Promise<NormalizedJob[]> {
  const source = "arbeitnow";
  // Keyed by slug so a posting served on two pages cannot be upserted twice or
  // counted twice against this source's budget.
  const collected = new Map<string, NormalizedJob>();

  for (let page = 1; page <= ARBEITNOW_MAX_PAGES; page++) {
    let batch: NormalizedJob[];
    try {
      batch = await fetchArbeitnowPage(page);
    } catch (error) {
      // Pages past the end of the feed may answer 404 rather than an empty
      // body. That is the end of the feed, not a failed sync — but only if we
      // already have rows. A failure on page 1 is a real outage and propagates,
      // because returning an empty list here would look like "no jobs exist".
      if (collected.size > 0) break;
      throw error;
    }

    if (!batch.length) break;
    for (const job of batch) if (!collected.has(job.externalId)) collected.set(job.externalId, job);

    if (page < ARBEITNOW_MAX_PAGES) {
      await new Promise((resolve) => setTimeout(resolve, ARBEITNOW_PAGE_DELAY_MS));
    }
  }

  if (!collected.size) throw new SourceError(source, "feed returned no jobs");

  return [...collected.values()];
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
        // Job feeds publish no event window; the event feeds set these.
        startsAt: null,
        endsAt: null,
        tags,
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
        // Job feeds publish no event window; the event feeds set these.
        startsAt: null,
        endsAt: null,
        tags,
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