-- AlterEnum
ALTER TYPE "OpportunityKind" ADD VALUE 'CONFERENCE';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Opportunity_startsAt_idx" ON "Opportunity"("startsAt");

-- CreateIndex
CREATE INDEX "Opportunity_endsAt_idx" ON "Opportunity"("endsAt");
