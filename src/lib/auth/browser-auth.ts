"use client";

import { AUTH_COOKIE_NAME, AUTH_STORAGE_KEY, normalizeUsername, type AuthUser } from "@/lib/auth/session-shared";

const FOREVER_COOKIE_EXPIRY = "Fri, 31 Dec 9999 23:59:59 GMT";

export async function signInWithBrowserSession(
  username: string,
  password: string
) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: normalizeUsername(username),
      password,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Invalid username or password.");
  }

  const payload = await response.json() as { user: AuthUser };
  const session = payload.user;

  saveBrowserSession(session);
  return session;
}

export function saveBrowserSession(user: AuthUser) {
  const value = encodeURIComponent(JSON.stringify(user));
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  document.cookie = `${AUTH_COOKIE_NAME}=${value}; expires=${FOREVER_COOKIE_EXPIRY}; path=/; SameSite=Lax`;
}

export function readBrowserSession(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as AuthUser;
    return parsed?.username ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBrowserSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  void fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
}
