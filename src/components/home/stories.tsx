import { getT } from "@/i18n/server";
import type { PatientStory } from "@/lib/types";
import { Section } from "./section";

export async function Stories({ stories }: { stories: PatientStory[] }) {
  const { t } = await getT();
  const [lead, ...rest] = stories;
  if (!lead) return null;
  return (
    <Section
      id="stories"
      title={t("home.stories.title")}
      intro={t("home.stories.intro")}
      tone="tint"
    >
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <figure>
          <blockquote className="font-display text-ink text-2xl leading-snug font-medium sm:text-3xl">
            “{lead.quote}”
          </blockquote>
          <figcaption className="text-ink-muted mt-5">
            <span className="text-ink font-semibold">{lead.name}</span>, {lead.place}.{" "}
            {lead.context}.
          </figcaption>
        </figure>
        <div className="divide-line border-line divide-y border-y lg:border-y-0 lg:border-l lg:pl-10">
          {rest.map((s) => (
            <figure key={s.id} className="py-6 first:pt-0 last:pb-0 lg:first:pt-6 lg:last:pb-6">
              <blockquote className="text-ink text-lg">“{s.quote}”</blockquote>
              <figcaption className="text-ink-muted mt-3 text-sm">
                <span className="text-ink font-semibold">{s.name}</span>, {s.place}. {s.context}.
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}
