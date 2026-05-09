export const AUTH_COOKIE_NAME = "tailadmin_auth";
export const AUTH_STORAGE_KEY = "tailadmin_auth";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type AuthUser = {
  accountId: string;
  username: string;
  displayName: string;
  email: string;
};

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function parseAuthCookieValue(value?: string): AuthUser | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<AuthUser>;
    if (!parsed.username) return null;

    return {
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : "",
      username: parsed.username,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : parsed.username,
      email: typeof parsed.email === "string" ? parsed.email : "",
    };
  } catch {
    return null;
  }
}
