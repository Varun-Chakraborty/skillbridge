import { slugifySkill } from "./normalize";

type SkillEntry = {
  slug: string;
  label: string;
  /**
   * Other ways this skill gets written. Needed whenever the common spelling is
   * not the slug: "postgres" is what people type and what job descriptions say,
   * while the slug has to stay stable at "postgresql".
   */
  aliases?: string[];
  /**
   * Guards against a bare slug matching something unrelated. A slug that only
   * appears in real phrases (a language, a licence class, a place) needs one.
   */
  require?: RegExp;
};

const VOCABULARY: SkillEntry[] = [
  { slug: "python", label: "Python" },
  { slug: "javascript", label: "JavaScript" },
  { slug: "typescript", label: "TypeScript" },
  { slug: "java", label: "Java" },
  { slug: "kotlin", label: "Kotlin" },
  { slug: "swift", label: "Swift" },
  // A single letter needs its context, but the context has to cover the ways
  // people actually write it: "used C", "in C", "C developer", "C/C++".
  { slug: "c", label: "C", require: /\b(in|with|using|used|wrote|built|program(me|ming)?(s)?\s+in)\s+c\b|\bc\s*(programming|language|developer|engineer)\b|\bc\s*\/\s*c\+\+|\bansi\s+c\b/i },
  { slug: "c++", label: "C++" },
  { slug: "c#", label: "C#", require: /\bc#|\bcsharp\b|\.net\b|\basp\.net\b/i },
  // "Rust belt" is a region, not the language, and a CV or a job post is exactly
  // the kind of text that mentions where someone is from.
  {
    slug: "rust",
    label: "Rust",
    aliases: ["cargo", "rustacean", "rs"],
    require: /\brust\b(?!\s*belt)|\bcargo\b|\brustacean\b|\bcrate\b/i,
  },
  // "golang" is the only unambiguous spelling of the language; plain "go" is
  // far too common an English word to match on its own.
  {
    slug: "go",
    label: "Go",
    aliases: ["golang"],
    require: /\bgolang\b|\bgo\s+(lang|language|developer|engineer|programmer)/i,
  },
  { slug: "ruby", label: "Ruby" },
  { slug: "php", label: "PHP" },
  { slug: "scala", label: "Scala" },
  // "RStudio" is one word, so the guard accepts it without a separator.
  { slug: "r", label: "R", require: /\br\s+(language|programmer|shiny|script|package|dashboard)|\brstudio\b|\bposit\b|\br\s+programming/i },
  { slug: "rstudio", label: "RStudio" },
  { slug: "sql", label: "SQL" },
  { slug: "bash", label: "Bash" },
  {
    slug: "postgresql",
    label: "PostgreSQL",
    aliases: ["postgres", "psql"],
  },
  { slug: "mysql", label: "MySQL" },
  { slug: "mongodb", label: "MongoDB" },
  { slug: "redis", label: "Redis" },
  { slug: "sqlite", label: "SQLite" },

  { slug: "react", label: "React" },
  { slug: "nextjs", label: "Next.js" },
  { slug: "vue", label: "Vue" },
  { slug: "svelte", label: "Svelte" },
  { slug: "angular", label: "Angular" },
  { slug: "node", label: "Node.js" },
  { slug: "django", label: "Django" },
  { slug: "flask", label: "Flask" },
  { slug: "rails", label: "Ruby on Rails" },
  { slug: "spring", label: "Spring" },
  { slug: "graphql", label: "GraphQL" },
  {
    slug: "rest",
    label: "REST APIs",
    require: /\brest[\s-]?(api|apis|endpoint|endpoints|service|services|client)\b|\brestful\b/i,
  },

  { slug: "aws", label: "AWS", aliases: ["amazon web services"] },
  {
    slug: "gcp",
    label: "Google Cloud",
    aliases: ["google cloud platform", "google cloud"],
  },
  { slug: "azure", label: "Azure" },
  { slug: "docker", label: "Docker" },
  { slug: "kubernetes", label: "Kubernetes" },
  { slug: "terraform", label: "Terraform" },
  { slug: "linux", label: "Linux" },
  { slug: "git", label: "Git" },

  { slug: "machine-learning", label: "Machine Learning" },
  { slug: "deep-learning", label: "Deep Learning" },
  { slug: "pytorch", label: "PyTorch" },
  { slug: "tensorflow", label: "TensorFlow" },
  { slug: "nlp", label: "NLP" },
  { slug: "computer-vision", label: "Computer Vision" },
  { slug: "llm", label: "LLMs" },
  { slug: "data-science", label: "Data Science" },
  { slug: "data-analysis", label: "Data Analysis" },
  { slug: "pandas", label: "Pandas" },
  { slug: "spark", label: "Spark" },

  { slug: "figma", label: "Figma" },
  { slug: "sketch", label: "Sketch" },
  { slug: "adobe", label: "Adobe" },
  { slug: "ux", label: "UX Design" },
  { slug: "ui", label: "UI Design" },
  { slug: "design-systems", label: "Design Systems" },
  { slug: "prototyping", label: "Prototyping" },
  { slug: "user-research", label: "User Research" },
  { slug: "accessibility", label: "Accessibility" },

  { slug: "product-management", label: "Product Management" },
  { slug: "project-management", label: "Project Management" },
  { slug: "agile", label: "Agile" },

  { slug: "postman", label: "Postman" },
  { slug: "cypress", label: "Cypress" },
  { slug: "jest", label: "Jest" },
  { slug: "playwright", label: "Playwright" },

  { slug: "excel", label: "Excel" },
  { slug: "tableau", label: "Tableau" },
  { slug: "powerbi", label: "Power BI" },
  { slug: "looker", label: "Looker" },
];


function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-bounded matcher, so "git" does not match inside "digital". */
function wordPattern(value: string): RegExp {
  return new RegExp(`(?<![a-z0-9+#])${escape(value)}(?![a-z0-9+#])`, "i");
}

const COMPILED = VOCABULARY.map((entry) => ({
  ...entry,
  // Every spelling we accept, matched independently so one cannot mask
  // another. The label counts as a spelling in its own right because it often
  // differs from the slug: "nextjs" and "Next.js" are the same skill written
  // two ways, and keying only off the space silently dropped every dotted
  // label like Next.js, Node.js and Power BI.
  patterns: [entry.slug, entry.label, ...(entry.aliases ?? [])]
    .filter((value, index, all) => all.indexOf(value) === index)
    .map(wordPattern),
}));

export function extractSkills(
  ...texts: (string | null | undefined)[]
): { slug: string; label: string }[] {
  const text = texts.filter(Boolean).join(" \n ").slice(0, 4000);
  if (!text.trim()) return [];

  const found: { slug: string; label: string }[] = [];
  for (const entry of COMPILED) {
    if (!entry.patterns.some((pattern) => pattern.test(text))) continue;
    // The context guard is checked against the whole text rather than the
    // matched fragment, so an ambiguous slug needs the surrounding phrase
    // somewhere in the document to count.
    if (entry.require && !entry.require.test(text)) continue;
    found.push({ slug: entry.slug, label: entry.label });
  }
  return found;
}

export function skillsForOpportunity(job: {
  title: string;
  description: string | null;
  tags: string[];
}): { slug: string; label: string }[] {
  const fromText = extractSkills(job.title, job.description);

  const bySlug = new Map(fromText.map((skill) => [skill.slug, skill]));
  for (const tag of job.tags) {
    const slug = slugifySkill(tag);
    for (const entry of COMPILED) {
      if (entry.slug === slug && !bySlug.has(slug)) {
        bySlug.set(slug, { slug: entry.slug, label: entry.label });
      }
    }
  }

  return [...bySlug.values()];
}

export function knownSkills(): { slug: string; label: string }[] {
  return VOCABULARY.map(({ slug, label }) => ({ slug, label }));
}
