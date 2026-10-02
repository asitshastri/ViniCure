import type { HomeContent } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007). Names, numbers and quotes are invented.
// Replaced by the directory API in P4.
export const homeContent: HomeContent = {
  specialties: [
    {
      slug: "general-medicine",
      name: "General medicine",
      blurb: "Fever, cough, stomach upset",
      icon: "stethoscope",
    },
    { slug: "paediatrics", name: "Paediatrics", blurb: "Child health and vaccines", icon: "baby" },
    { slug: "cardiology", name: "Cardiology", blurb: "Heart and blood pressure", icon: "heart" },
    { slug: "dermatology", name: "Dermatology", blurb: "Skin, hair and nails", icon: "skin" },
    {
      slug: "orthopaedics",
      name: "Orthopaedics",
      blurb: "Bones, joints and injuries",
      icon: "bone",
    },
    { slug: "neurology", name: "Neurology", blurb: "Headache, nerves, sleep", icon: "brain" },
    { slug: "pulmonology", name: "Pulmonology", blurb: "Breathing and asthma", icon: "lungs" },
    { slug: "dentistry", name: "Dentistry", blurb: "Tooth and gum problems", icon: "tooth" },
  ],
  doctors: [
    {
      id: "d1",
      name: "Dr. Maya Rao",
      specialty: "General medicine",
      languages: ["English", "Hindi", "Kannada"],
      experienceYears: 14,
      feePaise: 49900,
      rating: 4.8,
      reviewCount: 312,
      registrationNumber: "DEMO-KMC-000001",
      nextSlot: "Today, 6:30 pm",
    },
    {
      id: "d2",
      name: "Dr. Arjun Mehta",
      specialty: "Paediatrics",
      languages: ["English", "Hindi", "Gujarati"],
      experienceYears: 9,
      feePaise: 59900,
      rating: 4.9,
      reviewCount: 188,
      registrationNumber: "DEMO-GMC-000002",
      nextSlot: "Today, 7:00 pm",
    },
    {
      id: "d3",
      name: "Dr. Sana Iqbal",
      specialty: "Dermatology",
      languages: ["English", "Hindi", "Urdu"],
      experienceYears: 11,
      feePaise: 69900,
      rating: 4.7,
      reviewCount: 241,
      registrationNumber: "DEMO-DMC-000003",
      nextSlot: "Tomorrow, 9:00 am",
    },
    {
      id: "d4",
      name: "Dr. Karthik Nair",
      specialty: "Cardiology",
      languages: ["English", "Malayalam", "Tamil"],
      experienceYears: 18,
      feePaise: 89900,
      rating: 4.8,
      reviewCount: 407,
      registrationNumber: "DEMO-TCMC-000004",
      nextSlot: "Tomorrow, 11:30 am",
    },
  ],
  stories: [
    {
      id: "s1",
      quote:
        "My father could not travel, so we spoke to a doctor from home. The prescription arrived in minutes and the doctor's registration number was on it.",
      name: "Sample patient A",
      place: "Pune",
    },
    {
      id: "s2",
      quote:
        "I liked that I could choose Hindi and that my reports stayed private. I knew exactly who could see them.",
      name: "Sample patient B",
      place: "Lucknow",
    },
    {
      id: "s3",
      quote:
        "Booking took two minutes. The reminder came on WhatsApp and the video call just worked on my phone.",
      name: "Sample patient C",
      place: "Coimbatore",
    },
  ],
  faqs: [
    {
      id: "f1",
      question: "Is a video consultation as good as visiting a clinic?",
      answer:
        "For many everyday problems, yes. Doctors will tell you when you need an in-person visit or a test, and will not prescribe what the guidelines do not allow remotely.",
    },
    {
      id: "f2",
      question: "Who can see my health records?",
      answer:
        "You and the doctor you are consulting. Our staff cannot read clinical content. Every access is logged.",
    },
    {
      id: "f3",
      question: "Are the doctors registered?",
      answer:
        "Every doctor's registration number is checked against their state medical council before they can take consultations, and it is shown on their profile and prescription.",
    },
    {
      id: "f4",
      question: "What if I need to cancel or the call fails?",
      answer:
        "You can cancel from your appointments page. If a call fails because of our side, you can rebook or ask for a refund. Policy text is pending legal review.",
    },
  ],
};
