import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugifySkill } from "@/lib/jobs/normalize";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type Body = {
  email?: unknown;
  name?: unknown;
  password?: unknown;
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

  const skillNames = Array.isArray((body as { skills?: unknown }).skills)
    ? ((body as { skills: unknown[] }).skills).filter((s): s is string => typeof s === "string")
    : [];

  for (const raw of skillNames) {
    const slug = slugifySkill(raw);
    if (slug.length < 2 || slug.length > 40) continue;
    const definition = await prisma.skillDefinition.upsert({
      where: { slug },
      create: { slug, label: raw.trim() },
      update: {},
      select: { id: true },
    });
    await prisma.skill.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      create: { userId: user.id, slug, name: raw.trim(), definitionId: definition.id },
      update: {},
    });
  }

  await createSession(user.id, {
    userAgent: request.headers.get("user-agent") ?? undefined,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });

  return NextResponse.json({ user }, { status: 201 });
}