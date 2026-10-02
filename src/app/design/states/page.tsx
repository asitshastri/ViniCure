import type { Metadata } from "next";
import Link from "next/link";
import { Tray } from "@phosphor-icons/react/ssr";
import { LoadingView } from "@/components/states/loading-view";
import { NotFoundPanel } from "@/components/states/not-found-panel";
import { ErrorPanel } from "@/components/states/error-panel";
import { CrashButton } from "@/app/design/states/crash-button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Page states" };

const sample = [
  ["Patient dashboard", "/patient/dashboard"],
  ["Doctor consultations", "/doctor/consultations"],
  ["Admin users", "/admin/users"],
  ["Support queue", "/staff/queue"],
  ["Doctor search", "/doctors"],
];

export default function StatesPage() {
  return (
    <main id="main" className="mx-auto grid max-w-5xl gap-12 px-4 py-10 sm:px-6">
      <header className="grid gap-2">
        <h1 className="font-display text-3xl font-semibold">Page states</h1>
        <p className="text-ink-muted max-w-prose text-lg">
          Every page can be seen loading, failing, offline and on a slow connection. Add{" "}
          <code>?preview=loading</code>, <code>?preview=error</code>, <code>?preview=offline</code>{" "}
          or <code>?preview=slow</code> to its address. Empty states appear when a list has nothing
          in it; the pages that have lists show them with a search that finds nothing.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {sample.map(([label, href]) => (
            <li key={href} className="flex gap-2">
              {label}:
              {["loading", "error", "offline", "slow"].map((s) => (
                <Link key={s} href={`${href}?preview=${s}`} className="text-primary underline">
                  {s}
                  <span className="sr-only"> state of {label}</span>
                </Link>
              ))}
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="s-loading" className="grid gap-4">
        <h2 id="s-loading" className="text-xl font-semibold">
          Loading
        </h2>
        <LoadingView label="Loading this example" heading={false} />
      </section>

      <section aria-labelledby="s-empty" className="grid gap-4">
        <h2 id="s-empty" className="text-xl font-semibold">
          Empty
        </h2>
        <EmptyState
          icon={<Tray />}
          title="Nothing here yet"
          description="Say what will appear here and how to add the first one."
          action={<span className="text-primary font-semibold">One clear next step</span>}
        />
      </section>

      <section aria-labelledby="s-error" className="grid gap-4">
        <h2 id="s-error" className="text-xl font-semibold">
          Error
        </h2>
        <ErrorPanel
          reference="VC-7F3A21"
          homeLabel="Go to the home page"
          as="h3"
          focusHeading={false}
        />
        <p className="text-ink-muted">
          Break the page on purpose to see the real error boundary and its Try again button:
        </p>
        <CrashButton />
      </section>

      <section aria-labelledby="s-404" className="grid gap-4">
        <h2 id="s-404" className="text-xl font-semibold">
          Not found
        </h2>
        <NotFoundPanel as="h3" />
      </section>
    </main>
  );
}
