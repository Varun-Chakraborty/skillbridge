import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      opportunity: {
        select: { id: true, title: true, company: true, location: true, kind: true, applyUrl: true },
      },
    },
  });

  return NextResponse.json({ bookmarks });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { opportunityId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const opportunityId = typeof body.opportunityId === "string" ? body.opportunityId : "";
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId is required." }, { status: 400 });
  }

  const existing = await prisma.bookmark.findUnique({
    where: { userId_opportunityId: { userId: user.id, opportunityId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return NextResponse.json({ bookmarked: false });
  }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true },
  });
  if (!opportunity) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  await prisma.bookmark.create({ data: { userId: user.id, opportunityId } });
  return NextResponse.json({ bookmarked: true }, { status: 201 });
}