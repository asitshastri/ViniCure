import type { ApplicationDoc, DoctorApplication } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007).
export const COUNCILS = [
  "Andhra Pradesh Medical Council",
  "Delhi Medical Council",
  "Gujarat Medical Council",
  "Karnataka Medical Council",
  "Maharashtra Medical Council",
  "Tamil Nadu Medical Council",
  "Telangana Medical Council",
  "Travancore-Cochin Medical Council",
  "Uttar Pradesh Medical Council",
  "West Bengal Medical Council",
];

export const SPECIALTIES_FOR_APPLICATION = [
  "General physician",
  "Cardiology",
  "Paediatrics",
  "Dermatology",
  "Gynaecology",
  "Mental health",
  "Orthopaedics",
  "Diabetes and thyroid",
  "Eye care",
  "ENT",
  "Dental",
  "Chest and breathing",
];

export const LANGUAGE_CHOICES = [
  "English",
  "Hindi",
  "Marathi",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Punjabi",
  "Urdu",
];

const blankDocs = (): ApplicationDoc[] => [
  {
    id: "reg",
    label: "Medical council registration certificate",
    hint: "A clear photo or scan of the full page, showing your number and name.",
    required: true,
    state: "missing",
  },
  {
    id: "degree",
    label: "Medical degree certificate",
    hint: "Your MBBS, BDS or highest degree. Add the specialty degree too if you have one.",
    required: true,
    state: "missing",
  },
  {
    id: "id",
    label: "Photo ID",
    hint: "A government photo ID. Do not upload Aadhaar or PAN. [Accepted ID types to be confirmed by legal review.]",
    required: true,
    state: "missing",
  },
  {
    id: "bank",
    label: "Bank proof for payouts",
    hint: "A cancelled cheque or bank statement page with your name and account number.",
    required: true,
    state: "missing",
  },
  {
    id: "photo",
    label: "Profile photo",
    hint: "Optional. A friendly, clear photo. Patients see it on your profile.",
    required: false,
    state: "missing",
  },
];

export const baseDetails: DoctorApplication["details"] = {
  name: "Dr. Maya Rao",
  registrationNumber: "",
  council: "",
  registrationYear: "",
  specialty: "",
  experienceYears: "",
  languages: [],
  feeRupees: "",
  bio: "",
  qualifications: [],
};

const filledDetails: DoctorApplication["details"] = {
  name: "Dr. Maya Rao",
  registrationNumber: "KA/45678/2011",
  council: "Karnataka Medical Council",
  registrationYear: "2011",
  specialty: "General physician",
  experienceYears: "14",
  languages: ["English", "Hindi", "Kannada"],
  feeRupees: "499",
  bio: "Family doctor for adults. I explain what I find in plain words.",
  qualifications: [
    { id: "q-1", degree: "MBBS", college: "Bangalore Medical College", year: "2009" },
    {
      id: "q-2",
      degree: "MD (General Medicine)",
      college: "St John’s Medical College",
      year: "2013",
    },
  ],
};

const withStates = (states: Record<string, Partial<ApplicationDoc>>): ApplicationDoc[] =>
  blankDocs().map((d) => ({ ...d, ...(states[d.id] ?? {}) }));

export function buildApplication(scenario: string): DoctorApplication {
  switch (scenario) {
    case "submitted":
      return {
        status: "submitted",
        details: filledDetails,
        docs: withStates({
          reg: { state: "uploaded", fileName: "registration.pdf" },
          degree: { state: "uploaded", fileName: "mbbs.pdf" },
          id: { state: "uploaded", fileName: "id.jpg" },
          bank: { state: "uploaded", fileName: "cheque.jpg" },
        }),
        events: [{ when: "2 Oct, 4:40 pm", text: "You submitted your application." }],
      };
    case "review":
      return {
        status: "in_review",
        details: filledDetails,
        docs: withStates({
          reg: { state: "accepted", fileName: "registration.pdf" },
          degree: { state: "uploaded", fileName: "mbbs.pdf" },
          id: { state: "uploaded", fileName: "id.jpg" },
          bank: { state: "uploaded", fileName: "cheque.jpg" },
        }),
        events: [
          { when: "2 Oct, 5:10 pm", text: "A reviewer started checking your registration." },
          { when: "2 Oct, 4:40 pm", text: "You submitted your application." },
        ],
      };
    case "changes":
      return {
        status: "changes_needed",
        details: filledDetails,
        docs: withStates({
          reg: { state: "accepted", fileName: "registration.pdf" },
          degree: {
            state: "replace",
            fileName: "mbbs.pdf",
            reason:
              "The page is blurry and the year cannot be read. Please upload a sharper photo or scan.",
          },
          id: { state: "accepted", fileName: "id.jpg" },
          bank: {
            state: "replace",
            fileName: "cheque.jpg",
            reason:
              "The name on the account does not match your registration. Upload proof in your own name.",
          },
        }),
        events: [
          { when: "3 Oct, 11:20 am", text: "We need two documents replaced. See the notes below." },
          { when: "2 Oct, 4:40 pm", text: "You submitted your application." },
        ],
      };
    case "approved":
      return {
        status: "approved",
        details: filledDetails,
        docs: withStates({
          reg: { state: "accepted", fileName: "registration.pdf" },
          degree: { state: "accepted", fileName: "mbbs.pdf" },
          id: { state: "accepted", fileName: "id.jpg" },
          bank: { state: "accepted", fileName: "cheque.jpg" },
        }),
        events: [
          { when: "4 Oct, 10:05 am", text: "Your profile is approved and visible to patients." },
          { when: "3 Oct, 6:30 pm", text: "Your registration was checked with the council." },
          { when: "2 Oct, 4:40 pm", text: "You submitted your application." },
        ],
      };
    case "almost":
      return {
        status: "draft",
        details: filledDetails,
        docs: withStates({
          reg: { state: "uploaded", fileName: "registration.pdf" },
          degree: { state: "uploaded", fileName: "mbbs.pdf" },
          id: { state: "uploaded", fileName: "id.jpg" },
          bank: { state: "uploaded", fileName: "cheque.jpg" },
        }),
        events: [{ when: "2 Oct, 3:15 pm", text: "You started your application." }],
      };
    default:
      return {
        status: "draft",
        details: baseDetails,
        docs: blankDocs(),
        events: [{ when: "2 Oct, 3:15 pm", text: "You started your application." }],
      };
  }
}
