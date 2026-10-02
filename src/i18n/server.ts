import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";
import { en } from "@/i18n/messages/en";
import { gu } from "@/i18n/messages/gu";
import { hi } from "@/i18n/messages/hi";
import { makeTranslate, type Translate } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages/en";

export const catalogs: Record<Locale, Messages> = { en, hi, gu };

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ t: Translate; locale: Locale }> {
  const locale = await getLocale();
  return { t: makeTranslate(catalogs[locale], en), locale };
}
