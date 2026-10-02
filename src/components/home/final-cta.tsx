import { ButtonLink } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="bg-primary mx-auto flex max-w-6xl flex-col gap-6 rounded-[20px] px-6 py-10 text-white sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 id="cta-heading" className="text-3xl font-semibold sm:text-4xl">
            Feeling unwell? Talk to a doctor now
          </h2>
          <p className="mt-3 text-lg text-white/90">
            For emergencies such as chest pain or heavy bleeding, call 112 instead.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink
            href="/doctors"
            size="lg"
            className="!text-primary hover:bg-primary-soft bg-white"
          >
            Find a doctor
          </ButtonLink>
          <ButtonLink
            href="/login"
            size="lg"
            className="border border-white/70 text-white hover:bg-white/10"
          >
            Sign in
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
