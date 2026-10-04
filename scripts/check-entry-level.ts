import { isEntryLevel } from "../lib/jobs/relevance";
import type { OpportunityKind } from "../lib/jobs/normalize";

/**
 * Gate for the entry-level filter.
 *
 * Every source in the registry now runs through `isEntryLevel`, so a change to
 * the pattern is no longer a tweak to one aggregator's rows — it decides what
 * the entire hub shows. Each case below pins one decision and says in `why` what
 * it is protecting, so a future edit that flips a case explains itself against
 * the intent rather than against the previous output.
 *
 * The cases that matter most are the ordering ones near the end: the veto is
 * deliberately allowed to overrule an upstream INTERNSHIP label and an
 * "Internships" team tag, and those are exactly the assertions a reader would
 * assume are wrong.
 */

type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERNSHIP"
  | "VOLUNTEER"
  | "OTHER";

type Case = {
  name: string;
  title: string;
  tags?: string[];
  employmentType?: EmploymentType;
  /**
   * Defaults to JOB. Stated rather than cast because this gate previously built
   * its argument with `as Parameters<typeof isEntryLevel>[0]`, which type-checked
   * while leaving `kind` undefined at runtime — so the kind could be dropped from
   * the call and no case would notice.
   */
  kind?: OpportunityKind;
  expect: boolean;
  why: string;
};

