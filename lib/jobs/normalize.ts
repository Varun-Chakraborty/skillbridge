export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERNSHIP"
  | "VOLUNTEER"
  | "OTHER";

export type OpportunityKind = "INTERNSHIP" | "HACKATHON" | "WORKSHOP" | "JOB";

export type NormalizedJob = {
  source: string;
  externalId: string;
  kind: OpportunityKind;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  employmentType: EmploymentType;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  description: string | null;
  applyUrl: string | null;
  logoUrl: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  tags: string[];
};

export class SourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`${source}: ${message}`);
    this.name = "SourceError";
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

/** How many times a 429 is retried before the source is failed for this run. */
const RATE_LIMIT_RETRIES = 2;

/** Fallback wait when a 429 arrives without a usable `Retry-After`. */
const RATE_LIMIT_BACKOFF_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seconds to wait before retrying a 429.
 *
 * `Retry-After` may be either a delay in seconds or an HTTP date, and these
 * public APIs use both forms across endpoints. Honouring it is the difference
 * between backing off for as long as the server asked and guessing — and
 * guessing wrong here means hammering an endpoint that has already told us to
 * stop.
 */
function retryAfterMs(response: Response): number {
  const header = response.headers.get("retry-after");
  if (!header) return RATE_LIMIT_BACKOFF_MS;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);

  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 30000);

  return RATE_LIMIT_BACKOFF_MS;
}

/**
 * Fetch JSON, retrying a rate-limited response with backoff.
 *
 * All six sources are public, keyless, and shared with every other project
 * scraping the same feed, so a 429 is an expected condition rather than an
 * outage. Treating it as a hard failure lost a source entirely on roughly one
 * sync in three — measured on Arbeitnow, whose pagination turns a single sync
 * into fourteen requests against an API whose own response asks callers not to
 * abuse it.
 *
 * Bounded to `RATE_LIMIT_RETRIES` and capped at 30s per wait, so a persistently
 * throttled endpoint fails that one source for the run rather than stalling the
 * whole sync behind it.
 */
export async function fetchJson(
  source: string,
  url: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, headers }: { timeoutMs?: number; headers?: HeadersInit } = {},
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "SkillBridge/0.1", ...headers },
        cache: "no-store",
      });

      if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
        await sleep(retryAfterMs(response));
        continue;
      }

      if (!response.ok) {
        throw new SourceError(source, `HTTP ${response.status} from ${url}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof SourceError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SourceError(source, `timed out after ${timeoutMs}ms`);
      }
      throw new SourceError(source, "request failed", error);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function toDate(value: unknown): Date | null {
  if (typeof value === "number") {
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const EMPLOYMENT_ALIASES: Record<string, EmploymentType> = {
  "full-time": "FULL_TIME",
  "full time": "FULL_TIME",
  fulltime: "FULL_TIME",
  full_time: "FULL_TIME",
  "part-time": "PART_TIME",
  "part time": "PART_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACT",
  internship: "INTERNSHIP",
  volunteer: "VOLUNTEER",
  temporary: "CONTRACT",
};

export function normalizeEmploymentType(value: unknown): EmploymentType {
  if (typeof value !== "string") return "OTHER";
  return EMPLOYMENT_ALIASES[value.trim().toLowerCase()] ?? "OTHER";
}

export function stripHtml(html: string | null | undefined, maxLength = 4000): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function inferKind(
  title: string,
  tags: string[],
  employmentType: EmploymentType,
): OpportunityKind {
  const haystack = `${title} ${tags.join(" ")}`.toLowerCase();
  if (/\bhackathon\b|\bbuildathon\b|\bdatathon\b|\bhack ?fest\b/.test(haystack)) {
    return "HACKATHON";
  }
  if (/\bworkshop\b|\bbootcamp\b|\bmasterclass\b/.test(haystack)) return "WORKSHOP";
  if (employmentType === "INTERNSHIP" || /\bintern(ship)?\b/i.test(title)) {
    return "INTERNSHIP";
  }
  return "JOB";
}

export function slugifySkill(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.(js|ts|py)$/i, "")
    .replace(/[^a-z0-9+#]+/g, "-")
    .replace(/^-+|-+$/g, "");
}