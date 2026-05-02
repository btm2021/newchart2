"use client";

import { getFirebaseClient } from "@/lib/firebase/client";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

export const AUTH_COOKIE_NAME = "tailadmin_auth";
export const AUTH_STORAGE_KEY = "tailadmin_auth";

type AuthUser = {
  username: string;
  displayName: string;
};

const DEFAULT_USER = {
  username: "bao",
  password: "123",
  displayName: "bao",
};

const FOREVER_COOKIE_EXPIRY = "Fri, 31 Dec 9999 23:59:59 GMT";

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

async function ensureDefaultUser(db: Firestore, username: string) {
  if (username !== DEFAULT_USER.username) {
    return;
  }

  const userRef = doc(db, "users", DEFAULT_USER.username);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      ...DEFAULT_USER,
      createdAt: serverTimestamp(),
      source: "tailadmin-login-seed",
    });
  }
}

export async function signInWithBrowserSession(
  username: string,
  password: string
) {
  const firebase = getFirebaseClient();
  if (!firebase) {
    throw new Error("Firebase config is missing.");
  }

  const normalizedUsername = normalizeUsername(username);
  await ensureDefaultUser(firebase.db, normalizedUsername);

  const userRef = doc(firebase.db, "users", normalizedUsername);
  const snapshot = await getDoc(userRef);
  const user = snapshot.data();

  if (!snapshot.exists() || user?.password !== password) {
    throw new Error("Invalid username or password.");
  }

  const session: AuthUser = {
    username: normalizedUsername,
    displayName:
      typeof user?.displayName === "string" ? user.displayName : normalizedUsername,
  };

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
}
