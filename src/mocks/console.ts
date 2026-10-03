import type { Medicine } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007). The medicine list is a small sample, not a formulary, and nothing here is
// medical advice. The real list, dose rules and the list of medicines restricted online are supplied and reviewed by
// the human before any prescribing goes live.
export const mockMedicines: Medicine[] = [
  {
    id: "med-1",
    name: "Paracetamol",
    form: "Tablet",
    strengths: ["500 mg", "650 mg"],
    classes: ["analgesic"],
  },
  {
    id: "med-2",
    name: "Amoxicillin",
    form: "Capsule",
    strengths: ["250 mg", "500 mg"],
    classes: ["penicillin", "antibiotic"],
  },
  {
    id: "med-3",
    name: "Azithromycin",
    form: "Tablet",
    strengths: ["250 mg", "500 mg"],
    classes: ["macrolide", "antibiotic"],
  },
  {
    id: "med-4",
    name: "Cetirizine",
    form: "Tablet",
    strengths: ["5 mg", "10 mg"],
    classes: ["antihistamine"],
  },
  {
    id: "med-5",
    name: "Ibuprofen",
    form: "Tablet",
    strengths: ["200 mg", "400 mg"],
    classes: ["nsaid"],
  },
  {
    id: "med-6",
    name: "Pantoprazole",
    form: "Tablet",
    strengths: ["20 mg", "40 mg"],
    classes: ["ppi"],
  },
  {
    id: "med-7",
    name: "Metformin",
    form: "Tablet",
    strengths: ["500 mg", "850 mg"],
    classes: ["antidiabetic"],
  },
  {
    id: "med-8",
    name: "Amlodipine",
    form: "Tablet",
    strengths: ["2.5 mg", "5 mg"],
    classes: ["antihypertensive"],
  },
  {
    id: "med-9",
    name: "Levothyroxine",
    form: "Tablet",
    strengths: ["25 mcg", "50 mcg", "100 mcg"],
    classes: ["thyroid"],
  },
  {
    id: "med-10",
    name: "Salbutamol",
    form: "Inhaler",
    strengths: ["100 mcg per puff"],
    classes: ["bronchodilator"],
  },
  {
    id: "med-11",
    name: "Montelukast",
    form: "Tablet",
    strengths: ["4 mg", "5 mg", "10 mg"],
    classes: ["antiasthmatic"],
  },
  {
    id: "med-12",
    name: "Oral rehydration salts",
    form: "Powder",
    strengths: ["1 sachet"],
    classes: ["rehydration"],
  },
  {
    id: "med-13",
    name: "Co-trimoxazole",
    form: "Tablet",
    strengths: ["480 mg", "960 mg"],
    classes: ["sulfa", "antibiotic"],
  },
  {
    id: "med-14",
    name: "Alprazolam",
    form: "Tablet",
    strengths: ["0.25 mg", "0.5 mg"],
    classes: ["benzodiazepine"],
    restricted: true,
  },
];

export const mockPatientContext: Record<
  string,
  {
    conditions: string[];
    medicines: string[];
    pastVisits: Array<{ date: string; summary: string }>;
    files: Array<{ id: string; title: string; type: string; sharedOn: string }>;
  }
> = {
  "p-4": {
    conditions: ["Asthma"],
    medicines: ["Salbutamol inhaler, when needed"],
    pastVisits: [
      { date: "2026-09-25", summary: "Cough and wheeze. Advised inhaler technique and a review." },
      { date: "2026-08-12", summary: "Seasonal allergy symptoms." },
    ],
    files: [
      { id: "f-1", title: "Chest X-ray, August", type: "X-rays", sharedOn: "2026-09-25" },
      { id: "f-2", title: "Throat photo", type: "Injury photos", sharedOn: "2026-10-02" },
    ],
  },
};
