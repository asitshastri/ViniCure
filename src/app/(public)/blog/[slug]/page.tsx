import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SealCheck } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/content/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, getArticle, getArticleSlugs, getRelatedArticles } from "@/lib/data/articles";

export function generateStaticParams() {
  return getArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = getArticle((await params).slug);
  return {
    title: a ? `${a.title} | ViniCure` : "Article not found | ViniCure",
    description: a?.excerpt,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug);
  if (!article) notFound();
  const related = getRelatedArticles(article.slug);

  return (
    <PageShell title={article.title} intro={article.excerpt} prose>
      <p className="text-ink-muted -mt-4 mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <Badge tone="primary">{article.category}</Badge>
        <span>{formatDate(article.published)}</span>
        <span>{article.readMinutes} min read</span>
      </p>
      <article className="max-w-prose">
        {article.body.map((b, i) =>
          b.type === "h2" ? (
            <h2 key={i} className="mt-10 mb-3 text-2xl font-semibold">
              {b.text}
            </h2>
          ) : b.type === "ul" ? (
            <ul key={i} className="my-4 grid list-disc gap-2 pl-5">
              {b.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          ) : (
            <p key={i} className="my-4 text-lg">
              {b.text}
            </p>
          ),
        )}
      </article>

      <aside
        aria-label="Medical review"
        className="bg-success-soft mt-10 max-w-prose rounded-xl p-5"
      >
        <p className="flex items-center gap-2 font-semibold">
          <SealCheck aria-hidden weight="fill" className="text-success size-5" />
          Checked by {article.reviewer.name}
        </p>
        <p className="text-ink-muted mt-1">
          {article.reviewer.specialty}. Registration {article.reviewer.registrationNumber}. Sample
          reviewer for design review.
        </p>
        <p className="text-ink-muted mt-2 text-sm">
          This article is general information, not a diagnosis or a substitute for a consultation.
          In an emergency call 112.
        </p>
      </aside>

      <div className="mt-8">
        <ButtonLink href="/doctors" size="lg">
          Talk to a doctor
        </ButtonLink>
      </div>

      <section aria-labelledby="more-h" className="mt-14 max-w-prose">
        <h2 id="more-h" className="text-2xl font-semibold">
          More to read
        </h2>
        <ul className="mt-4 grid gap-3">
          {related.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/blog/${r.slug}`}
                className="text-primary text-lg font-semibold underline"
              >
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
