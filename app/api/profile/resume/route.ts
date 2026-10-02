import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { saveResume } from "@/lib/profile/resume-store";
import { parseResumeInput } from "@/lib/resume";

/**
 * Saves the student's resume and re-derives their skills from it.
 *
 * Separate from registration on purpose: signup creates the account, and this
 * can be revisited as often as the student likes. A parser will call the same
 * route once it exists, so the validation and extraction path stays shared.
 */
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = parseResumeInput(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Some fields need attention.", fields: parsed.errors },
      { status: 400 },
    );
  }

  const result = await saveResume(user.id, parsed.value);

  return NextResponse.json({
    ok: true,
    // Reported back so the form can show the student what matching picked up,
    // rather than leaving them to guess whether the text was understood.
    extracted: result.known + result.custom,
  });
}
