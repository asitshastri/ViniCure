import type { Article, FaqGroup, PatientStory } from "@/lib/types";

// FAKE, SAMPLE CONTENT for the UI-first phase (D-007). Real articles are reviewed by a registered doctor before they
// are published. Reviewer names and registration numbers below are invented.

export const mockArticles: Article[] = [
  {
    slug: "fever-in-adults-when-to-call-a-doctor",
    title: "Fever in adults: when rest is enough and when to call a doctor",
    excerpt: "Most fevers settle in a few days. Here are the signs that mean you should not wait.",
    category: "Everyday health",
    readMinutes: 4,
    published: "2026-09-18",
    reviewer: {
      name: "Dr. Maya Rao",
      specialty: "General physician",
      registrationNumber: "KA/45678/2011",
    },
    body: [
      {
        type: "p",
        text: "A fever is a sign that the body is fighting something, most often a viral infection. For many adults it passes with rest and fluids.",
      },
      { type: "h2", text: "What usually helps" },
      {
        type: "ul",
        items: [
          "Drink water, oral rehydration solution or soup often.",
          "Rest, and wear light clothing.",
          "Take a fever medicine only as the label or your doctor advises.",
        ],
      },
      { type: "h2", text: "When to speak to a doctor soon" },
      {
        type: "ul",
        items: [
          "A fever that lasts more than three days.",
          "A temperature of 103°F (39.4°C) or higher.",
          "A fever with a rash, severe headache or stiff neck.",
          "A fever in someone with diabetes, heart disease or a weak immune system.",
        ],
      },
      { type: "h2", text: "When to get help at once" },
      {
        type: "p",
        text: "Difficulty breathing, chest pain, confusion, repeated vomiting or fits need urgent care. Call 112 or go to the nearest hospital.",
      },
    ],
  },
  {
    slug: "managing-blood-pressure-at-home",
    title: "Checking your blood pressure at home, the right way",
    excerpt: "A few simple habits make home readings far more useful to your doctor.",
    category: "Heart health",
    readMinutes: 5,
    published: "2026-09-10",
    reviewer: {
      name: "Dr. Arjun Nair",
      specialty: "Cardiology",
      registrationNumber: "KL/22910/2008",
    },
    body: [
      {
        type: "p",
        text: "Readings taken at home show how your blood pressure behaves in daily life, which a single clinic reading can miss.",
      },
      { type: "h2", text: "Before you measure" },
      {
        type: "ul",
        items: [
          "Sit quietly for five minutes with your back supported and feet flat.",
          "Avoid tea, coffee, smoking and exercise for 30 minutes before.",
          "Rest your arm at heart level and use a cuff that fits.",
        ],
      },
      { type: "h2", text: "What to note" },
      {
        type: "ul",
        items: [
          "Take two readings a minute apart, morning and evening.",
          "Write down the date, time and both numbers.",
          "Share the list with your doctor in your consultation.",
        ],
      },
      {
        type: "p",
        text: "Never change or stop your medicines because of a reading. Talk to your doctor first.",
      },
    ],
  },
  {
    slug: "child-with-cough-and-cold",
    title: "Cough and cold in children: what parents can do at home",
    excerpt: "Comfort measures that help, and the warning signs that do not belong at home.",
    category: "Children",
    readMinutes: 4,
    published: "2026-08-29",
    reviewer: {
      name: "Dr. Farah Sheikh",
      specialty: "Paediatrics",
      registrationNumber: "MH/78124/2013",
    },
    body: [
      {
        type: "p",
        text: "Young children catch several colds a year. Most are mild and clear up within a week to ten days.",
      },
      { type: "h2", text: "Ways to help" },
      {
        type: "ul",
        items: [
          "Offer fluids often, and breast milk or formula for babies.",
          "Keep the nose clear with saline drops.",
          "Let your child rest, and keep the room comfortable.",
        ],
      },
      { type: "h2", text: "See a doctor if" },
      {
        type: "ul",
        items: [
          "Your baby is under three months old and has a fever.",
          "Breathing looks fast or hard, or the ribs pull in.",
          "Your child is drinking much less or is very sleepy.",
          "The cough lasts longer than three weeks.",
        ],
      },
    ],
  },
  {
    slug: "skin-care-in-monsoon",
    title: "Skin problems in the monsoon and how to prevent them",
    excerpt: "Damp weather makes fungal infections and rashes more common. Simple steps help.",
    category: "Skin",
    readMinutes: 3,
    published: "2026-08-12",
    reviewer: {
      name: "Dr. Kiran Patel",
      specialty: "Dermatology",
      registrationNumber: "GJ/31377/2012",
    },
    body: [
      {
        type: "p",
        text: "Humidity and wet clothes create the ideal place for fungus to grow, especially in skin folds.",
      },
      {
        type: "ul",
        items: [
          "Dry your skin fully after bathing, especially feet, groin and underarms.",
          "Wear loose cotton clothes and change out of wet ones quickly.",
          "Do not share towels.",
          "Do not use steroid creams without advice, as they can make fungal infections worse.",
        ],
      },
      {
        type: "p",
        text: "If a rash spreads, itches badly or does not improve in a week, show it to a doctor with a clear photo.",
      },
    ],
  },
  {
    slug: "sleep-and-stress",
    title: "Sleeping badly? How stress and sleep feed each other",
    excerpt: "Small changes to your evening routine can break the cycle.",
    category: "Mind",
    readMinutes: 5,
    published: "2026-07-30",
    reviewer: {
      name: "Dr. Sameer Khan",
      specialty: "Mental health",
      registrationNumber: "DL/40912/2014",
    },
    body: [
      {
        type: "p",
        text: "Poor sleep makes worries feel bigger, and worry makes sleep harder. Many people find a steady routine helps.",
      },
      {
        type: "ul",
        items: [
          "Go to bed and wake up at about the same time every day.",
          "Keep screens away for the last hour before bed.",
          "Avoid caffeine after lunch.",
          "Write tomorrow’s worries on paper before you lie down.",
        ],
      },
      {
        type: "p",
        text: "If poor sleep or low mood lasts more than two weeks, or you feel hopeless, please talk to a doctor. If you think of harming yourself, call a helpline or 112 right away.",
      },
    ],
  },
  {
    slug: "diabetes-and-festival-food",
    title: "Living with diabetes through festival season",
    excerpt: "You do not have to skip the celebration. A little planning goes a long way.",
    category: "Diabetes",
    readMinutes: 4,
    published: "2026-07-14",
    reviewer: {
      name: "Dr. Anita Deshmukh",
      specialty: "Diabetes and thyroid",
      registrationNumber: "MH/66012/2010",
    },
    body: [
      {
        type: "p",
        text: "Festivals bring sweets, late meals and changed routines, all of which affect blood sugar.",
      },
      {
        type: "ul",
        items: [
          "Do not skip meals to “save room” for sweets.",
          "Choose a small portion and eat it slowly after a meal.",
          "Keep to your medicine times even if meals shift.",
          "Check your sugar more often and note the readings.",
        ],
      },
      {
        type: "p",
        text: "Ask your doctor before changing any dose. Seek help if you feel very thirsty, confused or unusually weak.",
      },
    ],
  },
];

