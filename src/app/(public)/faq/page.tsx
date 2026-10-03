import type { Metadata } from "next";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/content/page-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { getFaqGroups } from "@/lib/data/articles";

export const metadata: Metadata = {
  title: "Frequently asked questions | ViniCure",
  description: "Answers about booking, payments, privacy, doctors and technical help.",
};

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80).trim() || undefined;
  const groups = getFaqGroups(q);

  return (
    <PageShell
      title="Frequently asked questions"
      intro="Quick answers. If yours is not here, contact support."
    >
      <form
        action="/faq"
        method="get"
        role="search"
        aria-label="Search questions"
        className="mb-8 flex max-w-xl flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="faq-q" className="mb-1 block text-sm font-medium">
            Search the questions
          </label>
          <Input
            id="faq-q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            maxLength={80}
            autoComplete="off"
            leading={<MagnifyingGlass className="size-5" />}
          />
        </div>
        <Button type="submit" size="lg">
          Search
        </Button>
      </form>

      {groups.length ? (
        <>
          {!q ? (
            <nav aria-label="Question topics" className="mb-10">
              <ul className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <li key={g.id}>
                    <a
                      href={`#${g.id}`}
                      className="border-line-strong bg-surface hover:bg-primary-soft inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
                    >
                      {g.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="grid max-w-3xl gap-10">
            {groups.map((g) => (
              <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`}>
                <h2 id={`${g.id}-h`} className="mb-3 text-2xl font-semibold">
                  {g.title}
                </h2>
                <Accordion>
                  {g.items.map((i) => (
                    <AccordionItem key={i.id} question={i.question}>
                      {i.answer}
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<MagnifyingGlass />}
          title="No questions match that search"
          description="Try fewer or different words, or ask us directly."
          action={<ButtonLink href="/support">Contact support</ButtonLink>}
        />
      )}

      <section
        aria-labelledby="still-h"
        className="bg-primary-tint mt-14 max-w-3xl rounded-2xl p-6"
      >
        <h2 id="still-h" className="text-xl font-semibold">
          Still have a question?
        </h2>
        <p className="text-ink-muted mt-1">Our support team is happy to help.</p>
        <ButtonLink href="/support" className="mt-4">
          Contact support
        </ButtonLink>
      </section>
    </PageShell>
  );
}
