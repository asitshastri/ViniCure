export type Role = "patient" | "doctor" | "admin" | "support";

export type SessionUser = {
  name: string;
  /** Short line under the name, for example "Patient" or "General Physician". */
  subtitle: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  time: string;
  unread: boolean;
};

export type MockSession = {
  user: SessionUser;
  notifications: NotificationItem[];
};

export type SpecialtyIcon =
  | "general"
  | "heart"
  | "child"
  | "skin"
  | "women"
  | "mind"
  | "bone"
  | "eye"
  | "ear"
  | "tooth"
  | "diabetes"
  | "lungs";

export type Specialty = {
  slug: string;
  name: string;
  /** What people usually come for, one short line. */
  blurb: string;
  icon: SpecialtyIcon;
};

export type DoctorSummary = {
  id: string;
  name: string;
  specialty: string;
  specialtySlug: string;
  qualifications: string;
  /** Medical council registration number. Shown wherever a doctor appears. */
  registrationNumber: string;
  experienceYears: number;
  languages: string[];
  rating: number;
  reviewCount: number;
  feePaise: number;
  /** Short label for the next free slot, in IST. */
  nextSlot: string;
  availableToday: boolean;
};

export type DoctorSlot = {
  id: string;
  /** IST calendar date, YYYY-MM-DD. */
  date: string;
  /** IST time, 24-hour HH:mm. */
  time: string;
};

export type DoctorReview = {
  id: string;
  /** First name and initial only. */
  author: string;
  rating: number;
  text: string;
  when: string;
};

export type DoctorProfile = DoctorSummary & {
  about: string;
  education: string[];
  treats: string[];
  council: string;
  audioFeePaise: number;
  followUpFeePaise: number;
  slots: DoctorSlot[];
  reviews: DoctorReview[];
};

export type ConsultationType = {
  id: string;
  name: string;
  description: string;
  icon: "video" | "audio" | "followup";
  fromPaise: number;
};

export type PatientStory = {
  id: string;
  quote: string;
  name: string;
  place: string;
  context: string;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type HomeContent = {
  popularSearches: Specialty[];
  specialties: Specialty[];
  featuredDoctors: DoctorSummary[];
  consultationTypes: ConsultationType[];
  stories: PatientStory[];
  faqs: FaqItem[];
};

export type ConsultMode = "video" | "audio" | "followup";

export type FamilyMember = {
  id: string;
  name: string;
  relation: string;
  age: number;
};

export type PaymentMethod = "upi" | "card" | "netbanking";

export type PaymentResult =
  | { status: "paid"; reference: string }
  | { status: "failed"; reason: "declined" | "bank_down" }
  | { status: "pending" }
  | { status: "slot_taken" };

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  items?: string[];
};

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  /** Draft date, shown on the page. */
  draftDate: string;
  sections: LegalSection[];
};

export type SpecialtyWithCount = Specialty & { doctorCount: number };
