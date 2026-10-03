import type {
  ConsentItem,
  MedicalHistory,
  PatientProfile,
  ReferralInfo,
  SignInSession,
  VitalReading,
} from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007).
export const mockProfile: PatientProfile = {
  name: "Asha Verma",
  phoneMasked: "+91 98••••••10",
  email: "asha@example.com",
  dob: "1991-04-12",
  sex: "female",
  language: "Hindi",
  emergency: { name: "Ramesh Verma", relation: "Father", phone: "9876500011" },
};

export const mockHistory: MedicalHistory = {
  conditions: ["Hypothyroidism"],
  allergies: ["Penicillin", "Peanuts"],
  medicines: [{ id: "m-1", name: "Levothyroxine", dose: "50 mcg, morning" }],
  updatedOn: "2026-09-24",
};

export const mockVitals: VitalReading[] = [
  { id: "v-1", date: "2026-10-01", sys: 118, dia: 76, pulse: 72, weight: 62.4 },
  { id: "v-2", date: "2026-09-27", sys: 122, dia: 80, pulse: 76, sugar: 98, note: "After a walk" },
  { id: "v-3", date: "2026-09-20", sys: 120, dia: 78, pulse: 70, spo2: 98, temp: 36.8 },
];

export const mockConsents: ConsentItem[] = [
  {
    id: "care",
    title: "Use my details to give me care",
    description:
      "Lets your doctor see your profile, history and records for consultations you book. Needed to use ViniCure for care.",
    required: true,
    granted: true,
    since: "2026-08-14",
  },
  {
    id: "reminders",
    title: "Reminders by SMS and WhatsApp",
    description: "Appointment and follow-up reminders, and prescription-ready messages.",
    required: false,
    granted: true,
    since: "2026-08-14",
  },
  {
    id: "updates",
    title: "Health tips and news",
    description: "Occasional messages about new features and health advice. Never sold or shared.",
    required: false,
    granted: false,
    since: "2026-08-14",
  },
];

export const mockSessions: SignInSession[] = [
  {
    id: "s-1",
    device: "Phone",
    browser: "Chrome on Android",
    place: "Pune, India",
    lastActive: "Now",
    current: true,
  },
  {
    id: "s-2",
    device: "Laptop",
    browser: "Edge on Windows",
    place: "Pune, India",
    lastActive: "Yesterday, 9:12 pm",
    current: false,
  },
  {
    id: "s-3",
    device: "Tablet",
    browser: "Safari on iPad",
    place: "Mumbai, India",
    lastActive: "21 Sep, 4:40 pm",
    current: false,
  },
];

export const mockReferral: ReferralInfo = {
  code: "ASHA4K9",
  link: "https://vinicure.example/join?ref=ASHA4K9",
  people: [
    { id: "p-1", initials: "RK", status: "booked" },
    { id: "p-2", initials: "SM", status: "joined" },
    { id: "p-3", initials: "AD", status: "invited" },
  ],
};
