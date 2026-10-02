"use server";

import { revalidatePath } from "next/cache";

import { destroySession, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { setUserSkills } from "@/lib/user-skills";

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

/**
 * Replaces the skills the student picked by hand in the editor.
 *
 * Only the manual set is rewritten. Skills inferred from the resume are left
 * alone, so tidying this list does not silently drop the evidence the resume
 * provides — and a skill picked here that the resume also mentions is promoted
 * to a manual claim rather than overwritten.
 */
export async function updateSkillsAction(slugs: string[]) {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Unauthorized." };

  await setUserSkills(user.id, { manual: slugs });

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
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
