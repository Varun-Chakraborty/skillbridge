-- Retention is materialized onto each row rather than resolved through a join
-- to the registry at sweep time, so expiry is one indexed range scan and a row
-- carries the policy it was last written under.
ALTER TABLE "Opportunity" ADD COLUMN     "ttlExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Opportunity_ttlExpiresAt_idx" ON "Opportunity"("ttlExpiresAt");

-- CreateEnum
CREATE TYPE "IngestSourceKind" AS ENUM ('ATS', 'AGGREGATOR');

-- CreateTable
CREATE TABLE "IngestSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "IngestSourceKind" NOT NULL,
    "label" TEXT,
    "boardToken" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "ttlDays" INTEGER NOT NULL DEFAULT 30,
    "entryLevelOnly" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestSource_key_key" ON "IngestSource"("key");

-- CreateIndex
CREATE INDEX "IngestSource_enabled_idx" ON "IngestSource"("enabled");

-- No foreign key from Opportunity.source to IngestSource.key, deliberately.
-- `Opportunity.source` is a free-form tag that predates the registry, rows are
-- meant to outlive the registry entry that produced them, and a row can be
-- written under a source that was never registered (the link-drift harness does
-- exactly this). A FK would reject those writes and would fail to apply at all
-- against a populated table whose registry starts empty. The registry is policy
-- looked up by key at sync time; nothing joins on it.

-- AlterTable
-- 12 MB across 1,721 local rows and 58% of every row's size, with no reader:
-- the only non-generated references were the two writes in sync.ts and a
-- comment in vocab-repair.ts recording that `tags` used to live inside it.
ALTER TABLE "Opportunity" DROP COLUMN "raw";

-- Backfill a deadline for rows that predate retention.
--
-- The sweeper's predicate is `ttlExpiresAt < now()`, which in SQL excludes NULL,
-- so without this every existing row would be exempt from retention forever and
-- the table would only ever grow. The reference point is `fetchedAt`, the same
-- instant sync uses when it writes, so a posting still in its feed has its
-- deadline refreshed on the next run and a posting that has already dropped out
-- expires some fixed interval after we last saw it.
--
-- The intervals match the registry defaults rather than using one flat value,
-- because they encode how deep each feed actually is: Arbeitnow's is a 6-day
-- rolling window, so a row that has not reappeared within 7 days is not coming
-- back, while a Greenhouse role routinely stays listed for weeks. A flat 30 days
-- would have kept 1,462 already-stale Arbeitnow rows alive for a month past the
-- point their feed had dropped them.
--
-- Each source's per-row deadline is rewritten on the next sync from the registry,
-- so this backfill only decides what happens to rows until then.
UPDATE "Opportunity"
SET "ttlExpiresAt" = "fetchedAt" + CASE
    WHEN "source" = 'arbeitnow' THEN INTERVAL '7 days'
    WHEN "source" = 'remotive'  THEN INTERVAL '14 days'
    WHEN "source" = 'remoteok'  THEN INTERVAL '60 days'
    ELSE INTERVAL '30 days'
  END;
