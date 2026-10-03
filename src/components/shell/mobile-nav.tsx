"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { List } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { isActive, publicNav } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useT();
  const close = () => setOpen(false);

  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        className="xl:hidden"
        aria-label={t("common.openMenu")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <List aria-hidden className="size-6" />
      </Button>
      <Dialog open={open} onClose={close} title={t("common.menu")} variant="sheet">
        <nav aria-label={t("nav.mobile")}>
          <ul className="flex flex-col">
            {publicNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center rounded-lg px-3 text-lg font-medium",
                    isActive(pathname, item.href)
                      ? "bg-primary-soft text-primary"
                      : "text-ink hover:bg-primary-tint",
                  )}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-3 pt-2">
          <ButtonLink href="/doctors" size="lg" onClick={close}>
            {t("common.bookConsultation")}
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary" size="lg" onClick={close}>
            {t("common.signIn")}
          </ButtonLink>
        </div>
      </Dialog>
    </>
  );
}
