import { z } from "zod";
import { getDirectory, publicDoctorsQuery } from "@/modules/directory";
import type { PublicDoctorView } from "@/modules/directory";
import { getEngagement } from "@/modules/engagement";
import { getSlots } from "@/modules/scheduling";
import { istDate } from "@/modules/scheduling/slots";
import type { DirectoryQuery } from "@/lib/schemas/doctors";
import type {
  DoctorProfile,
  DoctorReview,
  DoctorSlot,
  DoctorSummary,
  Specialty,
  SpecialtyIcon,
} from "@/lib/types";

// The public directory from the real services, for the server-rendered pages. It calls the same
// module code as /api/v1, in this process, so the rules (only listed doctors, allow-listed
// filters, cursors) are identical. Fields the database does not hold yet are left out and the
// screens hide them.

/** Real data when a database is configured, unless the sample data is asked for. */
export function isRealDirectory(): boolean {
  return Boolean(process.env.DATABASE_URL) && process.env.UI_MOCK_DIRECTORY !== "true";
}

export const REAL_PAGE_SIZE = 8;
/** Languages offered as a filter. The directory has no list of its own yet. */
export const REAL_LANGUAGES = ["English", "Hindi", "Gujarati", "Marathi", "Tamil", "Bengali"];

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ICONS: [RegExp, SpecialtyIcon][] = [
  [/cardi/, "heart"],
  [/paed|pedia/, "child"],
  [/derma|skin/, "skin"],
  [/gynae|gyne|obstet/, "women"],
  [/psych|mental/, "mind"],
  [/ortho/, "bone"],
  [/ophthal|eye/, "eye"],
  [/ent\b|ear/, "ear"],
  [/dental|tooth/, "tooth"],
  [/diabet|endocr/, "diabetes"],
  [/pulmo|chest|lung/, "lungs"],
];
const iconFor = (name: string): SpecialtyIcon =>
  ICONS.find(([re]) => re.test(name.toLowerCase()))?.[1] ?? "general";

export async function realFacets(): Promise<{ specialties: Specialty[]; languages: string[] }> {
  const list = await getDirectory().specialties();
  return {
    specialties: list.map((s) => ({
      slug: slugify(s.name),
      name: s.name,
      blurb: "",
      icon: iconFor(s.name),
    })),
    languages: REAL_LANGUAGES,
  };
}

function toSummary(d: PublicDoctorView): DoctorSummary {
  return {
    id: d.id,
    name: d.displayName,
    specialty: d.specialty?.name ?? "Doctor",
    specialtySlug: d.specialty ? slugify(d.specialty.name) : "",
    qualifications: d.qualifications,
    registrationNumber: d.registrationNo,
    languages: d.languages,
    rating: d.ratingAvg ?? 0,
    reviewCount: d.ratingCount,
    feePaise: d.consultationFeePaise,
    availableToday: d.availableToday,
  };
}

export type RealDirectoryResult = {
  items: DoctorSummary[];
  nextCursor: string | null;
};

export async function realSearch(query: DirectoryQuery): Promise<RealDirectoryResult> {
  const specialtyId = query.specialty
    ? (await getDirectory().specialties()).find((s) => slugify(s.name) === query.specialty)?.id
    : undefined;
  // A specialty that does not exist matches nobody, rather than everybody.
  if (query.specialty && specialtyId === undefined) return { items: [], nextCursor: null };
  const parsed = publicDoctorsQuery.safeParse({
    ...(query.q && query.q.length >= 2 ? { q: query.q } : {}),
    ...(specialtyId !== undefined ? { specialtyId: String(specialtyId) } : {}),
    ...(query.language ? { language: query.language } : {}),
    ...(query.maxFee ? { feeMax: String(query.maxFee * 100) } : {}),
    ...(query.today ? { availableToday: "true" } : {}),
    sort: query.sort === "fee_asc" || query.sort === "fee_desc" ? query.sort : "name",
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: String(REAL_PAGE_SIZE),
  });
  if (!parsed.success) return { items: [], nextCursor: null };
  try {
    const page = await getDirectory().searchDoctors(parsed.data);
    return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
  } catch (error) {
    // A page link that does not belong to this search is simply not followed.
    if ((error as { code?: string }).code === "validation_failed")
      return { items: [], nextCursor: null };
    throw error;
  }
}

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });

const whenLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** One doctor with the free slots of the coming week and the first published reviews. */
export async function realDoctor(id: string): Promise<DoctorProfile | undefined> {
  if (!z.uuid().safeParse(id).success) return undefined;
  let view: PublicDoctorView;
  try {
    view = await getDirectory().publicProfile(id);
  } catch {
    return undefined;
  }
  const today = new Date();
  const [slots, reviews] = await Promise.all([
    getSlots()
      .list(id, { from: istDate(today) })
      .catch(() => ({ slots: [] })),
    getEngagement()
      .publicReviews(id, { limit: 5 })
      .catch(() => ({ items: [] })),
  ]);
  const slotList: DoctorSlot[] = slots.slots.map((s) => ({
    id: s.startAt,
    date: istDate(new Date(s.startAt)),
    time: istTime(s.startAt),
  }));
  const reviewList: DoctorReview[] = reviews.items.map((r) => ({
    id: r.id,
    author: "Verified patient",
    rating: r.rating,
    text: r.comment ?? "",
    when: whenLabel(r.createdAt),
  }));
  return {
    ...toSummary(view),
    real: true,
    education: [view.qualifications],
    treats: [],
    council: view.registrationCouncil,
    slots: slotList,
    reviews: reviewList,
  };
}
