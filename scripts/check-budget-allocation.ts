import { allocateBudget } from "../lib/jobs/relevance";

type Case = { name: string; sources: { key: string; weight: number; demand: number }[]; total: number };

const cases: Case[] = [
  {
    name: "equal weights, everyone wants more than their slice",
    sources: [
      { key: "a", weight: 100, demand: 900 },
      { key: "b", weight: 100, demand: 900 },
      { key: "c", weight: 100, demand: 900 },
    ],
    total: 600,
  },
  {
    name: "one feed smaller than its slice: remainder must redistribute",
    sources: [
      { key: "big", weight: 100, demand: 900 },
      { key: "small", weight: 100, demand: 10 },
      { key: "mid", weight: 100, demand: 400 },
    ],
    total: 600,
  },
  {
    name: "weights are a ratio, not a percentage",
    sources: [
      { key: "heavy", weight: 250, demand: 900 },
      { key: "light", weight: 100, demand: 900 },
    ],
    total: 700,
  },
  {
    name: "weight 0 starves without disabling",
    sources: [
      { key: "on", weight: 100, demand: 500 },
      { key: "off", weight: 0, demand: 500 },
    ],
    total: 400,
  },
  {
    name: "all weights zero falls back to an even split",
    sources: [
      { key: "a", weight: 0, demand: 900 },
      { key: "b", weight: 0, demand: 900 },
    ],
    total: 500,
  },
  {
    name: "budget smaller than total demand: the cap binds",
    sources: [
      { key: "a", weight: 100, demand: 900 },
      { key: "b", weight: 100, demand: 900 },
      { key: "c", weight: 100, demand: 900 },
      { key: "d", weight: 100, demand: 900 },
    ],
    total: 100,
  },
  {
    name: "real registry: six sources, supply below slices (what sync just did)",
    sources: [
      { key: "arbeitnow", weight: 100, demand: 278 },
      { key: "ashby:ashby", weight: 100, demand: 62 },
      { key: "greenhouse:figma", weight: 100, demand: 162 },
      { key: "greenhouse:stripe", weight: 100, demand: 715 },
      { key: "remoteok", weight: 100, demand: 99 },
      { key: "remotive", weight: 100, demand: 17 },
    ],
    total: 6000,
  },
  {
    name: "same registry but one source given 10x weight and a bigger feed",
    sources: [
      { key: "arbeitnow", weight: 100, demand: 278 },
      { key: "ashby:ashby", weight: 100, demand: 62 },
      { key: "greenhouse:figma", weight: 100, demand: 162 },
      { key: "greenhouse:stripe", weight: 1000, demand: 4000 },
      { key: "remoteok", weight: 100, demand: 99 },
      { key: "remotive", weight: 100, demand: 17 },
    ],
    total: 1500,
  },
];

let failures = 0;

for (const testCase of cases) {
  const allocation = allocateBudget(testCase.sources, testCase.total);
  const sum = [...allocation.values()].reduce((a, b) => a + b, 0);

  const violations: string[] = [];
  if (sum > testCase.total) violations.push(`over budget: ${sum} > ${testCase.total}`);
  for (const source of testCase.sources) {
    const got = allocation.get(source.key) ?? 0;
    if (got < 0) violations.push(`${source.key} negative`);
    if (got > source.demand) violations.push(`${source.key} got ${got} > demand ${source.demand}`);
  }

  // The invariant that catches both bugs this script was written for: allocation
  // must be maximal. A weight of 0 starves a source by design, so a source only
  // counts as reachable if it has a positive weight — unless every weight is zero,
  // where the even-split fallback makes them all reachable.
  const anyPositiveWeight = testCase.sources.some((s) => s.weight > 0);
  const reachable = testCase.sources
    .filter((s) => (anyPositiveWeight ? s.weight > 0 : true) && s.demand > 0)
    .reduce((total, s) => total + s.demand, 0);
  const expected = Math.min(testCase.total, reachable);
  if (sum !== expected) {
    violations.push(`budget wasted: allocated ${sum} but ${expected} was reachable within ${testCase.total}`);
  }

  const parts = testCase.sources.map((s) => `${s.key}(w${s.weight},d${s.demand})=${allocation.get(s.key) ?? 0}`);
  const status = violations.length ? "FAIL" : "ok  ";
  if (violations.length) failures++;
  console.log(`  ${status} ${testCase.name}\n       ${parts.join("  ")}  | sum ${sum}/${testCase.total}`);
  for (const violation of violations) console.log(`       !! ${violation}`);
}

console.log(failures ? `\n${failures} case(s) violated an invariant` : "\nall cases hold: never over budget, never above demand");
process.exitCode = failures ? 1 : 0;
