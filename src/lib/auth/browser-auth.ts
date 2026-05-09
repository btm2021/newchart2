"use client";

import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  AUTH_STORAGE_KEY,
  normalizeUsername,
  type AuthUser,
} from "@/lib/auth/session-shared";
import { logAppEvent } from "@/lib/logs/app-log-store";

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
  logAppEvent("AUTH", `Signed in as ${session.username}.`, "success");
  return session;
}

export async function signUpWithBrowserSession(input: {
  username: string;
  password: string;
  displayName: string;
  email: string;
  phone?: string;
  address?: string;
}) {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      username: normalizeUsername(input.username),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Could not create account.");
  }

  const payload = await response.json() as { user: AuthUser };
  saveBrowserSession(payload.user);
  logAppEvent("AUTH", `Signed up as ${payload.user.username}.`, "success");
  return payload.user;
}

export function saveBrowserSession(user: AuthUser) {
  const value = encodeURIComponent(JSON.stringify(user));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  document.cookie = `${AUTH_COOKIE_NAME}=${value}; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax${secure}`;
  logAppEvent("AUTH", `Session saved for ${user.username}.`);
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
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; Max-Age=0; path=/; SameSite=Lax${secure}`;
  void fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  logAppEvent("AUTH", "Session cleared.", "warning");
}
