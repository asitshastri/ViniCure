import type { DoctorProfile, DoctorReview, DoctorSlot } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007). Names, registration numbers and reviews are invented.

/** The mock clock. Fixed so server and browser render the same page. IST. */
export const MOCK_NOW = { date: "2026-10-02", time: "17:00" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatSlotDay(date: string): string {
  if (date === MOCK_NOW.date) return "Today";
  if (date === addDays(MOCK_NOW.date, 1)) return "Tomorrow";
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatSlotTime(time: string): string {
  const [h = "0", m = "00"] = time.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour < 12 ? "am" : "pm"}`;
}

const TIME_SETS: string[][] = [
  ["09:00", "09:30", "10:30", "11:00", "17:30", "18:30", "19:00", "20:00"],
  ["10:00", "10:30", "11:30", "12:00", "16:00", "17:00", "18:00", "21:00"],
  ["08:30", "09:00", "13:00", "13:30", "18:00", "18:30", "19:30", "20:30"],
];

function buildSlots(id: string, seed: number, todayAvailable: boolean): DoctorSlot[] {
  const times = TIME_SETS[seed % TIME_SETS.length] ?? [];
  const slots: DoctorSlot[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (day === 0 && !todayAvailable) continue;
    const date = addDays(MOCK_NOW.date, day);
    // A few gaps so the picker shows a realistic mix of free and busy times.
    times.forEach((time, i) => {
      if ((i + day + seed) % 3 === 0) return;
      if (date === MOCK_NOW.date && time <= MOCK_NOW.time) return;
      slots.push({ id: `${id}-${date}-${time.replace(":", "")}`, date, time });
    });
  }
  return slots;
}

type Seed = {
  name: string;
  specialty: string;
  specialtySlug: string;
  qualifications: string;
  reg: string;
  council: string;
  years: number;
  languages: string[];
  rating: number;
  reviews: number;
  fee: number;
  today: boolean;
  about: string;
  education: string[];
  treats: string[];
};

const seeds: Seed[] = [
  {
    name: "Dr. Maya Rao",
    specialty: "General physician",
    specialtySlug: "general-physician",
    qualifications: "MBBS, MD (Medicine)",
    reg: "KA/45678/2011",
    council: "Karnataka Medical Council",
    years: 14,
    languages: ["English", "Hindi", "Kannada"],
    rating: 4.8,
    reviews: 312,
    fee: 499,
    today: true,
    about:
      "Family doctor for adults. I listen first, explain what I find in plain words and tell you clearly when you need a test or an in-person visit.",
    education: [
      "MBBS, Bangalore Medical College",
      "MD (General Medicine), St John’s Medical College",
    ],
    treats: [
      "Fever and infections",
      "Diabetes and blood pressure follow-up",
      "Cough, cold and allergies",
      "General check-ups",
    ],
  },
  {
    name: "Dr. Arjun Nair",
    specialty: "Cardiology",
    specialtySlug: "cardiology",
    qualifications: "MBBS, DM (Cardiology)",
    reg: "KL/22910/2008",
    council: "Travancore-Cochin Medical Council",
    years: 17,
    languages: ["English", "Malayalam", "Hindi"],
    rating: 4.9,
    reviews: 188,
    fee: 799,
    today: false,
    about:
      "Heart specialist focused on prevention and long-term care. I review your reports before the call so we spend the time on decisions.",
    education: ["MBBS, Government Medical College Thiruvananthapuram", "DM (Cardiology), SCTIMST"],
    treats: [
      "High blood pressure",
      "Chest discomfort review",
      "Cholesterol",
      "Post-procedure follow-up",
    ],
  },
  {
    name: "Dr. Farah Sheikh",
    specialty: "Paediatrics",
    specialtySlug: "paediatrics",
    qualifications: "MBBS, DCH",
    reg: "MH/78124/2013",
    council: "Maharashtra Medical Council",
    years: 11,
    languages: ["English", "Hindi", "Marathi"],
    rating: 4.7,
    reviews: 254,
    fee: 599,
    today: true,
    about:
      "Child doctor who talks to parents and children. Good for fevers, feeding, growth and vaccine questions.",
    education: ["MBBS, Grant Medical College", "DCH, Bombay Hospital Institute"],
    treats: [
      "Fever in children",
      "Feeding and growth",
      "Vaccination schedule",
      "Coughs and tummy upsets",
    ],
  },
  {
    name: "Dr. Kiran Patel",
    specialty: "Dermatology",
    specialtySlug: "dermatology",
    qualifications: "MBBS, MD (Dermatology)",
    reg: "GJ/31377/2012",
    council: "Gujarat Medical Council",
    years: 12,
    languages: ["English", "Hindi", "Gujarati"],
    rating: 4.8,
    reviews: 207,
    fee: 599,
    today: false,
    about:
      "Skin, hair and nail problems. Upload clear photos before the call so I can look closely and plan treatment.",
    education: ["MBBS, B.J. Medical College", "MD (Dermatology), NHL Municipal Medical College"],
    treats: ["Acne and pigmentation", "Rashes and eczema", "Hair fall", "Fungal infections"],
  },
  {
    name: "Dr. Latha Iyer",
    specialty: "Gynaecology",
    specialtySlug: "gynaecology",
    qualifications: "MBBS, MS (Obstetrics and Gynaecology)",
    reg: "TN/58231/2009",
    council: "Tamil Nadu Medical Council",
    years: 16,
    languages: ["English", "Tamil", "Hindi"],
    rating: 4.9,
    reviews: 276,
    fee: 699,
    today: true,
    about: "Women’s health from periods to pregnancy care. A private, unhurried conversation.",
    education: ["MBBS, Madras Medical College", "MS (OBG), Stanley Medical College"],
    treats: ["Irregular periods", "PCOS", "Pregnancy questions", "Menopause"],
  },
  {
    name: "Dr. Sameer Khan",
    specialty: "Mental health",
    specialtySlug: "mental-health",
    qualifications: "MBBS, MD (Psychiatry)",
    reg: "DL/40912/2014",
    council: "Delhi Medical Council",
    years: 10,
    languages: ["English", "Hindi", "Urdu"],
    rating: 4.7,
    reviews: 143,
    fee: 899,
    today: false,
    about:
      "Psychiatrist for stress, sleep, anxiety and low mood. Sessions are confidential and unhurried.",
    education: ["MBBS, Maulana Azad Medical College", "MD (Psychiatry), AIIMS Delhi"],
    treats: ["Anxiety and stress", "Sleep problems", "Low mood", "Medication review"],
  },
  {
    name: "Dr. Rohit Banerjee",
    specialty: "Orthopaedics",
    specialtySlug: "orthopaedics",
    qualifications: "MBBS, MS (Orthopaedics)",
    reg: "WB/19844/2010",
    council: "West Bengal Medical Council",
    years: 15,
    languages: ["English", "Bengali", "Hindi"],
    rating: 4.6,
    reviews: 165,
    fee: 699,
    today: true,
    about:
      "Bone, joint and spine problems. I will tell you honestly when exercises are enough and when you need a scan or surgery opinion.",
    education: ["MBBS, Calcutta Medical College", "MS (Orthopaedics), IPGMER Kolkata"],
    treats: [
      "Back and neck pain",
      "Knee and shoulder pain",
      "Sports injuries",
      "Fracture follow-up",
    ],
  },
  {
    name: "Dr. Anita Deshmukh",
    specialty: "Diabetes and thyroid",
    specialtySlug: "diabetes",
    qualifications: "MBBS, MD, DM (Endocrinology)",
    reg: "MH/66012/2010",
    council: "Maharashtra Medical Council",
    years: 15,
    languages: ["English", "Marathi", "Hindi"],
    rating: 4.8,
    reviews: 219,
    fee: 799,
    today: false,
    about:
      "Endocrinologist for sugar control, thyroid and weight. We build a plan you can follow with Indian food and routines.",
    education: ["MBBS, B.J. Medical College Pune", "DM (Endocrinology), KEM Hospital"],
    treats: ["Type 2 diabetes", "Thyroid disorders", "Weight management", "PCOS and hormones"],
  },
  {
    name: "Dr. Vikram Reddy",
    specialty: "Eye care",
    specialtySlug: "ophthalmology",
    qualifications: "MBBS, MS (Ophthalmology)",
    reg: "TS/27455/2011",
    council: "Telangana Medical Council",
    years: 13,
    languages: ["English", "Telugu", "Hindi"],
    rating: 4.6,
    reviews: 98,
    fee: 599,
    today: true,
    about:
      "Eye doctor for redness, strain, vision changes and follow-up after eye surgery. I will say when you need to be seen in person.",
    education: ["MBBS, Osmania Medical College", "MS (Ophthalmology), L V Prasad Eye Institute"],
    treats: [
      "Red or watery eyes",
      "Digital eye strain",
      "Vision changes",
      "Post-surgery follow-up",
    ],
  },
  {
    name: "Dr. Neha Joshi",
    specialty: "ENT",
    specialtySlug: "ent",
    qualifications: "MBBS, MS (ENT)",
    reg: "RJ/30127/2015",
    council: "Rajasthan Medical Council",
    years: 9,
    languages: ["English", "Hindi"],
    rating: 4.5,
    reviews: 87,
    fee: 499,
    today: false,
    about:
      "Ear, nose and throat problems in adults and children, from blocked sinuses to sore throats.",
    education: ["MBBS, SMS Medical College Jaipur", "MS (ENT), SMS Medical College Jaipur"],
    treats: ["Sinus problems", "Ear pain", "Throat infections", "Snoring"],
  },
  {
    name: "Dr. Imran Qureshi",
    specialty: "Chest and breathing",
    specialtySlug: "pulmonology",
    qualifications: "MBBS, MD (Pulmonary Medicine)",
    reg: "UP/52318/2012",
    council: "Uttar Pradesh Medical Council",
    years: 12,
    languages: ["English", "Hindi", "Urdu"],
    rating: 4.7,
    reviews: 121,
    fee: 699,
    today: true,
    about:
      "Chest physician for asthma, long coughs and breathlessness. I help you use inhalers properly and track your progress.",
    education: ["MBBS, KGMU Lucknow", "MD (Pulmonary Medicine), VP Chest Institute"],
    treats: ["Asthma", "Long-standing cough", "Breathlessness", "Sleep apnoea review"],
  },
  {
    name: "Dr. Meera Krishnan",
    specialty: "General physician",
    specialtySlug: "general-physician",
    qualifications: "MBBS, DNB (Family Medicine)",
    reg: "TN/61903/2016",
    council: "Tamil Nadu Medical Council",
    years: 8,
    languages: ["English", "Tamil", "Telugu"],
    rating: 4.6,
    reviews: 134,
    fee: 349,
    today: true,
    about: "Family medicine doctor for everyday problems and ongoing care for the whole family.",
    education: [
      "MBBS, Coimbatore Medical College",
      "DNB (Family Medicine), Apollo Hospitals Chennai",
    ],
    treats: [
      "Cold, cough and fever",
      "Stomach upsets",
      "Blood pressure checks",
      "Health advice for parents",
    ],
  },
  {
    name: "Dr. Harpreet Singh",
    specialty: "Dental",
    specialtySlug: "dental",
    qualifications: "BDS, MDS (Oral Medicine)",
    reg: "PB/12984/2014",
    council: "Punjab Dental Council",
    years: 10,
    languages: ["English", "Hindi", "Punjabi"],
    rating: 4.5,
    reviews: 76,
    fee: 399,
    today: false,
    about:
      "Dentist who can assess pain, swelling and gum problems by video and tell you what needs a clinic visit.",
    education: ["BDS, Government Dental College Patiala", "MDS (Oral Medicine), Manipal"],
    treats: ["Tooth pain", "Gum bleeding", "Mouth ulcers", "Braces questions"],
  },
  {
    name: "Dr. Divya Menon",
    specialty: "Paediatrics",
    specialtySlug: "paediatrics",
    qualifications: "MBBS, MD (Paediatrics)",
    reg: "KL/35520/2013",
    council: "Travancore-Cochin Medical Council",
    years: 12,
    languages: ["English", "Malayalam", "Hindi"],
    rating: 4.9,
    reviews: 301,
    fee: 649,
    today: true,
    about:
      "Paediatrician with a calm way with worried parents. Newborn care, allergies and development concerns.",
    education: ["MBBS, Kozhikode Medical College", "MD (Paediatrics), JIPMER"],
    treats: ["Newborn care", "Allergies", "Development concerns", "Recurrent infections"],
  },
];

const reviewTexts: Array<[string, number, string, string]> = [
  [
    "Priya S.",
    5,
    "Explained everything clearly and did not rush. The prescription came within minutes.",
    "2 weeks ago",
  ],
  ["Rahul D.", 5, "Looked at my reports before the call. Very helpful.", "1 month ago"],
  [
    "Anita K.",
    4,
    "Good advice. The call started ten minutes late but the doctor apologised and made up for it.",
    "1 month ago",
  ],
  ["Mohan R.", 5, "Spoke in my language and made my father comfortable.", "2 months ago"],
];

function buildReviews(id: string, rating: number): DoctorReview[] {
  return reviewTexts.map(([author, stars, text, when], i) => ({
    id: `${id}-r${i}`,
    author,
    rating: Math.min(5, Math.max(4, Math.round(stars - (rating < 4.6 && i === 2 ? 1 : 0)))),
    text,
    when,
  }));
}

export const mockDoctors: DoctorProfile[] = seeds.map((s, i) => {
  const id = `d-${1001 + i}`;
  const slots = buildSlots(id, i, s.today);
  const first = slots[0];
  return {
    id,
    name: s.name,
    specialty: s.specialty,
    specialtySlug: s.specialtySlug,
    qualifications: s.qualifications,
    registrationNumber: s.reg,
    experienceYears: s.years,
    languages: s.languages,
    rating: s.rating,
    reviewCount: s.reviews,
    feePaise: s.fee * 100,
    nextSlot: first
      ? `${formatSlotDay(first.date)}, ${formatSlotTime(first.time)}`
      : "No slots this week",
    availableToday: slots.some((x) => x.date === MOCK_NOW.date),
    about: s.about,
    education: s.education,
    treats: s.treats,
    council: s.council,
    audioFeePaise: Math.round((s.fee * 100 * 0.65) / 100) * 100,
    followUpFeePaise: Math.round((s.fee * 100 * 0.5) / 100) * 100,
    slots,
    reviews: buildReviews(id, s.rating),
  };
});
