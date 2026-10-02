import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { SkipLink } from "@/components/shell/skip-link";
import { NotFoundPanel } from "@/components/states/not-found-panel";

export default function NotFound() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto min-h-[60dvh] max-w-6xl px-4 py-16 outline-none sm:px-6"
      >
        <NotFoundPanel extra={{ href: "/doctors", label: "Find a doctor" }} />
      </main>
      <SiteFooter />
    </>
  );
}
