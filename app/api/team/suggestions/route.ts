import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { findComplementaryStudents } from "@/lib/matching";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const suggestions = await findComplementaryStudents(user.id, 10);
  return NextResponse.json({ suggestions });
}