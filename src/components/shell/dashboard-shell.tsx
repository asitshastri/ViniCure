"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react/ssr";
import { Dialog } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { isActive, navFor, type NavItem } from "@/lib/nav";
import type { NotificationItem, Role, SessionUser } from "@/lib/types";
import { cn } from "@/lib/cn";
import { SkipLink } from "./skip-link";
import { NotificationBell, UserMenu } from "./topbar-menus";

type DashboardShellProps = {
  role: Role;
  user: SessionUser;
  notifications: NotificationItem[];
  children: ReactNode;
};

function SideLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
        active ? "bg-primary text-white" : "text-ink-muted hover:bg-primary-soft hover:text-ink",
      )}
    >
      <item.icon aria-hidden weight={active ? "fill" : "regular"} className="size-5 shrink-0" />
      {item.label}
    </Link>
  );
}

export function DashboardShell({ role, user, notifications, children }: DashboardShellProps) {
  const pathname = usePathname();
  const nav = navFor(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // After a page change, move focus to the main region so keyboard and screen reader users start at the top.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <SkipLink />

      <aside className="border-line bg-surface sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r p-4 lg:flex">
        <Link href="/" aria-label="ViniCure home" className="px-2 pt-1">
          <Logo className="h-9" />
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-5">
          {nav.groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="text-ink-faint px-3 text-xs font-semibold tracking-wide uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <SideLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          ))}
        </nav>
        <nav aria-label="Account" className="border-line flex flex-col gap-1 border-t pt-4">
          {nav.account.map((item) => (
            <SideLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-line bg-surface/90 sticky top-0 z-40 flex h-16 items-center gap-3 border-b px-3 backdrop-blur sm:px-6 lg:px-8">
          <Link href="/" aria-label="ViniCure home" className="lg:hidden">
            <Logo className="h-8" />
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell items={notifications} />
            <UserMenu user={user} account={nav.account} />
          </div>
        </header>

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 px-4 py-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pb-10"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="border-line bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {nav.tabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                    active ? "text-primary" : "text-ink-muted",
                  )}
                >
                  <item.icon aria-hidden weight={active ? "fill" : "regular"} className="size-6" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className="text-ink-muted flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium"
            >
              <DotsThree aria-hidden weight="bold" className="size-6" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu" variant="sheet">
        <nav aria-label="All pages" className="flex flex-col gap-4">
          {nav.groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="text-ink-faint px-3 text-xs font-semibold tracking-wide uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <SideLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setMoreOpen(false)}
                />
              ))}
            </div>
          ))}
          <div className="border-line flex flex-col gap-1 border-t pt-3">
            {nav.account.map((item) => (
              <SideLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={() => setMoreOpen(false)}
              />
            ))}
          </div>
        </nav>
      </Dialog>
    </div>
  );
}
