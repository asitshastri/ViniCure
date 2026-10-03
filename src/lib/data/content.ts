import { legalDocs, patientRights } from "@/content/legal";
import {
  fitsOnline,
  grievanceSteps,
  howItWorksSteps,
  needsInPerson,
  verificationSteps,
} from "@/content/pages";
import { mockDoctors } from "@/mocks/doctors";
import { mockSpecialties } from "@/mocks/home";
import type { LegalDoc, SpecialtyWithCount } from "@/lib/types";

// Components get content through this layer only. In P9 the legal text comes from reviewed, versioned documents.

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return legalDocs[slug];
}

export const getPatientRights = () => patientRights;
export const getHowItWorks = () => ({ steps: howItWorksSteps, fitsOnline, needsInPerson });
export const getVerificationSteps = () => verificationSteps;
export const getGrievanceSteps = () => grievanceSteps;

export function getSpecialtiesWithCounts(): SpecialtyWithCount[] {
  return mockSpecialties.map((s) => ({
    ...s,
    doctorCount: mockDoctors.filter((d) => d.specialtySlug === s.slug).length,
  }));
}
