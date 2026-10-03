import "dotenv/config";
import type { NormalizedJob } from "../lib/jobs/normalize";
import { repairMojibake } from "../lib/jobs/encoding";

/**
 * Mojibake repair checks.
 *
 * The assertions that matter are the negatives. `repairMojibake` runs on every
 * string from every source, so a repair that fires on already-correct text would
 * silently corrupt the entire table — far worse than the handful of broken rows
 * it exists to fix. The round cases below are the guard against that.
 */

type Case = { input: string; expect: string; why: string };

const CASES: Case[] = [
  // The defect this exists for, verified against RemoteOK's live wire bytes,
  // which contain the literal escapes \u00c3\u00a1.
  {
    input: "MecÃ¡nico Automotriz DiagnÃ³stico y Presupuestos",
    expect: "Mecánico Automotriz Diagnóstico y Presupuestos",
    why: "RemoteOK's actual broken title: \u00e1 and \u00f3 read as CP1252",
  },
  {
    input: "Freelance grabaciÃ³n de tareas cotidianas para proyecto de IA",
    expect: "Freelance grabación de tareas cotidianas para proyecto de IA",
    why: "\u00f3 round-trips",
  },
  {
    input: "Buscamos un/a MecÃ¡nico/a Automotriz con experiencia",
    expect: "Buscamos un/a Mecánico/a Automotriz con experiencia",
    why: "inside a description, not just a title",
  },
  { input: "Ã©cole Polytechnique", expect: "école Polytechnique", why: "leading \u00c3 + continuation" },
  { input: "Ã¼ber", expect: "über", why: "\u00fc round-trips" },

  // Windows-1252 vs ISO-8859-1. These only work with the CP1252 0x80-0x9F block.
  { input: "donâ€™t", expect: "don’t", why: "â€™ is CP1252 0x92" },
  { input: "aâ€“b", expect: "a–b", why: "â€“ is CP1252 0x96" },
  { input: "â€œquotedâ€\u009d", expect: "“quoted”", why: "0x9D is a C1 control in WHATWG CP1252" },

  // Negatives: already-correct text must survive untouched. Every one of these
  // produced a wrong answer during development.
  {
    input: "(Senior) Consultant \u2013 Operational & Cyber Resilience",
    expect: "(Senior) Consultant \u2013 Operational & Cyber Resilience",
    why: "a real en-dash must not be read as a misread 0x96",
  },
  { input: "caf\u00e9 latte", expect: "café latte", why: "real \u00e9 is an invalid UTF-8 start byte" },
  { input: "Espa\u00f1ol a\u00f1ejo", expect: "Español añejo", why: "real ñ is an invalid UTF-8 start byte" },
  { input: "PLAIN ASCII job title", expect: "PLAIN ASCII job title", why: "ascii is its own inverse" },
  { input: "DevOps \u4e2d\u6587 engineer", expect: "DevOps 中文 engineer", why: "CJK cannot be mojibake" },
  { input: "react \u{1F680} role", expect: "react \u{1F680} role", why: "astral chars cannot be misread bytes" },
  
  { input: "", expect: "", why: "empty string" },

  // Mixed strings: mojibake and correctly-encoded accents in one value. One real
  // `é` contributes byte E9, an illegal UTF-8 start, which invalidates the
  // whole-string decode — so these need the segmented fallback.
  {
    input: "Youâ€™ll ship caf\u00E9 tooling",
    expect: "You’ll ship café tooling",
    why: "broken apostrophe beside a genuine é",
  },
  {
    input: "caf\u00E9 \u00F1 and MecÃ¡nico",
    expect: "café ñ and Mecánico",
    why: "correct accents must survive alongside the repair",
  },
  {
    input: "\u00C3\u00A9cole caf\u00E9 na\u00EFve",
    expect: "école café naïve",
    why: "one repair beside two correctly-encoded accents",
  },

  // Double-encoded: RemoteOK's `Online Bidder` description is misdecoded twice
  // upstream. One round leaves `MecÃ¡nico`, which is still mojibake, so the
  // repair has to keep going. Without this the audit reports text that sync has
  // just written, over and over.
  //
  // `Ã` is U+00C3, bytes C3 83, and CP1252 0x83 is `ƒ` (U+0192) — not a C1
  // control, which is what makes the second round exactly invertible.
  {
    input: "Mec\u00C3\u0192\u00C2\u00A1nico",
    expect: "Mecánico",
    why: "two rounds of upstream misdecoding, undone in one call",
  },

  // Idempotence, so re-running sync cannot decay a repaired row.
  {
    input: repairMojibake("MecÃ¡nico Automotriz"),
    expect: "Mecánico Automotriz",
    why: "repairing a repaired string is a no-op",
  },
  {
    input: repairMojibake("Youâ€™ll ship caf\u00E9 tooling"),
    expect: "You’ll ship café tooling",
    why: "idempotent on the segmented path too",
  },
];

