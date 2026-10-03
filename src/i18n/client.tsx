"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { en } from "@/i18n/messages/en";
import { makeTranslate, type Translate } from "@/i18n/translate";

const Ctx = createContext<{ t: Translate; locale: Locale } | null>(null);

/** Gives client components the same translate function the server uses. Mounted once in the root layout. */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ t: makeTranslate(messages, en), locale }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT must be used inside <I18nProvider>");
  return v;
}
