import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "skillbridge_session";

const PROTECTED = [
  "/dashboard",
  "/onboarding",
  "/api/matches",
  "/api/bookmarks",
  "/api/team",
  "/api/profile",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const guarded = PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!guarded) return NextResponse.next();

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};