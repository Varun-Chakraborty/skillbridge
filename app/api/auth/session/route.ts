import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });

  const [bookmarks, applications, skills] = await Promise.all([
    prisma.bookmark.count({ where: { userId: user.id } }),
    prisma.application.count({ where: { userId: user.id } }),
    prisma.skill.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    user,
    counts: { bookmarks, applications, skills },
  });
}