import { getT } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";

export async function FinalCta() {
  const { t } = await getT();
  return (
    <section aria-labelledby="cta-heading" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="bg-primary mx-auto flex max-w-6xl flex-col gap-6 rounded-[20px] px-6 py-10 text-white sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 id="cta-heading" className="text-3xl font-semibold sm:text-4xl">
            {t("home.cta.title")}
          </h2>
          <p className="mt-3 text-lg text-white/90">{t("home.cta.text")}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink
            href="/doctors"
            size="lg"
            className="!text-primary hover:bg-primary-soft bg-white"
          >
            {t("home.cta.find")}
          </ButtonLink>
          <ButtonLink
            href="/login"
            size="lg"
            className="border border-white/70 text-white hover:bg-white/10"
          >
            {t("common.signIn")}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
