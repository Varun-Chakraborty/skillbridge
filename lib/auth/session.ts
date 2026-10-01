import { createHmac, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "skillbridge_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to at least 32 characters. Copy .env.example to .env and generate one.",
    );
  }
  return value;
}

function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac("sha256", secret()).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export async function createSession(userId: string, meta?: { userAgent?: string; ip?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta?.userAgent?.slice(0, 255) ?? null,
      ipHash: hashIp(meta?.ip ?? null),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  headline: string | null;
  school: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const stillValid = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session
    .update({ where: { id: session.id }, data: { expiresAt: stillValid, lastSeenAt: new Date() } })
    .catch(() => {});

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    headline: user.headline,
    school: user.school,
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}