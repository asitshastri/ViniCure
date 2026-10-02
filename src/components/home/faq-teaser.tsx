import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { buttonStyles } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import type { FaqItem } from "@/lib/types";
import { Section } from "./section";

export async function FaqTeaser({ faqs }: { faqs: FaqItem[] }) {
  const { t } = await getT();
  return (
    <Section
      id="faq"
      title={t("home.faq.title")}
      tone="tint"
      action={
        <Link href="/faq" className={buttonStyles({ variant: "secondary" })}>
          {t("home.faq.all")}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      }
    >
      <Accordion className="max-w-3xl">
        {faqs.map((f) => (
          <AccordionItem key={f.id} question={f.question} group="home-faq">
            {f.answer}
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
