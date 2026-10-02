import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/content/page-shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDate, getCategories, listArticles } from "@/lib/data/articles";

export const metadata: Metadata = {
  title: "Health blog | ViniCure",
  description: "Plain-language health articles, checked by registered doctors.",
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const raw = (await searchParams).category;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const categories = getCategories();
  // Only a known category is accepted from the URL.
  const category = wanted && categories.includes(wanted) ? wanted : undefined;
  const articles = listArticles(category);

  const chip =
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors";
  return (
    <PageShell
      title="Health blog"
      intro="Plain-language articles, each checked by a registered doctor. Sample articles for design review."
    >
      <nav aria-label="Article categories" className="mb-8">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/blog"
              aria-current={!category ? "page" : undefined}
              className={cn(
                chip,
                !category
                  ? "bg-primary border-primary text-white"
                  : "border-line-strong bg-surface text-ink hover:bg-primary-soft",
              )}
            >
              All
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c}>
              <Link
                href={`/blog?category=${encodeURIComponent(c)}`}
                aria-current={category === c ? "page" : undefined}
                className={cn(
                  chip,
                  category === c
                    ? "bg-primary border-primary text-white"
                    : "border-line-strong bg-surface text-ink hover:bg-primary-soft",
                )}
              >
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <li key={a.slug}>
            <article className="border-line bg-surface shadow-card flex h-full flex-col gap-3 rounded-xl border p-5">
              <Badge tone="primary" className="self-start">
                {a.category}
              </Badge>
              <h2 className="text-xl leading-snug font-semibold">
                <Link href={`/blog/${a.slug}`} className="hover:text-primary hover:underline">
                  {a.title}
                </Link>
              </h2>
              <p className="text-ink-muted">{a.excerpt}</p>
              <p className="text-ink-muted mt-auto text-sm">
                {formatDate(a.published)}. {a.readMinutes} min read. Checked by {a.reviewer.name}.
              </p>
            </article>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
