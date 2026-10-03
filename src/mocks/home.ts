import type { ConsultationType, FaqItem, PatientStory, Specialty } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007). Names, registration numbers and stories are invented.

export const mockSpecialties: Specialty[] = [
  {
    slug: "general-physician",
    name: "General physician",
    blurb: "Fever, cough, infections, check-ups",
    icon: "general",
  },
  {
    slug: "cardiology",
    name: "Cardiology",
    blurb: "Blood pressure, chest discomfort, heart health",
    icon: "heart",
  },
  {
    slug: "paediatrics",
    name: "Paediatrics",
    blurb: "Children’s health, growth, vaccines",
    icon: "child",
  },
  {
    slug: "dermatology",
    name: "Dermatology",
    blurb: "Skin, hair and nail concerns",
    icon: "skin",
  },
  {
    slug: "gynaecology",
    name: "Gynaecology",
    blurb: "Periods, pregnancy care, women’s health",
    icon: "women",
  },
  {
    slug: "mental-health",
    name: "Mental health",
    blurb: "Stress, sleep, anxiety, low mood",
    icon: "mind",
  },
  {
    slug: "orthopaedics",
    name: "Orthopaedics",
    blurb: "Joint pain, injuries, back and neck",
    icon: "bone",
  },
  {
    slug: "diabetes",
    name: "Diabetes and thyroid",
    blurb: "Sugar control, thyroid, weight",
    icon: "diabetes",
  },
  { slug: "ophthalmology", name: "Eye care", blurb: "Vision, redness, eye strain", icon: "eye" },
  { slug: "ent", name: "ENT", blurb: "Ear, nose and throat problems", icon: "ear" },
  { slug: "dental", name: "Dental", blurb: "Tooth pain, gums, advice", icon: "tooth" },
  {
    slug: "pulmonology",
    name: "Chest and breathing",
    blurb: "Asthma, long cough, breathlessness",
    icon: "lungs",
  },
];

export const mockConsultationTypes: ConsultationType[] = [
  {
    id: "video",
    name: "Video consultation",
    description:
      "Face to face with your doctor. Best for a first visit or anything you need to show.",
    icon: "video",
    fromPaise: 29900,
  },
  {
    id: "audio",
    name: "Audio consultation",
    description: "A phone-quality call that works on weak networks. Good for advice and results.",
    icon: "audio",
    fromPaise: 19900,
  },
  {
    id: "followup",
    name: "Follow-up",
    description: "Return to the same doctor within 7 days at a lower fee to review your progress.",
    icon: "followup",
    fromPaise: 14900,
  },
];

export const mockStories: PatientStory[] = [
  {
    id: "s1",
    quote:
      "My father is 72 and does not travel easily. The doctor spoke to him in Hindi, checked his reports and the prescription arrived before we hung up.",
    name: "Sunita M.",
    place: "Indore",
    context: "Booked for her father",
  },
  {
    id: "s2",
    quote:
      "I uploaded a photo of the rash and the doctor had already looked at it when the call began. No waiting room, no travel.",
    name: "Rahul D.",
    place: "Pune",
    context: "Skin consultation",
  },
  {
    id: "s3",
    quote:
      "Night-time fever for my daughter and I did not want to go out. Found a paediatrician within ten minutes and she was calm and clear.",
    name: "Priyanka S.",
    place: "Bengaluru",
    context: "Child fever",
  },
];

export const mockFaqs: FaqItem[] = [
  {
    id: "f1",
    question: "Are the doctors really registered?",
    answer:
      "Yes. We check every doctor’s medical council registration number before their profile goes live, and the number is shown on their profile and on every prescription.",
  },
  {
    id: "f2",
    question: "Is my health information private?",
    answer:
      "Your records are encrypted, stored in India and visible only to you and the doctor you choose to consult. You can see who opened them and withdraw your consent at any time.",
  },
  {
    id: "f3",
    question: "What if the doctor cannot treat me online?",
    answer:
      "Some problems need an in-person examination. If your doctor says so, they will tell you what to do next, and your fee is handled under our refund policy.",
  },
  {
    id: "f4",
    question: "Can I book for my parents or my child?",
    answer:
      "Yes. Add family members to your account and choose who the consultation is for when you book.",
  },
  {
    id: "f5",
    question: "Is it for emergencies?",
    answer:
      "No. In an emergency such as chest pain, severe bleeding or difficulty breathing, call 112 or go to the nearest hospital.",
  },
];
