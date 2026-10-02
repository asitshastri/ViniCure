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

export type Specialty = {
  slug: string;
  name: string;
  /** What patients usually come for, one short line. */
  blurb: string;
  icon: "stethoscope" | "baby" | "heart" | "brain" | "bone" | "skin" | "lungs" | "tooth" | "eye";
};

export type FeaturedDoctor = {
  id: string;
  name: string;
  specialty: string;
  languages: string[];
  experienceYears: number;
  /** Fee in integer paise. Money is never a float. */
  feePaise: number;
  rating: number;
  reviewCount: number;
  /** State medical council registration. FAKE in mock data. */
  registrationNumber: string;
  nextSlot: string;
};

export type PatientStory = {
  id: string;
  quote: string;
  name: string;
  place: string;
};

export type FaqEntry = { id: string; question: string; answer: string };

export type HomeContent = {
  specialties: Specialty[];
  doctors: FeaturedDoctor[];
  stories: PatientStory[];
  faqs: FaqEntry[];
};