let failures = 0;

for (const testCase of CASES) {
  const got = repairMojibake(testCase.input);
  if (got !== testCase.expect) {
    failures++;
    console.log(
      `  FAIL  ${JSON.stringify(testCase.input)}\n        got    ${JSON.stringify(got)}\n        expect ${JSON.stringify(testCase.expect)}\n        why: ${testCase.why}`,
    );
    continue;
  }

  // Every repaired value must be a fixed point. The earlier whole-string
  // implementation satisfied the assertions above and still failed this, which
  // is what let it rewrite already-correct text on every sync.
  const again = repairMojibake(got);
  if (again === got) continue;
  failures++;
  console.log(
    `  FAIL  not a fixed point: ${JSON.stringify(got)}\n        second pass ${JSON.stringify(again)}\n        why: ${testCase.why}`,
  );
}

// The negatives are the important half, so assert the property directly rather
// than relying on having read the case list correctly.
const UNTOUCHABLE = [
  "Ensenñanza del español",
  "Recherche d'ingénieur",
  "Überraschung für Grüße",
  "Café – crème brûlée",
  "Ελληνικά",
  "日本語のタイトル",
  "Software Engineer II",
];
for (const text of UNTOUCHABLE) {
  const got = repairMojibake(text);
  if (got === text) continue;
  failures++;
  console.log(`  FAIL  correct text was modified: ${JSON.stringify(text)} -> ${JSON.stringify(got)}`);
}

console.log(
  failures
    ? `\n${failures} of ${CASES.length + UNTOUCHABLE.length} encoding checks failed`
    : `\nall ${CASES.length + UNTOUCHABLE.length} encoding checks pass ` +
        `(${CASES.length} repair/refusal cases, ${UNTOUCHABLE.length} strings left untouched)`,
);

// Second phase: audit what is actually stored. Every row is re-upserted on each
// sync, so a source that starts serving mojibake shows up here within six hours
// rather than needing someone to notice garbled titles on the site. Exits non-zero
// if anything is still broken, which makes it usable as a post-sync gate.
async function audit(): Promise<void> {
  const { prisma } = await import("../lib/db");
  const rows = await prisma.opportunity.findMany({
    select: { source: true, title: true, company: true, location: true, description: true, tags: true },
  });

  const bySource = new Map<string, number>();
  const examples: string[] = [];

  for (const row of rows) {
    const fields: [string, string][] = [
      ["title", row.title],
      ...(row.company === null ? [] : ([["company", row.company]] as [string, string][])),
      ...(row.location === null ? [] : ([["location", row.location]] as [string, string][])),
      ...(row.description === null ? [] : ([["description", row.description]] as [string, string][])),
      ...row.tags.map((tag, i) => [`tag[${i}]`, tag] as [string, string]),
    ];
    const hits = fields.filter(([, value]) => repairMojibake(value) !== value);
    if (!hits.length) continue;

    bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    if (examples.length < 5) {
      const [name, before] = hits[0]!;
      examples.push(`    ${row.source} ${name}: ${JSON.stringify(before.slice(0, 50))} -> ${JSON.stringify(repairMojibake(before).slice(0, 50))}`);
    }
  }

  const total = [...bySource.values()].reduce((a, b) => a + b, 0);
  console.log(
    total === 0
      ? `stored data: 0 of ${rows.length} rows carry mojibake`
      : `stored data: ${total} of ${rows.length} rows carry mojibake`,
  );
  for (const [source, n] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`    ${source}: ${n}`);
  for (const example of examples) console.log(example);

  if (total > 0) {
    console.log("  (rows are repaired on their next sync; anything persisting past that is a bug)");
    failures++;
  }
  await prisma.$disconnect();
}

