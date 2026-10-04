import { parseDevpostPeriod } from "../lib/jobs/event-sources";

/**
 * Gate for Devpost's submission-window parser.
 *
 * This is the only place in the codebase that reads a date out of free text.
 * Everything else — Greenhouse's `application_deadline`, Unstop's `end_regn_dt`
 * — arrives as an ISO timestamp and goes through `toDate`. Devpost publishes
 * exactly one date-bearing field and it looks like `"Oct 05 - 27, 2026"`.
 *
 * That makes two of its failure modes worth pinning, and both are silent. The
 * parser returning null does not throw or warn; it just leaves the row with no
 * dates, and the card renders with no deadline line at all. So a parse that
 * quietly stops matching is indistinguishable from a hackathon with no schedule
 * unless something asserts it.
 *
 * The year-rollover case is the one that is easy to get backwards. The printed
 * year always belongs to the *end* of the range, so "Dec 20 - Jan 15, 2027"
 * starts in December 2026. Reading it as "both ends are 2027" would date a
 * submission window twelve months late and show a hackathon as still open for a
 * year.
 */

type Case = {
  name: string;
  input: string | null;
  expect: { start: string | null; end: string | null } | null;
  why: string;
};

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 19) : null);

const cases: Case[] = [
  {
    name: "same month",
    input: "Oct 05 - 27, 2026",
    expect: { start: "2026-10-05T00:00:00", end: "2026-10-27T23:59:59" },
    why: "the shape Devpost uses most, and the one with no year ambiguity",
  },
  {
    name: "spanning months",
    input: "Aug 31 - Oct 23, 2026",
    expect: { start: "2026-08-31T00:00:00", end: "2026-10-23T23:59:59" },
    why: "both months are stated and both are in the printed year",
  },
  {
    name: "spanning the year boundary",
    input: "Dec 20 - Jan 15, 2027",
    expect: { start: "2026-12-20T00:00:00", end: "2027-01-15T23:59:59" },
    why: "the printed year is the END year, so the start is the year before",
  },
  {
    name: "two-digit day after the month is not swapped",
    input: "Oct 10 - 11, 2026",
    expect: { start: "2026-10-10T00:00:00", end: "2026-10-11T23:59:59" },
    why: "guards against reading '10 - 11' as a single day number pair",
  },
  {
    name: "en dash separator",
    input: "Oct 05 – 27, 2026",
    expect: { start: "2026-10-05T00:00:00", end: "2026-10-27T23:59:59" },
    why: "Devpost uses a plain hyphen, but an en dash must not become a hard failure",
  },
  {
    name: "em dash separator",
    input: "Oct 05 — 27, 2026",
    expect: { start: "2026-10-05T00:00:00", end: "2026-10-27T23:59:59" },
    why: "same reasoning as the en dash",
  },
  {
    name: "lower-case month",
    input: "oct 05 - 27, 2026",
    expect: { start: "2026-10-05T00:00:00", end: "2026-10-27T23:59:59" },
    why: "month lookup is case-folded rather than exact",
  },
  {
    name: "long form: a year on each end",
    input: "Jul 16, 2026 - Jan 15, 2027",
    expect: { start: "2026-07-16T00:00:00", end: "2027-01-15T23:59:59" },
    why: "the live form for multi-month windows; a short-range regex reads 'Jul'/'Jan' and returns one day",
  },
  {
    name: "long form where both ends are in the same year",
    input: "Mar 02, 2026 - Nov 30, 2026",
    expect: { start: "2026-03-02T00:00:00", end: "2026-11-30T23:59:59" },
    why: "guards against reading the second year as the first end's",
  },
  {
    name: "long form with an unknown end month",
    input: "Jul 16, 2026 - Foo 15, 2027",
    expect: null,
    why: "the long form must reject an unrecognised month rather than fall back to the short one",
  },
  {
    name: "single day, no range",
    input: "Oct 10, 2026",
    expect: { start: "2026-10-10T00:00:00", end: "2026-10-10T23:59:59" },
    why: "10 of the 80 live hackathons publish this form; a range-only regex drops all of them",
  },
  {
    name: "single day closes at end of day, not midnight",
    input: "Oct 10, 2026",
    expect: { start: "2026-10-10T00:00:00", end: "2026-10-10T23:59:59" },
    why: "midnight would expire the deadline during the day it is still reachable",
  },
  {
    name: "single day in December",
    input: "Dec 31, 2026",
    expect: { start: "2026-12-31T00:00:00", end: "2026-12-31T23:59:59" },
    why: "month arithmetic and year boundary in the single-day form",
  },
  {
    name: "single day with an unknown month",
    input: "Foo 10, 2026",
    expect: null,
    why: "the single-day form must reject an unrecognised month, not default to January",
  },
  {
    name: "missing period",
    input: null,
    expect: null,
    why: "a hackathon with no announced schedule parses to nothing, not to garbage",
  },
  {
    name: "empty string",
    input: "   ",
    expect: null,
    why: "whitespace is the absence of a value, not a parse failure to report",
  },
  {
    name: "prose instead of a range",
    input: "Submissions open soon",
    expect: null,
    why: "the common real value for an announced-but-unscheduled hackathon",
  },
  {
    name: "unknown month name",
    input: "Foo 05 - 27, 2026",
    expect: null,
    why: "an unrecognised month must not resolve to month zero",
  },
  {
    name: "a range with no year",
    input: "Oct 05 - 27",
    expect: null,
    why: "no year means no date; guessing the current one would date it wrongly",
  },
];

let failures = 0;

for (const testCase of cases) {
  const actual = parseDevpostPeriod(testCase.input);
  const start = iso(actual?.start ?? null);
  const end = iso(actual?.end ?? null);
  const wantStart = testCase.expect?.start ?? null;
  const wantEnd = testCase.expect?.end ?? null;

  if (start !== wantStart || end !== wantEnd) {
    failures += 1;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`        input: ${JSON.stringify(testCase.input)}`);
    console.log(`        start: want ${wantStart}, got ${start}`);
    console.log(`        end:   want ${wantEnd}, got ${end}`);
    console.log(`        ${testCase.why}`);
  }
}

if (failures) {
  console.log(`\n${failures} failure(s) of ${cases.length} cases`);
  process.exitCode = 1;
} else {
  console.log(`${cases.length} cases, all pass`);
}
