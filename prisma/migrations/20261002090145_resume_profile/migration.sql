-- CreateEnum
CREATE TYPE "ResumeSource" AS ENUM ('MANUAL', 'PARSED');

-- CreateEnum
CREATE TYPE "SkillOrigin" AS ENUM ('MANUAL', 'DERIVED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "education" TEXT,
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "githubUrl" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "parsedAt" TIMESTAMP(3),
ADD COLUMN     "portfolioUrl" TEXT,
ADD COLUMN     "projects" TEXT,
ADD COLUMN     "rawText" TEXT,
ADD COLUMN     "skillsText" TEXT,
ADD COLUMN     "source" "ResumeSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Skill" ADD COLUMN     "origin" "SkillOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "Skill_userId_origin_idx" ON "Skill"("userId", "origin");
