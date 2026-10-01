"use server";

import { revalidatePath } from "next/cache";

import { destroySession, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugifySkill } from "@/lib/jobs/normalize";

/**
 * Server actions for the dashboard. Each one re-checks the session rather than
 * trusting the caller, because a client component can invoke these directly.
 */

export async function signOutAction() {
  await destroySession();
  revalidatePath("/", "layout");
}

export async function toggleBookmarkAction(opportunityId: string) {
  const user = await getSessionUser();
  if (!user) return { bookmarked: false, error: "Unauthorized." };

  const existing = await prisma.bookmark.findUnique({
    where: { userId_opportunityId: { userId: user.id, opportunityId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    revalidatePath("/dashboard");
    return { bookmarked: false };
  }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true },
  });
  if (!opportunity) return { bookmarked: false, error: "Opportunity not found." };

  await prisma.bookmark.create({ data: { userId: user.id, opportunityId } });
  revalidatePath("/dashboard");
  return { bookmarked: true };
}

export async function applyToOpportunityAction(opportunityId: string) {
  const user = await getSessionUser();
  if (!user) return { applied: false, error: "Unauthorized." };

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true },
  });
  if (!opportunity) return { applied: false, error: "Opportunity not found." };

  // Recording the application is separate from the outbound apply link: the
  // candidate still has to submit on the employer's own site. Re-applying just
  // reopens the existing record rather than failing on the unique constraint.
  await prisma.application.upsert({
    where: { userId_opportunityId: { userId: user.id, opportunityId } },
    create: { userId: user.id, opportunityId },
    update: { status: "APPLIED", appliedAt: new Date() },
  });

  revalidatePath("/dashboard");
  return { applied: true };
}

export async function updateSkillsAction(slugs: string[]) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Unauthorized." };

  const cleaned = [
    ...new Set(
      slugs
        .map((slug) => slugifySkill(slug))
        .filter((slug) => slug.length >= 2 && slug.length <= 40),
    ),
  ];

  // Resolve catalog rows first: a user skill carries a foreign key to one, so the
  // definition has to exist before the upserts below can reference its id.
  const definitionIds = new Map<string, string>();
  for (const slug of cleaned) {
    const definition = await prisma.skillDefinition.upsert({
      where: { slug },
      create: { slug, label: slug.replace(/-/g, " ") },
      update: {},
      select: { id: true },
    });
    definitionIds.set(slug, definition.id);
  }

  await prisma.$transaction([
    prisma.skill.deleteMany({ where: { userId: user.id, slug: { notIn: cleaned } } }),
    ...cleaned.map((slug) =>
      prisma.skill.upsert({
        where: { userId_slug: { userId: user.id, slug } },
        create: {
          userId: user.id,
          slug,
          name: slug.replace(/-/g, " "),
          definitionId: definitionIds.get(slug)!,
        },
        update: {},
      }),
    ),
  ]);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function inviteStudentAction(inviteeId: string) {
  const user = await getSessionUser();
  if (!user) return { invited: false, error: "Unauthorized." };
  if (inviteeId === user.id) return { invited: false, error: "You cannot invite yourself." };

  const invitee = await prisma.user.findUnique({
    where: { id: inviteeId },
    select: { id: true },
  });
  if (!invitee) return { invited: false, error: "Student not found." };

  await prisma.invitation.upsert({
    where: { inviterId_inviteeId: { inviterId: user.id, inviteeId } },
    create: { inviterId: user.id, inviteeId },
    update: {},
  });

  revalidatePath("/dashboard");
  return { invited: true };
}
