import { logAppEvent } from "@/lib/logs/app-log-store";

export type FavoriteSymbolsResponse = {
  favoriteSymbolIds?: string[];
  error?: string;
};

export class FavoriteSymbolsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FavoriteSymbolsError";
  }
}

export function isInvalidFavoriteAccountSession(error: unknown) {
  return error instanceof FavoriteSymbolsError &&
    (error.status === 401 || (error.status === 404 && error.message === "Account not found."));
}

export async function loadFavoriteSymbolIds() {
  const response = await fetch("/api/account/favorites", { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as FavoriteSymbolsResponse;
  if (!response.ok || !payload.favoriteSymbolIds) {
    logAppEvent("FAVORITE", payload.error || "Could not load favorites.", "error");
    throw new FavoriteSymbolsError(payload.error || "Could not load favorites.", response.status);
  }
  logAppEvent("FAVORITE", `Loaded ${payload.favoriteSymbolIds.length} symbols.`);
  return payload.favoriteSymbolIds;
}

export async function saveFavoriteSymbolIds(favoriteSymbolIds: string[]) {
  const response = await fetch("/api/account/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favoriteSymbolIds }),
  });
  const payload = await response.json().catch(() => ({})) as FavoriteSymbolsResponse;
  if (!response.ok || !payload.favoriteSymbolIds) {
    logAppEvent("FAVORITE", payload.error || "Could not save favorites.", "error");
    throw new FavoriteSymbolsError(payload.error || "Could not save favorites.", response.status);
  }
  logAppEvent("FAVORITE", `Saved ${payload.favoriteSymbolIds.length} symbols.`, "success");
  return payload.favoriteSymbolIds;
}
