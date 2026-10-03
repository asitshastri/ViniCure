import type { MessageKey, Translate } from "@/i18n/translate";

/** Specialty names and blurbs are translated by slug. A slug with no entry shows the English from the data. */
export function specialtyText(
  t: Translate,
  slug: string,
  part: "name" | "blurb",
  fallback: string,
): string {
  const key = `specialties.${slug}.${part}` as MessageKey;
  const text = t(key);
  return text === key ? fallback : text;
}
