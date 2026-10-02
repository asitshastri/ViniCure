import { ArrowRight, ArrowsClockwise, PhoneCall, VideoCamera } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/button";
import { formatRupees } from "@/lib/format";
import type { ConsultationType } from "@/lib/types";

const icons = { video: VideoCamera, audio: PhoneCall, followup: ArrowsClockwise } as const;

export function ConsultationTypes({ types }: { types: ConsultationType[] }) {
  return (
    <section aria-labelledby="types-heading" className="on-dark bg-dock py-14 text-white sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <h2 id="types-heading" className="text-3xl font-semibold sm:text-4xl">
            Choose how you want to talk
          </h2>
          <p className="mt-3 max-w-md text-lg text-white/80">
            Pick video when the doctor needs to see you. Pick audio when your network is weak.
          </p>
          <ButtonLink
            href="/doctors"
            size="lg"
            className="!text-dock hover:bg-primary-soft mt-8 bg-white"
          >
            Book a consultation
            <ArrowRight aria-hidden className="size-5" />
          </ButtonLink>
        </div>
        <ul className="divide-y divide-white/15 border-y border-white/15">
          {types.map((t) => {
            const Icon = icons[t.icon];
            return (
              <li key={t.id} className="flex items-start gap-4 py-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon aria-hidden className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold">{t.name}</h3>
                  <p className="mt-1 text-white/80">{t.description}</p>
                </div>
                <p className="shrink-0 text-right text-sm text-white/80">
                  from
                  <span className="font-display block text-xl font-semibold text-white tabular-nums">
                    {formatRupees(t.fromPaise)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
