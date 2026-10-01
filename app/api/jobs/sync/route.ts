import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { syncAllSources } from "@/lib/jobs/sync";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Set CRON_SECRET to allow unauthenticated syncs." },
        { status: 401 },
      );
    }
  }

  const reports = await syncAllSources();
  const ok = reports.filter((r) => r.ok).length;

  return NextResponse.json({
    sources: reports,
    okCount: ok,
    failedCount: reports.length - ok,
  });
}