import type { LegalDoc } from "@/lib/types";

// PLACEHOLDER TEXT for the UI-first phase. Every page that shows it carries the “draft, pending legal review” banner
// until task P9-10 replaces it with reviewed wording. Square brackets mark facts that still need the human to supply.

const DRAFT = "2 October 2026";

export const legalDocs: Record<string, LegalDoc> = {
  "privacy-policy": {
    slug: "privacy-policy",
    title: "Privacy policy",
    summary: "What we collect, why, who sees it, and how you stay in control.",
    draftDate: DRAFT,
    sections: [
      {
        id: "who-we-are",
        heading: "Who we are",
        paragraphs: [
          "ViniCure connects patients in India with registered doctors for online consultations. [Legal entity name, registered address and contact details to be added.]",
          "For the personal data you give us, ViniCure decides why and how it is used. [Legal wording for this role to be confirmed under the Digital Personal Data Protection Act.]",
        ],
      },
      {
        id: "what-we-collect",
        heading: "What we collect",
        paragraphs: ["We collect only what we need to give you care and run your account."],
        items: [
          "Your name and mobile number, to create your account and sign you in.",
          "Details you choose to add: age, family members, allergies, medical history and conditions.",
          "Records you upload: reports, prescriptions and photos.",
          "Consultation details: who you saw, when, and the prescription issued.",
          "Payment status from our payment provider. We never see or store your card or bank details.",
          "Technical data needed to keep the service safe, such as sign-in times and device type.",
        ],
      },
      {
        id: "what-we-do-not-collect",
        heading: "What we do not collect",
        paragraphs: [
          "We do not ask for your Aadhaar or PAN number. We do not store the audio or video of your consultation unless you and your doctor both agree to recording. [Recording policy to be confirmed.]",
        ],
      },
      {
        id: "why-we-use-it",
        heading: "Why we use your data",
        paragraphs: ["We use your data to:"],
        items: [
          "Book and run your consultations and send you reminders.",
          "Let your doctor see the information needed to treat you.",
          "Issue prescriptions and keep your records.",
          "Take payments and issue receipts.",
          "Keep the service secure and meet legal duties.",
        ],
      },
      {
        id: "who-sees-it",
        heading: "Who can see it",
        paragraphs: [
          "You and the doctor you consult can see your health records for that consultation. ViniCure staff cannot read your clinical records. Support staff can open them only through a logged, time-limited access that needs a reason, and we record every such access.",
          "We share data with service providers who help us run ViniCure (for example SMS, payments and hosting) under written terms. [List of providers to be added.]",
        ],
      },
      {
        id: "where-stored",
        heading: "Where it is stored and how it is protected",
        paragraphs: [
          "Your data is stored in data centres in India. It is encrypted when stored and when sent. Access is limited and logged. [Technical details to be confirmed against the final design.]",
        ],
      },
      {
        id: "how-long",
        heading: "How long we keep it",
        paragraphs: [
          "We keep medical records for the period the law requires. [Retention period to be confirmed by legal review.] You can ask us to delete other data at any time.",
        ],
      },
      {
        id: "your-rights",
        heading: "Your choices and rights",
        paragraphs: [
          "You can see, correct, download and ask us to delete your data, and withdraw your consent, from your account settings. Read more on the patient rights page. To complain, contact our grievance officer.",
        ],
      },
      {
        id: "children",
        heading: "Children",
        paragraphs: [
          "A parent or guardian must create the account and be present when a child has a consultation. [Wording on children’s data to be confirmed by legal review.]",
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        paragraphs: [
          "If we change this policy in a way that matters to you, we will tell you before it applies.",
        ],
      },
    ],
  },
  terms: {
    slug: "terms",
    title: "Terms of use",
    summary: "The rules for using ViniCure as a patient.",
    draftDate: DRAFT,
    sections: [
      {
        id: "about",
        heading: "About ViniCure",
        paragraphs: [
          "ViniCure is a platform that lets you consult registered doctors online. The doctors are independent professionals. They, not ViniCure, are responsible for their medical advice.",
        ],
      },
      {
        id: "emergencies",
        heading: "Not for emergencies",
        paragraphs: [
          "Do not use ViniCure in an emergency, such as chest pain, severe bleeding, difficulty breathing or thoughts of self-harm. Call 112 or go to the nearest hospital.",
        ],
      },
      {
        id: "your-account",
        heading: "Your account",
        paragraphs: [
          "You must give correct information and keep your sign-in secure. You are 18 or older, or a parent or guardian acts for you.",
        ],
      },
      {
        id: "consultations",
        heading: "Consultations",
        paragraphs: [
          "A doctor may decide that your problem needs an in-person visit and may end the consultation. Online care has limits. Medicines are prescribed only when the doctor judges it safe to do so. [Telemedicine rules on prescribing to be reviewed.]",
        ],
      },
      {
        id: "payments",
        heading: "Fees, cancellation and refunds",
        paragraphs: [
          "The fee is shown before you pay. Payments are processed by our payment provider. [Cancellation window, refund rules and tax wording to be supplied.]",
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        paragraphs: ["You will not:"],
        items: [
          "Share your sign-in or use someone else’s account.",
          "Record a consultation without the consent of everyone on the call.",
          "Abuse, threaten or harass doctors or staff.",
          "Upload content that is unlawful or that you have no right to share.",
        ],
      },
      {
        id: "liability",
        heading: "Our responsibility",
        paragraphs: ["[Limits on liability and governing law to be written by legal review.]"],
      },
      {
        id: "contact",
        heading: "Contact",
        paragraphs: [
          "Questions about these terms: use the support page. Complaints: use the grievance page.",
        ],
      },
    ],
  },
  "cookie-policy": {
    slug: "cookie-policy",
    title: "Cookie policy",
    summary: "The small files our site stores in your browser, and why.",
    draftDate: DRAFT,
    sections: [
      {
        id: "what",
        heading: "What cookies are",
        paragraphs: [
          "Cookies are small files a website stores in your browser. Some are needed for the site to work.",
        ],
      },
      {
        id: "essential",
        heading: "Cookies we always use",
        paragraphs: [
          "These keep you signed in and the site safe. You cannot switch them off without breaking sign-in.",
        ],
        items: [
          "Session cookie: keeps you signed in. It is marked HttpOnly, Secure and SameSite, and ends when you sign out.",
          "Security cookie: helps protect forms against forged requests.",
          "Preference cookie: remembers choices such as your language, once the language switch is added.",
        ],
      },
      {
        id: "optional",
        heading: "Cookies we only use with your consent",
        paragraphs: [
          "At this stage we plan no advertising cookies. [If we add analytics, they will be listed here and will stay off until you agree. Decision pending.]",
        ],
      },
      {
        id: "control",
        heading: "Your control",
        paragraphs: [
          "You can delete cookies in your browser settings. If you delete the session cookie you will be signed out.",
        ],
      },
    ],
  },
};

export type RightItem = { id: string; title: string; text: string };

export const patientRights: RightItem[] = [
  {
    id: "know",
    title: "Know what we hold",
    text: "Ask what personal data we have about you and why we use it.",
  },
  {
    id: "access",
    title: "See and download your data",
    text: "Open your records and download a copy from your account.",
  },
  {
    id: "correct",
    title: "Correct mistakes",
    text: "Fix wrong or out-of-date details in your profile and history.",
  },
  {
    id: "erase",
    title: "Ask us to delete it",
    text: "Request deletion. We delete what the law lets us, and tell you what we must keep and for how long.",
  },
  {
    id: "withdraw",
    title: "Withdraw consent",
    text: "Change your mind at any time in settings. It is as easy to withdraw as it was to give.",
  },
  {
    id: "nominate",
    title: "Name someone to act for you",
    text: "Nominate a person who can exercise these rights if you cannot. [Process to be confirmed.]",
  },
  {
    id: "complain",
    title: "Complain",
    text: "Tell our grievance officer if something is wrong, and escalate if you are not satisfied.",
  },
];