const cases: Case[] = [
  // --- events: admitted on kind, before the title is read --------------------
  // These are the cases that justified keying the exemption off `kind`. Devpost
  // titles are marketing copy and Unstop's are institution names, so there is no
  // entry-level word to find and no reason to look: a hackathon or a conference
  // is student-appropriate by construction.
  {
    name: "hackathon with no entry-level word in its title",
    title: "Build, Ship, Shape: Amazon Developer Hackathon",
    kind: "HACKATHON",
    expect: true,
    why: "Devpost titles are marketing copy; 'intern' was never going to appear",
  },
  {
    name: "hackathon titled after a rank word",
    title: "Lead Generation Hackathon",
    kind: "HACKATHON",
    expect: true,
    why: "'Lead' here means marketing, not seniority — an event has no senior tier",
  },
  {
    name: "conference whose title names a senior role",
    title: "Senior Leadership Summit",
    kind: "CONFERENCE",
    expect: true,
    why: "the audience is senior, but the row is still an event a student can attend",
  },
  {
    name: "workshop with an empty title vocabulary",
    title: "Introduction to Vector Databases",
    kind: "WORKSHOP",
    tags: [],
    expect: true,
    why: "no tags and no keywords, so a kind check is the only thing that can admit it",
  },
  {
    name: "event ignores a veto word it happens to contain",
    title: "Director of Engineering, a one-day workshop",
    kind: "WORKSHOP",
    employmentType: "FULL_TIME",
    expect: true,
    why: "the veto must not run on an event — the word describes a speaker, not the role",
  },
  {
    name: "a job is not rescued by having a hackathon-shaped title",
    title: "Lead Generation Hackathon Engineer",
    kind: "JOB",
    expect: false,
    why: "the exemption is on kind, not on the title happening to contain a word",
  },
  // --- accepted: the vocabulary a student hub is actually for -----------------
  {
    name: "plain internship",
    title: "Software Engineering Intern",
    expect: true,
    why: "the base case",
  },
  {
    name: "fellow, the bare form, which the pattern was missing",
    title: "Machine Learning Research Fellow",
    tags: ["AI/ML"],
    expect: true,
    why: "'Research Fellow' is the more common title spelling than 'Fellowship'",
  },
  {
    name: "fellowship",
    title: "Data Science Fellowship",
    expect: true,
    why: "asked for by name; a fellowship is student work",
  },
  {
    name: "fellowship plural",
    title: "Data Science Fellowships",
    expect: true,
    why: "plural forms appear in bulk-posted listings",
  },
  {
    name: "fellow, plural",
    title: "Policy Fellows, Spring Cohort",
    expect: true,
    why: "as above",
  },
  {
    name: "co-op",
    title: "Backend Engineer Co-op",
    expect: true,
    why: "US term for a term-long placement",
  },
  {
    name: "co-op without hyphen",
    title: "Systems Analyst Coop",
    expect: true,
    why: "boards write it both ways",
  },
  {
    name: "UK student placement",
    title: "Marketing Placement Student",
    expect: true,
    why: "British boards call a placement year this",
  },
  {
    name: "working student",
    title: "Working Student — Backend",
    expect: true,
    why: "the British and Dutch boards' term",
  },
  {
    name: "graduate",
    title: "Graduate Software Engineer",
    expect: true,
    why: "new-graduate scheme",
  },
  {
    name: "new grad",
    title: "New Grad Engineer, Platform",
    expect: true,
    why: "hyphen and space variants both occur",
  },
  {
    name: "junior",
    title: "Junior Designer",
    expect: true,
    why: "junior is the clearest signal there is",
  },
  {
    name: "apprentice",
    title: "Apprentice Software Developer",
    expect: true,
    why: "UK apprenticeships are student-scale",
  },
  {
    name: "trainee",
    title: "Trainee Consultant",
    expect: true,
    why: "graduate schemes labelled trainee",
  },
  {
    name: "German praktikum",
    title: "Praktikum Softwareentwicklung",
    expect: true,
    why: "real internship, not English spelling",
  },
  {
    name: "German werkstudent",
    title: "Werkstudent Backend",
    expect: true,
    why: "working-student contract in Germany",
  },
  {
    name: "Pflichtpraktikum, a compound with no word boundary",
    title: "Pflichtpraktikum Online Marketing Manager (m/w/d)",
    expect: true,
    why: "German compounds concatenate nouns, so \\bpraktikum\\b cannot match; this was hiding 10 production rows",
  },
  {
    name: "Werkstudenten, the plural",
    title: "Werkstudenten (m/w/d)",
    expect: true,
    why: "the plural compounds the same way",
  },
  {
    name: "Werkstudentenstelle, a further derivative",
    title: "TikTok Content Creator & Video Editor (m/w/d), Werkstudentenstelle",
    expect: true,
    why: "and so does the -stelle form, with the student role only in the tag half of the title",
  },
  {
    name: "Portuguese estagi",
    title: "Estagio Marketing",
    expect: true,
    why: "internship in Brazil and Portugal",
  },
  {
    name: "French stagiaire",
    title: "Stagiaire Marketing",
    expect: true,
    why: "internship in France",
  },
  {
    name: "French stage",
    title: "Stage en communication",
    expect: true,
    why: "the bare French word for a placement",
  },
  {
    name: "associate, where the word is the entry track",
    title: "Associate Analyst, Corporate Banking",
    expect: true,
    why: "at banks and consultancies this is the junior role, so the veto must not catch it",
  },

  // --- accepted: signals other than the title --------------------------------
  {
    name: "employment type says internship",
    title: "Software Engineer",
    employmentType: "INTERNSHIP",
    expect: true,
    why: "the source labelled this specific posting",
  },
  {
    name: "Interns team with a title that says nothing",
    title: "Software Engineer",
    tags: ["Internships"],
    expect: true,
    why: "the Lever case that motivated reading categories at all: no signal in the title",
  },
  {
    name: "Internships team, differently cased and padded",
    title: "Software Engineer",
    tags: ["  INTERNSHIPS  "],
    expect: true,
    why: "the pattern is case-insensitive, so casing and stray spacing do not matter",
  },
  {
    name: "term found in a tag, not the title",
    title: "Engineer, Platform",
    tags: ["Engineering", "Internship Program"],
    expect: true,
    why: "teams carry the signal when titles are generic",
  },
  {
    name: "intern in the title wins before the veto is consulted",
    title: "Software Engineer Intern",
    tags: ["Senior Payments Team", "Engineering"],
    expect: true,
    why: "the student-program tier decides this one, which is why it outranks a rank word",
  },
  {
    name: "senior word in a tag must not veto",
    title: "Data Analyst",
    tags: ["Senior Payments Team", "Internship Program"],
    expect: true,
    why: "the title carries no student-program word, so this genuinely reaches the veto — and teams really are named things like 'Senior Payments Team'",
  },
  {
    name: "architect in a tag must not veto",
    title: "Data Analyst",
    tags: ["Platform Architecture", "Placement Student"],
    expect: true,
    why: "same reason: 'Architecture' is a department, not a rank",
  },

  // --- rejected: no student signal at all ------------------------------------
  {
    name: "plain senior posting",
    title: "Senior Software Engineer",
    expect: false,
    why: "no entry-level term anywhere",
  },
  {
    name: "plain posting with no signal",
    title: "Software Engineer",
    tags: ["Engineering"],
    expect: false,
    why: "the largest group in any feed; must not leak through",
  },
  {
    name: "engineering management",
    title: "Engineering Manager",
    expect: false,
    why: "senior",
  },
  {
    name: "staff engineer",
    title: "Staff Engineer",
    expect: false,
    why: "senior by another name; no entry term to match on anyway",
  },
  {
    name: "director",
    title: "Director of Engineering",
    expect: false,
    why: "senior",
  },
  {
    name: "head of",
    title: "Head of Product",
    expect: false,
    why: "senior",
  },
  {
    name: "tech lead",
    title: "Tech Lead, Platform",
    expect: false,
    why: "'lead' is only matched as a whole word, and 'Leadership' never matches",
  },
  {
    name: "principal",
    title: "Principal Engineer",
    expect: false,
    why: "senior",
  },
  {
    name: "chief",
    title: "Chief Technology Officer",
    expect: false,
    why: "senior",
  },
  {
    name: "vice president",
    title: "Vice President, Engineering",
    expect: false,
    why: "senior",
  },
  {
    name: "vp abbreviation",
    title: "VP of Design",
    expect: false,
    why: "the abbreviated form, word-bounded so it cannot match inside another word",
  },
  {
    name: "architect",
    title: "Software Architect",
    expect: false,
    why: "senior",
  },
  {
    name: "partner",
    title: "Partner, Corporate Finance",
    expect: false,
    why: "the Google-style senior title",
  },

  // --- rejected: the veto overrules an entry-level term ----------------------
  // These are the two rows that came in from lever:matchgroup and motivated the
  // veto existing at all.
  {
    name: "Associate Manager",
    title: "Associate Manager, Culture & Content",
    tags: ["Marketing"],
    expect: false,
    why: "'associate' matched but the role manages people",
  },
  {
    name: "Senior Associate",
    title: "Senior Associate, Tax Reporting & Compliance",
    tags: ["Finance"],
    expect: false,
    why: "'associate' matched but the title says senior first",
  },
  {
    name: "Associate Director",
    title: "Associate Director, Engineering",
    expect: false,
    why: "same shape as Associate Manager",
  },
  {
    name: "Sr. abbreviation",
    title: "Sr. Product Manager",
    expect: false,
    why: "the abbreviated form, with the period",
  },
  {
    name: "Graduate Manager",
    title: "Graduate Manager",
    expect: false,
    why: "bare 'graduate' means 'has graduated' too often to outrank 'manager'; measured at 3 rows against the internships the student-program tier keeps",
  },
  {
    name: "Graduate Operations Supervisor, the real one",
    title: "Graduate Operations Supervisor (m/w/d)",
    expect: false,
    why: "the documented cost of the call above, asserted so it stays visible rather than becoming folklore",
  },

  // --- rejected: the veto overrules an upstream label ------------------------
  // Deliberate, and the reason the veto runs first. See the comment in
  // relevance.ts: feeds do get commitment wrong, and the guarantee that no
  // senior-titled posting reaches a student is worth more than the exceptions.
  {
    name: "senior title labelled INTERNSHIP by the feed",
    title: "Senior Platform Engineer",
    employmentType: "INTERNSHIP",
    expect: false,
    why: "the veto outranks an upstream employment type on purpose",
  },
  {
    name: "manager sitting in the Internships team",
    title: "Engineering Manager",
    tags: ["Internships"],
    expect: false,
    why: "a team name is a property of the team, not of the role",
  },
  {
    name: "head of internships, in the Internships team",
    title: "Head of Internships",
    tags: ["Internships"],
    expect: true,
    why: "the accepted cost of the student-program tier outranking the veto: the title names Internships, so it is let through. One cosmetic row against the internships the tier protects.",
  },

  // --- accepted: a student-program word outranks a rank word ------------------
  // These are the 43 rows the first version of the veto lost, measured against
  // 2,139 stored rows. Applying the veto uniformly hid real internships, which is
  // the exact failure the veto was written to prevent, just in the other
  // direction.
  {
    name: "Product Manager Intern",
    title: "Product Manager Intern",
    tags: ["Product"],
    expect: true,
    why: "no company titles a senior role Intern; the word decides, the role does not",
  },
  {
    name: "Junior Product Manager",
    title: "Junior Product Manager (m/f/d)",
    expect: true,
    why: "'junior' names a level as a definition, so it outranks 'manager'",
  },
  {
    name: "Junior Solution Architect",
    title: "Junior Solution Architect DACH",
    expect: true,
    why: "same, against 'architect'",
  },
  {
    name: "New Grad Accelerator in front of a rank word",
    title: "Product Manager: New Grad Accelerator",
    tags: ["Engineering"],
    expect: true,
    why: "Stripe's graduate programme, which the first version of the veto hid",
  },

  // --- boundaries ------------------------------------------------------------
  {
    name: "International is not an intern word",
    title: "Software Engineer",
    tags: ["International"],
    expect: false,
    why: "'intern' is word-bounded, so it cannot match inside 'International'",
  },
  {
    name: "backstage is not a French stage",
    title: "Backstage Crew",
    expect: false,
    why: "'stage' is word-bounded too",
  },
  {
    name: "a tag containing an entry word is enough",
    title: "Engineer",
    tags: ["Internships Operations"],
    expect: true,
    why: "the haystack is matched word-by-word, not as an exact team name; a posting under a team that runs internships is student-eligible",
  },
  {
    name: "gradient descent is not a grad role",
    title: "Machine Learning Engineer",
    tags: ["Gradient"],
    expect: false,
    why: "'grad' is word-bounded, so it cannot match inside 'Gradient'",
  },
];

