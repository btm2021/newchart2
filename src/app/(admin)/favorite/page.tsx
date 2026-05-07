import { FavoriteSymbolsPanel } from "@/components/favorites/favorite-symbols-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Favorite | Mint",
  description: "Favorite monitor symbols",
};

export default function FavoritePage() {
  return <FavoriteSymbolsPanel />;
}
