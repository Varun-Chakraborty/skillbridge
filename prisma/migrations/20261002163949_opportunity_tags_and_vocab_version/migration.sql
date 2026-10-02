-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vocabVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Opportunity_vocabVersion_idx" ON "Opportunity"("vocabVersion");
