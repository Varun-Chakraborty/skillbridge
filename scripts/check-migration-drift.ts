import "dotenv/config";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Verifies that the database `DATABASE_URL` points at matches `prisma/schema.prisma`.
 *
 * `prisma migrate deploy` only reports whether it could apply what was pending.
 * It never tells you the result landed on the shape the datamodel describes, so
 * a migration that succeeds and is nonetheless wrong — a mistyped type, a
 * forgotten NOT NULL, an index on the wrong column — passes silently and is
 * discovered later as a query error against production.
 *
 * This closes that gap in the only direction worth automating: applied schema
 * versus desired schema, on the real database, after every deploy. It is a
 * read-only comparison, so it is safe to run against production and cheap
 * enough to run on every push.
 *
 * Run after `prisma migrate deploy`, never instead of it.
 */
function main(): void {
  if (!process.env.DATABASE_URL) {
    console.error("check-migration-drift: DATABASE_URL is not set.");
    process.exit(1);
  }

  // Resolved directly rather than through `npx` so a missing install fails with
  // this message rather than npx silently fetching a different Prisma version
  // and comparing against a different schema dialect.
  const prisma = resolve("node_modules/.bin/prisma");
  if (!existsSync(prisma)) {
    console.error(`check-migration-drift: no prisma binary at ${prisma} — run \`npm ci\` first.`);
    process.exit(1);
  }

  const result = spawnSync(
    prisma,
    [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    { encoding: "utf8" },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.status === 0) {
    console.log("check-migration-drift: no drift — the database matches prisma/schema.prisma.");
    return;
  }

  // `--exit-code` reserves 2 for "the diff is not empty", i.e. actual drift.
  // Every other non-zero status means the comparison never ran, and reporting
  // that as drift would send someone hunting a schema problem that is not there.
  if (result.status === 2) {
    console.error("check-migration-drift: DRIFT — the database does not match prisma/schema.prisma.");
    console.error(output);
    process.exit(1);
  }

  console.error(`check-migration-drift: \`prisma migrate diff\` failed (exit ${result.status}).`);
  console.error(output);
  process.exit(1);
}

main();
