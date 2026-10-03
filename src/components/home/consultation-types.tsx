import { ArrowRight, ArrowsClockwise, PhoneCall, VideoCamera } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { formatRupees } from "@/lib/format";
import type { ConsultationType } from "@/lib/types";

const icons = { video: VideoCamera, audio: PhoneCall, followup: ArrowsClockwise } as const;

export async function ConsultationTypes({ types }: { types: ConsultationType[] }) {
  const { t } = await getT();
  return (
    <section aria-labelledby="types-heading" className="on-dark bg-dock py-14 text-white sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <h2 id="types-heading" className="text-3xl font-semibold sm:text-4xl">
            {t("home.types.title")}
          </h2>
          <p className="mt-3 max-w-md text-lg text-white/80">{t("home.types.intro")}</p>
          <ButtonLink
            href="/doctors"
            size="lg"
            className="!text-dock hover:bg-primary-soft mt-8 bg-white"
          >
            {t("home.types.book")}
            <ArrowRight aria-hidden className="size-5" />
          </ButtonLink>
        </div>
        <ul className="divide-y divide-white/15 border-y border-white/15">
          {types.map((ty) => {
            const Icon = icons[ty.icon];
            return (
              <li key={ty.id} className="flex items-start gap-4 py-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon aria-hidden className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold">
                    {t(`home.types.${ty.icon}Name` as MessageKey)}
                  </h3>
                  <p className="mt-1 text-white/80">
                    {t(`home.types.${ty.icon}Text` as MessageKey)}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm text-white/80">
                  {t("home.types.from")}
                  <span className="font-display block text-xl font-semibold text-white tabular-nums">
                    {formatRupees(ty.fromPaise)}
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
