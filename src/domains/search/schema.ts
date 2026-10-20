import { z } from "zod";

export const searchQuery = z.string().trim().min(2).max(60);
/** Case and accent insensitive: "Léa" matches "lea". */
export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr");
}
