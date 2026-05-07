export type FavoriteSymbolsResponse = {
  favoriteSymbolIds?: string[];
  error?: string;
};

export async function loadFavoriteSymbolIds() {
  const response = await fetch("/api/account/favorites", { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as FavoriteSymbolsResponse;
  if (!response.ok || !payload.favoriteSymbolIds) {
    throw new Error(payload.error || "Could not load favorites.");
  }
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
    throw new Error(payload.error || "Could not save favorites.");
  }
  return payload.favoriteSymbolIds;
}