// Third phase: prove the safety claim against live feeds rather than only against
// hand-written cases. The segmented repair fires on any individually valid UTF-8
// sequence, which is a broader trigger than a whole-string round trip, so the
// evidence that it cannot corrupt correct text has to be measured.
//
// The invariant is asymmetric on purpose: sources known to publish correct text
// must come back with zero changes, and the one known-broken source must come
// back with changes. A repair that stopped working and a repair that started
// firing everywhere both fail this.
//
// A source that cannot be fetched counts as a failure rather than a skip. A skip
// would let this report success while checking nothing, which is exactly how the
// four correctly-encoded sources went unexamined while the check still exited 0.
function textFieldsOf(job: NormalizedJob): [string, string][] {
  return [
    ["title", job.title],
    ...(job.company === null ? [] : ([["company", job.company]] as [string, string][])),
    ...(job.location === null ? [] : ([["location", job.location]] as [string, string][])),
    ...(job.description === null ? [] : ([["description", job.description]] as [string, string][])),
    ...job.tags.map((tag, i) => [`tag[${i}]`, tag] as [string, string]),
  ];
}

async function corpus(): Promise<void> {
  const { fetchArbeitnow, fetchAshby, fetchGreenhouse, fetchRemotive, fetchRemoteok } = await import(
    "../lib/jobs/sources"
  );

  const sources: [string, () => Promise<NormalizedJob[]>, boolean][] = [
    ["arbeitnow", () => fetchArbeitnow(), false],
    ["remotive", () => fetchRemotive(), false],
    ["ashby", () => fetchAshby("ashby"), false],
    ["greenhouse", () => fetchGreenhouse("stripe"), false],
    ["remoteok", () => fetchRemoteok(), true],
  ];

  for (const [name, load, expectChanges] of sources) {
    let jobs: NormalizedJob[];
    try {
      jobs = await load();
    } catch (error) {
      failures++;
      console.log(`  FAIL ${name}: could not be fetched, so it was not checked`);
      console.log(`       ${error instanceof Error ? error.message : error}`);
      continue;
    }

    let strings = 0;
    const changed: string[] = [];
    for (const job of jobs) {
      for (const [field, value] of textFieldsOf(job)) {
        strings++;
        const repaired = repairMojibake(value);
        if (repaired !== value) changed.push(`${job.title.slice(0, 40)} ${field}`);
      }
    }

    const ok = expectChanges ? changed.length > 0 : changed.length === 0;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${name}: ${changed.length}/${strings} strings changed` +
        `${expectChanges ? " (expected some)" : " (expected none)"}`,
    );
    for (const sample of changed.slice(0, 3)) console.log(`      ${sample}`);
  }
}

async function main(): Promise<void> {
  const wantsAudit = process.argv.includes("--audit");
  const wantsCorpus = process.argv.includes("--corpus");

  if (!wantsAudit && !wantsCorpus) {
    process.exitCode = failures ? 1 : 0;
    return;
  }

  if (wantsAudit) {
    // `audit` contributes to the shared failure count rather than setting
    // `process.exitCode` itself, so that `main` cannot overwrite its verdict.
    await audit().catch((error) => {
      failures++;
      console.error(`audit failed to run: ${error instanceof Error ? error.message : error}`);
    });
  }

  if (wantsCorpus) {
    console.log("live corpus:");
    await corpus().catch((error) => {
      failures++;
      console.error(`  corpus check failed: ${error instanceof Error ? error.message : error}`);
    });
  }

  process.exitCode = failures ? 1 : 0;
}

// Top-level await does not survive this file being loaded as CommonJS.
void main();