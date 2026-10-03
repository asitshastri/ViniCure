import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitch } from "./language-switch";
import { getT } from "@/i18n/server";
import { HeaderNav } from "./header-nav";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const { t } = await getT();
  return (
    <header className="border-line bg-surface/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="ViniCure home" className="shrink-0 rounded-lg">
          <Logo className="h-9" priority />
        </Link>
        <HeaderNav />
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">
            {t("common.signIn")}
          </ButtonLink>
          <ButtonLink href="/doctors" className="hidden sm:inline-flex">
            {t("common.bookConsultation")}
          </ButtonLink>
          <LanguageSwitch />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
