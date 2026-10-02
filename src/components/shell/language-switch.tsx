"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Translate } from "@phosphor-icons/react/ssr";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { useT } from "@/i18n/client";

/** A native select, so it works with a keyboard, a screen reader and on every phone. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <Translate aria-hidden className="text-ink-muted size-5 shrink-0" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setLocale(e.target.value);
            router.refresh();
          })
        }
        className="border-line-strong bg-surface text-ink h-11 rounded-lg border px-2 text-base"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