let failures = 0;

for (const testCase of cases) {
  const job = {
    kind: testCase.kind ?? "JOB",
    title: testCase.title,
    tags: testCase.tags ?? [],
    employmentType: testCase.employmentType ?? "OTHER",
  } satisfies Parameters<typeof isEntryLevel>[0];

  const actual = isEntryLevel(job);
  if (actual !== testCase.expect) {
    failures += 1;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`        kind:  ${job.kind}`);
    console.log(`        title: ${JSON.stringify(testCase.title)}`);
    console.log(`        tags:  ${JSON.stringify(job.tags)}`);
    console.log(`        type:  ${job.employmentType}`);
    console.log(`        want ${testCase.expect}, got ${actual} — ${testCase.why}`);
  }
}

// The ordering that decides the contested cases, asserted separately so a
// refactor that satisfies every table case above by luck still cannot pass if
// the ordering itself changes. The student-program tier is deliberately absent
// from both: these titles contain no intern/fellow/junior/new-grad word, so
// nothing may rescue them.
function ordering(): string[] {
  const problems: string[] = [];

  const seniorLabelled = isEntryLevel({
    kind: "JOB",
    title: "Senior Platform Engineer",
    tags: ["Internships"],
    employmentType: "INTERNSHIP",
  });
  if (seniorLabelled) {
    problems.push(
      "a senior title survived every other signal naming it entry-level",
    );
  }

  const plainManager = isEntryLevel({
    kind: "JOB",
    title: "Engineering Manager",
    tags: ["Internships", "Associate"],
    employmentType: "INTERNSHIP",
  });
  if (plainManager) {
    problems.push(
      "a manager passed on tag and employment-type evidence alone",
    );
  }

  const seniorAssociate = isEntryLevel({
    kind: "JOB",
    title: "Senior Associate, Planning",
    tags: ["Finance", "Associate"],
    employmentType: "OTHER",
  });
  if (seniorAssociate) {
    problems.push(
      "the exact title that motivated the veto came back through",
    );
  }

  return problems;
}

for (const problem of ordering()) {
  failures += 1;
  console.log(`FAIL  ordering: ${problem}`);
}

const accepted = cases.filter((c) => c.expect).length;
console.log(
  `\n${cases.length} cases (${accepted} accept / ${cases.length - accepted} reject) + 3 ordering assertions`,
);
console.log(failures === 0 ? "all pass" : `${failures} failure(s)`);

if (failures > 0) process.exitCode = 1;