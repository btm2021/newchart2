import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseAuthCookieValue } from "@/lib/auth/session-shared";

const PUBLIC_PATHS = new Set([
  "/login",
  "/signin",
  "/signup",
  "/error-404",
]);

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/charting_library") ||
    pathname.startsWith("/tv-custom-studies") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname) || pathname.includes(".")) {
    return NextResponse.next();
  }

  const isPrefetch = request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch";
  if (isPrefetch) {
    return NextResponse.next();
  }

  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const session = parseAuthCookieValue(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const isAuthenticated = Boolean(session?.accountId && session.username);

  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && (pathname === "/login" || pathname === "/signin")) {
    const requestedNextPath = request.nextUrl.searchParams.get("next");
    const nextPath = requestedNextPath?.startsWith("/") &&
      !requestedNextPath.startsWith("//")
      ? requestedNextPath
      : "/chart";
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};
