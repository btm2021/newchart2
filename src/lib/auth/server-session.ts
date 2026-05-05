import { AUTH_COOKIE_NAME, parseAuthCookieValue } from "@/lib/auth/session-shared";
import type { NextRequest } from "next/server";

export function readRequestSession(request: NextRequest) {
  return parseAuthCookieValue(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function requireRequestAccountId(request: NextRequest) {
  const session = readRequestSession(request);
  if (!session?.accountId) {
    throw new Error("Account session is required.");
  }
  return session.accountId;
}
