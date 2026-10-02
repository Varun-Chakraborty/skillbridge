import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseResumeInput } from "@/lib/resume";
import { saveResume } from "@/lib/profile/resume-store";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Body = {
  email?: unknown;
  name?: unknown;
  password?: unknown;
  // Optional resume fields. Registration works without them, but a student who
  // fills them in lands on a scored dashboard instead of an empty one.
  resume?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Name must be 2 to 80 characters." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
    select: { id: true, email: true, name: true },
  });

  // A resume supplied during signup goes through the same validation and
  // extraction as a later edit, so the two paths cannot drift apart. A bad
  // resume field does not fail registration: the account is already valid, and
  // the student can fix the field on the resume screen.
  const resume = body.resume && typeof body.resume === "object" ? body.resume : null;
  if (resume) {
    const parsed = parseResumeInput(resume);
    if (parsed.ok) await saveResume(user.id, parsed.value);
  }

  await createSession(user.id, {
    userAgent: request.headers.get("user-agent") ?? undefined,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });

  return NextResponse.json({ user }, { status: 201 });
}