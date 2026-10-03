import "dotenv/config";
import { prisma } from "../lib/db";

/**
 * Inspect and tune the ingestion registry.
 *
 *   npm run jobs:sources
 *   npm run jobs:sources -- set arbeitnow weight=250
 *   npm run jobs:sources -- set greenhouse:stripe enabled=false
 *   npm run jobs:sources -- add greenhouse:vercel --token vercel --ttl 30
 *
 * Share is a ratio, not a percentage: six sources left at the default weight of
 * 100 each ingest six equal slices of `SYNC_ROW_BUDGET`, and raising one source
 * to 250 while the others stay at 100 gives it roughly two and a half times
 * their slice. The budget is only spent on rows a feed can actually supply, so a
 * source whose feed is smaller than its slice simply hands the remainder back.
 */

const FIELDS = {
  weight: "weight",
  ttl: "ttlDays",
  ttldays: "ttlDays",
  enabled: "enabled",
  entrylevelonly: "entryLevelOnly",
  label: "label",
  note: "note",
} as const;

type Field = (typeof FIELDS)[keyof typeof FIELDS];

const NUMERIC = new Set<Field>(["weight", "ttlDays"]);
const BOOLEAN = new Set<Field>(["enabled", "entryLevelOnly"]);

async function list(): Promise<void> {
  const sources = await prisma.ingestSource.findMany({ orderBy: { key: "asc" } });

  const rows = await prisma.opportunity.groupBy({ by: ["source"], _count: { _all: true } });
  const countBy = new Map(rows.map((row) => [row.source, row._count._all]));

  const live = await prisma.opportunity.count();
  const weighted = sources.filter((s) => s.enabled);
  const weightSum = weighted.reduce((sum, s) => sum + Math.max(0, s.weight), 0) || 1;
  const budget = Number(process.env.SYNC_ROW_BUDGET) || 6000;

  const pad = (value: string | number, width: number) => String(value).padEnd(width);
  const num = (value: string | number, width: number) => String(value).padStart(width);

  console.log(
    `${pad("key", 22)} ${pad("kind", 11)} ${pad("token", 14)} ${num("w", 5)} ${num("ttl", 5)} ` +
      `${pad("entry", 6)} ${pad("on", 4)} ${num("rows", 7)} ${num("share%", 7)} ${num("slice", 6)}`,
  );
  for (const source of sources) {
    const rows = countBy.get(source.key) ?? 0;
    const share = live ? (100 * rows) / live : 0;
    const slice = source.enabled
      ? Math.floor((budget * Math.max(0, source.weight)) / weightSum)
      : 0;
    console.log(
      `${pad(source.key, 22)} ${pad(source.kind, 11)} ${pad(source.boardToken ?? "-", 14)} ` +
        `${num(source.weight, 5)} ${num(source.ttlDays, 5)} ${pad(source.entryLevelOnly ? "yes" : "-", 6)} ` +
        `${pad(source.enabled ? "yes" : "no", 4)} ${num(rows, 7)} ${num(share.toFixed(1), 7)} ${num(slice, 6)}`,
    );
  }
  console.log(`\n${live} rows total, budget ${budget} across ${weighted.length} enabled sources.`);

  const expiring = await prisma.opportunity.count({
    where: { ttlExpiresAt: { lt: new Date() } },
  });
  const dated = await prisma.opportunity.count({ where: { NOT: { ttlExpiresAt: null } } });
  console.log(`${dated} rows carry a TTL; ${expiring} are past it and will be swept on the next sync.`);
}

async function set(args: string[]): Promise<void> {
  const [key, ...assignments] = args;
  if (!key || !assignments.length) {
    throw new Error("usage: jobs:sources set <key> <field>=<value> [...]");
  }

  const data: Record<string, string | number | boolean> = {};
  for (const assignment of assignments) {
    const separator = assignment.indexOf("=");
    if (separator === -1) throw new Error(`expected field=value, got "${assignment}"`);
    const field = FIELDS[assignment.slice(0, separator).trim().toLowerCase() as keyof typeof FIELDS];
    if (!field) throw new Error(`unknown field "${assignment.slice(0, separator)}"`);
    const value = assignment.slice(separator + 1).trim();

    if (NUMERIC.has(field)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${field} must be a number, got "${value}"`);
      if (field === "weight" && parsed < 0) throw new Error("weight cannot be negative");
      if (field === "ttlDays" && parsed < 1) throw new Error("ttlDays must be at least 1");
      data[field] = Math.floor(parsed);
    } else if (BOOLEAN.has(field)) {
      const normalized = value.toLowerCase();
      if (normalized !== "true" && normalized !== "false") {
        throw new Error(`${field} must be true or false, got "${value}"`);
      }
      data[field] = normalized === "true";
    } else {
      data[field] = value;
    }
  }

  const updated = await prisma.ingestSource.updateMany({ where: { key }, data });
  if (!updated.count) throw new Error(`no source with key "${key}"`);
  console.log(`updated ${key}: ${JSON.stringify(data)}`);
}

async function add(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) throw new Error("usage: jobs:sources add <key> [--token t] [--ttl n] [--weight n] [--ats]");

  const flag = (name: string): string | null => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1] ?? null;
  };

  const token = flag("--token");
  const isAts = args.includes("--ats") || token !== null;

  await prisma.ingestSource.upsert({
    where: { key },
    create: {
      key,
      kind: isAts ? "ATS" : "AGGREGATOR",
      boardToken: token,
      ttlDays: Number(flag("--ttl")) || 30,
      weight: Number(flag("--weight")) || 100,
    },
    update: {},
  });
  console.log(`present: ${key}${token ? ` (board ${token})` : ""}`);
}

async function main(): Promise<void> {
  const [command = "list", ...args] = process.argv.slice(2);

  if (command === "list") await list();
  else if (command === "set") await set(args);
  else if (command === "add") await add(args);
  else throw new Error(`unknown command "${command}" (expected list, set or add)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
