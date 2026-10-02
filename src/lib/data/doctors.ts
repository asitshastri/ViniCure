import { mockDoctors } from "@/mocks/doctors";
import { mockSpecialties } from "@/mocks/home";
import { PAGE_SIZE, type DirectoryQuery } from "@/lib/schemas/doctors";
import type { DoctorProfile, DoctorSummary, Specialty } from "@/lib/types";

// Components get data through this layer only. In P4 these call the directory API,
// which will filter and sort in SQL from the same allow-lists.

export type DirectoryResult = {
  items: DoctorSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export function getDirectoryFacets(): { specialties: Specialty[]; languages: string[] } {
  const languages = [...new Set(mockDoctors.flatMap((d) => d.languages))].sort();
  return { specialties: mockSpecialties, languages };
}

function toSummary(d: DoctorProfile): DoctorSummary {
  return {
    id: d.id,
    name: d.name,
    specialty: d.specialty,
    specialtySlug: d.specialtySlug,
    qualifications: d.qualifications,
    registrationNumber: d.registrationNumber,
    experienceYears: d.experienceYears,
    languages: d.languages,
    rating: d.rating,
    reviewCount: d.reviewCount,
    feePaise: d.feePaise,
    nextSlot: d.nextSlot,
    availableToday: d.availableToday,
  };
}

function score(d: DoctorProfile, tokens: string[]): number {
  const name = d.name.toLowerCase();
  const blurb = mockSpecialties.find((s) => s.slug === d.specialtySlug)?.blurb ?? "";
  const rest = [d.specialty, blurb, d.qualifications, ...d.treats].join(" ").toLowerCase();
  return tokens.reduce(
    (sum, t) => sum + (name.includes(t) ? 3 : 0) + (rest.includes(t) ? 1 : 0),
    0,
  );
}

export function searchDoctors(query: DirectoryQuery): DirectoryResult {
  const tokens = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  let list = mockDoctors.filter((d) => {
    if (query.specialty && d.specialtySlug !== query.specialty) return false;
    if (query.language && !d.languages.includes(query.language)) return false;
    if (query.maxFee && d.feePaise > query.maxFee * 100) return false;
    if (query.today && !d.availableToday) return false;
    if (tokens.length && score(d, tokens) === 0) return false;
    return true;
  });

  const first = (d: DoctorProfile) => {
    const slot = d.slots[0];
    return slot ? `${slot.date}${slot.time}` : "9999";
  };
  const sorters: Record<DirectoryQuery["sort"], (a: DoctorProfile, b: DoctorProfile) => number> = {
    relevance: (a, b) => (tokens.length ? score(b, tokens) - score(a, tokens) : 0),
    soonest: (a, b) => first(a).localeCompare(first(b)),
    fee_asc: (a, b) => a.feePaise - b.feePaise,
    fee_desc: (a, b) => b.feePaise - a.feePaise,
    experience: (a, b) => b.experienceYears - a.experienceYears,
    rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  };
  list = [...list].sort(sorters[query.sort]);

  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const items = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toSummary);
  return { items, total, page, pageCount };
}

export function getDoctor(id: string): DoctorProfile | undefined {
  return mockDoctors.find((d) => d.id === id);
}

export function getDoctorIds(): string[] {
  return mockDoctors.map((d) => d.id);
}

export { formatSlotDay, formatSlotTime } from "@/mocks/doctors";
