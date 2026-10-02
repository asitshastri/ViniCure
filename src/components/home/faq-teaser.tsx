import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { buttonStyles } from "@/components/ui/button";
import type { FaqItem } from "@/lib/types";
import { Section } from "./section";

export function FaqTeaser({ faqs }: { faqs: FaqItem[] }) {
  return (
    <Section
      id="faq"
      title="Questions people ask first"
      tone="tint"
      action={
        <Link href="/faq" className={buttonStyles({ variant: "secondary" })}>
          All questions
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
