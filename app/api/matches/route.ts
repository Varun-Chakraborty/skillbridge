import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { rankOpportunitiesForUser } from "@/lib/matching";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kinds = kindParam
    ? kindParam.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean)
    : undefined;

  const matches = await rankOpportunitiesForUser(user.id, { limit: 50, kinds });

  return NextResponse.json({ matches });
}