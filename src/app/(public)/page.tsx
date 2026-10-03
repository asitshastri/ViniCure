import { Benefits } from "@/components/home/benefits";
import { ConsultationTypes } from "@/components/home/consultation-types";
import { FaqTeaser } from "@/components/home/faq-teaser";
import { FeaturedDoctors } from "@/components/home/featured-doctors";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { SpecialtiesGrid } from "@/components/home/specialties-grid";
import { Stories } from "@/components/home/stories";
import { TrustStrip } from "@/components/home/trust-strip";
import { getHomeContent } from "@/lib/data/home";

export default function HomePage() {
  const home = getHomeContent();
  return (
    <>
      <Hero specialties={home.specialties} popular={home.popularSearches} />
      <TrustStrip />
      <SpecialtiesGrid specialties={home.specialties} />
      <HowItWorks />
      <FeaturedDoctors doctors={home.featuredDoctors} />
      <ConsultationTypes types={home.consultationTypes} />
      <Stories stories={home.stories} />
      <Benefits />
      <FaqTeaser faqs={home.faqs} />
      <FinalCta />
    </>
  );
}
