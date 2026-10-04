import {
  asArray,
  asId,
  asJson,
  asNumber,
  asString,
  type Json,
  type NormalizedJob,
  type OpportunityKind,
  SourceError,
  fetchJson,
  normalizeEmploymentType,
  stripHtml,
  toDate,
} from "./normalize";

/**
 * Event feeds: hackathons, conferences, and internships from platforms that
 * publish them alongside each other.
 *
 * Separate from `sources.ts` because these are not job boards. Three differences
 * drive the split:
 *
 *   1. Kinds are declared upstream. Every job feed has to infer INTERNSHIP vs
 *      JOB from the title, because that is all it publishes. Unstop states the
 *      kind outright, so inferring it here would only risk disagreeing with them.
 *   2. The load-bearing fields are dates. A hackathon with no deadline is not an
 *      opportunity, it is an article, so `startsAt`/`endsAt`/`expiresAt` carry
 *      the row and `title` alone does not.
 *   3. Eligibility is structured. Unstop returns the skills it wants and who may
 *      apply, which is a better matching signal than anything the regex extractor
 *      can pull out of a job description.
 *
 * All of it is keyless and public. Both endpoints were verified against live
 * data before being wired up, including the two failure modes below.
 */

/* -------------------------------------------------------------------------- */
/* Devpost                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Devpost returns no structured dates at all — only this one free-text string.
 *
 *   "Oct 05 - 27, 2026"               a range, same month
 *   "Aug 31 - Oct 23, 2026"           a range, spanning months
 *   "Dec 20 - Jan 15, 2027"           a range spanning the year boundary
 *   "Jul 16, 2026 - Jan 15, 2027"      a range with a year on *both* ends
 *   "Oct 10, 2026"                    a single day
 *
 * Two things make this worth a hand-written parser rather than `new Date()`.
 *
 * The first is that a range's printed year belongs to the end. A range written
 * "Dec 20 - Jan 15, 2027" ends in January 2027, so it starts in December 2026;
 * reading it as "both ends are 2027" dates a submission window twelve months late
 * and shows a hackathon as open for a year. The long form makes it worse, because
 * each end carries its own year: "Jul 16, 2026 - Jan 15, 2027" is six months long,
 * not six days.
 *
 * The second is that the single-day form is not a hypothetical. Ten of the eighty
 * live hackathons publish "Oct 10, 2026" with no range at all.
 *
 * The single-day form is not hypothetical: measuring the live feed, 10 of the 80
 * hackathons published a single day with no range, and a range-only regex drops
 * every one of them. Those rows land with no deadline and render a card with no
 * date on it, which is exactly the case the date work was meant to fix.
 */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDevpostPeriod(
  text: string | null,
): { start: Date | null; end: Date | null } | null {
  if (!text) return null;

  // Order matters here, and it is the opposite of what the pattern lengths suggest:
  // the widest form is tried first and the narrowest last. Each pattern also
  // matches its narrower neighbours, and the wrong pairing is silent rather than
  // loud — a short range regex applied to a long range returns a plausible pair of
  // dates that happen to be wrong, which is how three open hackathons once landed
  // in the database with July deadlines. `scripts/check-event-dates.ts` pins the
  // order: swap any two of these branches and cases below fail rather than the
  // dates quietly changing.
  // Long form first: "Jul 16, 2026 - Jan 15, 2027", a year on each end. Tried
  // before the short range because the short pattern also matches it, reading it
  // as the two months "Jul" and "Jan" — which is how a six-month window came to
  // parse as a single day, and how three closed hackathons reached the database
  // with July deadlines while upstream still listed them as open.
  const long = text.match(
    /([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})\s*[-–—]\s*([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/,
  );
  if (long) {
    const [, startMonthName, startDay, startYear, endMonthName, endDay, endYear] = long;
    const startMonth = MONTH_INDEX[startMonthName.slice(0, 3).toLowerCase()];
    const endMonth = MONTH_INDEX[endMonthName.slice(0, 3).toLowerCase()];
    if (startMonth === undefined || endMonth === undefined) return null;

    const start = new Date(Date.UTC(Number(startYear), startMonth, Number(startDay)));
    const end = new Date(Date.UTC(Number(endYear), endMonth, Number(endDay), 23, 59, 59));
    return {
      start: Number.isNaN(start.getTime()) ? null : start,
      end: Number.isNaN(end.getTime()) ? null : end,
    };
  }

  const match = text.match(
    /([A-Za-z]{3,})\s+(\d{1,2})\s*[-–—]\s*(?:([A-Za-z]{3,})\s+)?(\d{1,2}),?\s*(\d{4})/,
  );
  if (match) {
    const [, firstMonth, firstDay, secondMonth, secondDay, year] = match;
    const startMonth = MONTH_INDEX[firstMonth.slice(0, 3).toLowerCase()];
    // A missing second month means the range sits inside one month. Written as a
    // ternary rather than `secondMonth && lookup` because that yields `""` for an
    // empty match group, and `""` is neither a number nor nullish.
    const endMonth = secondMonth
      ? MONTH_INDEX[secondMonth.slice(0, 3).toLowerCase()]
      : startMonth;
    if (startMonth === undefined || endMonth === undefined) return null;

    const endYear = Number(year);
    // An end month before the start month means the range crosses new year, so the
    // printed year describes the end and the start is the year before it.
    const startYear = endMonth < startMonth ? endYear - 1 : endYear;

    const start = new Date(Date.UTC(startYear, startMonth, Number(firstDay)));
    // Close of the final day: a submission period reading "Oct 05 - 27" includes
    // the whole of the 27th, and treating it as midnight would expire it a day early.
    const end = new Date(Date.UTC(endYear, endMonth, Number(secondDay), 23, 59, 59));

    return {
      start: Number.isNaN(start.getTime()) ? null : start,
      end: Number.isNaN(end.getTime()) ? null : end,
    };
  }

  // No separator in the string, so it can only be a single day.
  const single = text.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/);
  if (single) {
    const [, month, day, year] = single;
    const monthIndex = MONTH_INDEX[month.slice(0, 3).toLowerCase()];
    if (monthIndex === undefined) return null;

    // A one-day submission window opens and closes on that day. Closing at
    // 23:59:59 rather than midnight is deliberate: midnight would mark the
    // deadline as passed for the entire day it is actually reachable.
    const dayStart = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
    const dayEnd = new Date(Date.UTC(Number(year), monthIndex, Number(day), 23, 59, 59));
    return {
      start: Number.isNaN(dayStart.getTime()) ? null : dayStart,
      end: Number.isNaN(dayEnd.getTime()) ? null : dayEnd,
    };
  }

  return null;
}

/** Devpost serves thumbnails protocol-relative, which an `<img src>` rejects. */
function devpostImage(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

/**
 * Devpost is paginated by `per_page` but caps out at 50, and the default page
 * returns only 9 rows — which reads exactly like "there are 9 hackathons" if you
 * do not notice. Both states are requested because `open_state` splits a
 * hackathon's life in two, and a student can only act during `open`.
 */
const DEVPOST_STATES = ["open", "upcoming"] as const;

export async function fetchDevpost(): Promise<NormalizedJob[]> {
  const rows: NormalizedJob[] = [];

  for (const state of DEVPOST_STATES) {
    const data = await fetchJson(
      "devpost",
      `https://devpost.com/api/hackathons?status%5B%5D=${state}&per_page=50`,
      { timeoutMs: 15000 },
    );

    for (const entry of asArray(asJson(data)?.hackathons)) {
      const hackathon = asJson(entry);
      if (!hackathon) continue;

      const id = asId(hackathon.id);
      const title = asString(hackathon.title);
      if (!id || !title) continue;

      const period = parseDevpostPeriod(asString(hackathon.submission_period_dates));
      const location = asString(asJson(hackathon.displayed_location)?.location);
      const themes = asArray(hackathon.themes).flatMap((theme) => {
        const name = asString(asJson(theme)?.name);
        return name ? [name] : [];
      });

      rows.push({
        source: "devpost",
        externalId: id,
        kind: "HACKATHON",
        title,
        company: asString(hackathon.organization_name),
        location,
        remote: location ? /online/i.test(location) : false,
        employmentType: "OTHER",
        salaryMin: null,
        salaryMax: null,
        currency: null,
        // The list endpoint carries no blurb, only the submission window and
        // prize. Leaving description null rather than inventing one from the title.
        description: null,
        applyUrl: asString(hackathon.url),
        logoUrl: devpostImage(asString(hackathon.thumbnail_url)),
        publishedAt: null,
        // For a hackathon the submission window *is* the deadline, so all three
        // dates carry the same window: it opens, it closes, and submissions are
        // what close it.
        expiresAt: period?.end ?? null,
        startsAt: period?.start ?? null,
        endsAt: period?.end ?? null,
        tags: themes,
      });
    }
  }

  if (rows.length === 0) throw new SourceError("devpost", "no hackathons in either state");
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Unstop                                                                      */
/* -------------------------------------------------------------------------- */

export type UnstopFeed = "hackathons" | "conferences" | "internships";

/** Unstop states the kind, so it is mapped rather than inferred from the title. */
const UNSTOP_KIND: Record<UnstopFeed, OpportunityKind> = {
  hackathons: "HACKATHON",
  conferences: "CONFERENCE",
  internships: "INTERNSHIP",
};

const UNSTOP_PAGE_SIZE = 100;

/**
 * Page ceiling. Sized from the largest feed in use: `internships` reports 697
 * open listings and serves them ~95 to a page, so eight pages. Fifteen leaves
 * headroom for growth without letting a misbehaving endpoint cost an unbounded
 * number of requests.
 */
const UNSTOP_MAX_PAGES = 15;

const UNSTOP_PAGE_DELAY_MS = 400;

/**
 * Unstop's currency strings are namespaced and inconsistent — `fa-rupee`,
 * `usd`, `inr`. Only the unambiguous ones are surfaced; an unmapped code is
 * worse than none, because it renders as a number beside an unreadable symbol.
 */
function unstopCurrency(raw: string | null): string | null {
  if (!raw) return null;
  const code = raw.toLowerCase().replace(/^[a-z]{2}-/, "");
  if (code.includes("rupee") || code === "inr") return "INR";
  if (code === "usd" || code === "$") return "USD";
  if (code === "eur" || code === "€") return "EUR";
  if (code === "gbp" || code === "£") return "GBP";
  return null;
}

function unstopLocation(record: Json): string | null {
  const address = asJson(record.address_with_country_logo);
  const parts = [
    asString(address?.city),
    asString(address?.state),
    asString(asJson(address?.country)?.name),
  ].filter((part): part is string => Boolean(part));

  const place = [...new Set(parts)].join(", ");
  if (place) return place;

  const region = asString(record.region);
  if (!region) return null;
  return region.charAt(0).toUpperCase() + region.slice(1);
}

/**
 * Eligibility ("Engineering Students", "Undergraduate") and required skills both
 * arrive as structured lists. They are folded into `tags`, which is the channel
 * the skill extractor already reads, so Unstop rows get real vocabulary matching
 * instead of regex over prose.
 */
function unstopTags(record: Json): string[] {
  const fromSkills = asArray(record.required_skills).flatMap((entry) => {
    const name = asString(asJson(entry)?.skill_name);
    return name ? [name] : [];
  });
  const fromWork = asArray(record.workfunction).flatMap((entry) => {
    const name = asString(asJson(entry)?.name);
    return name ? [name] : [];
  });
  const fromFilters = asArray(record.filters).flatMap((entry) => {
    const filter = asJson(entry);
    const name = asString(filter?.name);
    // "All" is not information about who may attend.
    return name && !/^all$/i.test(name) ? [name] : [];
  });
  return [...new Set([...fromSkills, ...fromWork, ...fromFilters])];
}

function normalizeUnstop(
  source: string,
  kind: OpportunityKind,
  entry: unknown,
): NormalizedJob | null {
  const record = asJson(entry);
  if (!record) return null;

  const id = asId(record.id);
  const title = asString(record.title);
  if (!id || !title) return null;

  const regn = asJson(record.regnRequirements);

  // The registration window and the listing's own end date are two different
  // deadlines and both are kept: registration closing is when the student can
  // still act, `end_date` is when the event itself finishes.
  const registrationCloses = toDate(regn?.end_regn_dt);
  const eventEnds = toDate(record.end_date);
  const deadline = registrationCloses ?? eventEnds;

  // `oppstatus=open` is the API's own liveness filter and does most of this
  // work, but it was measured returning a listing whose deadline had already
  // passed, so a listing nobody can register for is dropped rather than shown.
  if (deadline && deadline.getTime() < Date.now()) return null;

  const detail = asJson(record.jobDetail);
  const region = asString(record.region);
  const organisation = asJson(record.organisation);

  return {
    source,
    externalId: id,
    kind,
    title,
    company: asString(organisation?.name),
    location: unstopLocation(record),
    remote: region === "online" || detail?.type === "wfh",
    employmentType: normalizeEmploymentType(asString(detail?.timing)),
    salaryMin: asNumber(detail?.min_salary),
    salaryMax: asNumber(detail?.max_salary),
    currency: unstopCurrency(asString(detail?.currency)),
    description: stripHtml(asString(record.details), 4000),
    applyUrl: asString(record.short_url),
    logoUrl: asString(organisation?.logoUrl2) ?? asString(record.logoUrl2),
    publishedAt: toDate(record.approved_date) ?? toDate(record.updated_at),
    expiresAt: deadline,
    startsAt: toDate(regn?.start_regn_dt),
    endsAt: eventEnds,
    tags: unstopTags(record),
  };
}

/**
 * `oppstatus=open` is load-bearing, not an optimisation.
 *
 * Without it the feed is dominated by expired listings: measured across the
 * first 500 rows of each feed, 2 of 500 internships and 184 of 500 hackathons
 * still had a future deadline. With it, 98 of 98 and 82 of 82 did. Unstop's
 * reported totals drop from 10,000+ to 696 live internships, which is the
 * honest number — the other 9,300 are listings nobody can enter.
 *
 * `sort=recent`, `filter=open` and `regn_open=1` were all tried and are
 * silently ignored: each returns byte-identical results to no parameter at all.
 * Only `oppstatus` does anything.
 *
 * Paging stops on an *empty* page, never on a short one. Unstop serves fewer
 * rows than `per_page` while more pages remain — measured on the live feeds,
 * `internships` returned 98, 96, 95 and 94 rows from its first four pages, and
 * `hackathons` returned 82 then 98. Treating a short page as the last one, which
 * is the usual and reasonable convention, silently ingested 98 of 697
 * internships and 82 of 273 hackathons. There is no `has_next` flag to read
 * instead; an empty page is the only reliable terminator.
 *
 * Ordering is also unstable across pages — `hackathons` page 2 begins at a
 * higher id than page 1 does — so the same listing can arrive twice. Ids are
 * deduplicated here rather than left to the upsert, because a repeat would
 * consume a slot of the row budget and displace a listing that is only listed
 * once.
 */
export async function fetchUnstop(feed: UnstopFeed): Promise<NormalizedJob[]> {
  const source = `unstop:${feed}`;
  const kind = UNSTOP_KIND[feed];
  const rows: NormalizedJob[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= UNSTOP_MAX_PAGES; page++) {
    const data = await fetchJson(
      source,
      `https://unstop.com/api/public/opportunity/search-result` +
        `?opportunity=${feed}&oppstatus=open&per_page=${UNSTOP_PAGE_SIZE}&page=${page}`,
      { timeoutMs: 20000 },
    );

    const batch = asArray(asJson(asJson(data)?.data)?.data);
    if (batch.length === 0) break;

    for (const entry of batch) {
      const row = normalizeUnstop(source, kind, entry);
      if (!row || seen.has(row.externalId)) continue;
      seen.add(row.externalId);
      rows.push(row);
    }

    if (page < UNSTOP_MAX_PAGES) {
      await new Promise((resolve) => setTimeout(resolve, UNSTOP_PAGE_DELAY_MS));
    }
  }

  if (rows.length === 0) throw new SourceError(source, "no open listings");
  return rows;
}

/** Attribution rows for the two new sources, keyed by `Opportunity.source` prefix. */
export const EVENT_SOURCE_ATTRIBUTION: Record<string, { label: string; url: string }> = {
  devpost: { label: "Devpost", url: "https://devpost.com/hackathons" },
  unstop: { label: "Unstop", url: "https://unstop.com" },
};