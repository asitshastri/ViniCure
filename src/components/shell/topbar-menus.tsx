"use client";

import Link from "next/link";
import { Bell, SignOut } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import type { NavItem } from "@/lib/nav";
import type { NotificationItem, SessionUser } from "@/lib/types";
import { cn } from "@/lib/cn";

// These menus use the native popover attribute: Escape and click-outside close them, and focus returns to the button.
const panel =
  "fixed inset-auto top-[4.25rem] right-3 m-0 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop sm:right-6";

const triggerClass =
  "relative flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-primary-soft hover:text-ink";

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const unread = items.filter((n) => n.unread).length;
  return (
    <>
      <button
        type="button"
        popoverTarget="notifications-panel"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className={triggerClass}
      >
        <Bell aria-hidden className="size-6" />
        {unread ? (
          <span
            aria-hidden
            className="bg-danger absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[0.625rem] font-bold text-white"
          >
            {unread}
          </span>
        ) : null}
      </button>
      <div id="notifications-panel" popover="auto" aria-label="Notifications" className={panel}>
        <div className="border-line border-b px-4 py-3">
          <h2 className="text-base font-semibold">Notifications</h2>
        </div>
        {items.length === 0 ? (
          <p className="text-ink-muted px-4 py-6 text-center text-sm">You are all caught up.</p>
        ) : (
          <ul className="divide-line max-h-80 divide-y overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-2 size-2 shrink-0 rounded-full",
                    n.unread ? "bg-primary" : "bg-transparent",
                  )}
                />
                <div className="flex flex-col">
                  <p className="text-ink text-sm">
                    {n.unread ? <span className="sr-only">Unread: </span> : null}
                    {n.title}
                  </p>
                  <p className="text-ink-muted text-xs">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function UserMenu({ user, account }: { user: SessionUser; account: NavItem[] }) {
  return (
    <>
      <button
        type="button"
        popoverTarget="user-panel"
        aria-label={`Account menu for ${user.name}`}
        className="hover:bg-primary-soft flex min-h-11 items-center gap-2 rounded-full p-0.5 pr-1 sm:pr-3"
      >
        <Avatar name={user.name} size="md" />
        <span className="hidden text-left sm:block">
          <span className="text-ink block text-sm leading-tight font-semibold">{user.name}</span>
          <span className="text-ink-muted block text-xs leading-tight">{user.subtitle}</span>
        </span>
      </button>
      <div id="user-panel" popover="auto" aria-label="Account menu" className={panel}>
        <div className="border-line border-b px-4 py-3">
          <p className="font-semibold">{user.name}</p>
          <p className="text-ink-muted text-sm">{user.subtitle}</p>
        </div>
        <ul className="p-2">
          {account.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-ink hover:bg-primary-soft flex min-h-11 items-center gap-3 rounded-lg px-3 text-base"
              >
                <item.icon aria-hidden className="text-ink-muted size-5" />
                {item.label}
              </Link>
            </li>
          ))}
          <li className="border-line mt-1 border-t pt-1">
            <Link
              href="/login"
              className="text-danger hover:bg-danger-soft flex min-h-11 items-center gap-3 rounded-lg px-3 text-base"
            >
              <SignOut aria-hidden className="size-5" />
              Sign out
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}