export const mockFaqGroups: FaqGroup[] = [
  {
    id: "booking",
    title: "Booking and consultations",
    items: [
      {
        id: "b1",
        question: "How do I book a consultation?",
        answer:
          "Find a doctor, pick a time, say who it is for and why, then pay. Your time is held for 10 minutes while you pay.",
      },
      {
        id: "b2",
        question: "Can I book for a family member?",
        answer:
          "Yes. Add them under family in your profile, or choose “Someone else” when you book. A parent or guardian must be present for a child.",
      },
      {
        id: "b3",
        question: "How do I join the call?",
        answer:
          "Open your appointment from your dashboard 10 minutes early. You can join from a phone or computer browser. There is no app to install.",
      },
      {
        id: "b4",
        question: "What if I miss my appointment?",
        answer:
          "Contact support as soon as you can. Refunds depend on the cancellation policy (draft, pending legal review).",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments and refunds",
    items: [
      {
        id: "p1",
        question: "How can I pay?",
        answer:
          "By UPI, card or net banking through our payment provider. We never see or store your card or bank details.",
      },
      {
        id: "p2",
        question: "My payment was taken but the booking failed",
        answer:
          "The money returns to your account automatically, usually in 5 to 7 working days. If it does not, contact support with your booking number.",
      },
      {
        id: "p3",
        question: "Will I get a receipt?",
        answer:
          "Yes. A receipt appears in your appointments after payment. Invoice and tax details are being confirmed.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy and records",
    items: [
      {
        id: "r1",
        question: "Who can see my health records?",
        answer:
          "You, and the doctor you consult for that consultation. ViniCure staff cannot read your clinical records. Every access is logged.",
      },
      {
        id: "r2",
        question: "Can I delete my data?",
        answer:
          "Yes. You can ask for deletion from settings. We tell you what we must keep by law and for how long.",
      },
      {
        id: "r3",
        question: "Do you record my consultation?",
        answer: "No, not unless you and your doctor both agree.",
      },
    ],
  },
  {
    id: "doctors",
    title: "Doctors and prescriptions",
    items: [
      {
        id: "d1",
        question: "Are all doctors registered?",
        answer:
          "Yes. We check each doctor’s medical council registration number before their profile goes live. It is shown on their profile and on every prescription.",
      },
      {
        id: "d2",
        question: "Can a doctor prescribe any medicine online?",
        answer:
          "No. Doctors prescribe only when it is safe to do so online, under the telemedicine guidelines. Some medicines cannot be prescribed without an in-person visit.",
      },
      {
        id: "d3",
        question: "What if the doctor wants me to visit in person?",
        answer:
          "They will tell you why and what to do next. Your fee is handled under the refund policy.",
      },
    ],
  },
  {
    id: "technical",
    title: "Technical help",
    items: [
      {
        id: "t1",
        question: "My video is poor. What can I do?",
        answer:
          "Move closer to your router, close other apps, or switch to audio. The doctor can continue by audio if the video will not improve.",
      },
      {
        id: "t2",
        question: "I did not get my sign-in code",
        answer:
          "Wait 30 seconds and ask for a new code. Check that your number is correct and that your phone has signal. If it still does not arrive, contact support.",
      },
    ],
  },
];

export const mockMoreStories: PatientStory[] = [
  {
    id: "s4",
    quote:
      "I was nervous about talking to a doctor on a screen. She asked simple questions and I forgot the camera was there.",
    name: "Meena K.",
    place: "Lucknow",
    context: "First online consultation",
  },
  {
    id: "s5",
    quote:
      "My mother speaks only Tamil. Finding a doctor who could explain her sugar results in Tamil changed everything for us.",
    name: "Karthik R.",
    place: "Chennai",
    context: "Booked for his mother",
  },
  {
    id: "s6",
    quote:
      "Everything was in one place: the prescription, my reports, and the reminder for the follow-up.",
    name: "Faisal A.",
    place: "Hyderabad",
    context: "Follow-up care",
  },
];
