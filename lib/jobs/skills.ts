import { slugifySkill } from "./normalize";

type SkillEntry = {
  slug: string;
  label: string;
  require?: RegExp;
};

const VOCABULARY: SkillEntry[] = [
  { slug: "python", label: "Python" },
  { slug: "javascript", label: "JavaScript" },
  { slug: "typescript", label: "TypeScript" },
  { slug: "java", label: "Java" },
  { slug: "kotlin", label: "Kotlin" },
  { slug: "swift", label: "Swift" },
  { slug: "c", label: "C", require: /\b(in|with|using)\s+c\b|\bc\s*(programming|language)\b|\bc\s*\/\s*c\+\+|\bansi\s+c\b/i },
  { slug: "c++", label: "C++" },
  { slug: "c#", label: "C#", require: /\bc#|\bcsharp\b|\.net\b|\basp\.net\b/i },
  { slug: "rust", label: "Rust" },
  { slug: "go", label: "Go", require: /\bgolang\b|\bgo\s+(lang|developer|engineer|programmer)/i },
  { slug: "ruby", label: "Ruby" },
  { slug: "php", label: "PHP" },
  { slug: "scala", label: "Scala" },
  { slug: "r", label: "R", require: /\br\s+(language|programmer|shiny|script|package)|\brstudio\b|\br\s+dashboard|\bposit\b/i },
  { slug: "sql", label: "SQL" },
  { slug: "bash", label: "Bash" },

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

  { slug: "aws", label: "AWS" },
  { slug: "gcp", label: "Google Cloud" },
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

const COMPILED = VOCABULARY.map((entry) => ({
  ...entry,
  pattern: new RegExp(`(?<![a-z0-9+#])${escape(entry.slug)}(?![a-z0-9+#])`, "i"),
  labelPattern: entry.label.includes(" ")
    ? new RegExp(`(?<![a-z0-9+#])${escape(entry.label)}(?![a-z0-9+#])`, "i")
    : null,
}));

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSkills(
  ...texts: (string | null | undefined)[]
): { slug: string; label: string }[] {
  const text = texts.filter(Boolean).join(" \n ").slice(0, 4000);
  if (!text.trim()) return [];

  const found: { slug: string; label: string }[] = [];
  for (const entry of COMPILED) {
    const hit = entry.pattern.test(text) || entry.labelPattern?.test(text);
    if (!hit) continue;
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
