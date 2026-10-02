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

export type ArticleBlock =
  { type: "p"; text: string } | { type: "h2"; text: string } | { type: "ul"; items: string[] };

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  /** ISO date. */
  published: string;
  reviewer: { name: string; specialty: string; registrationNumber: string };
  body: ArticleBlock[];
};

export type FaqGroup = { id: string; title: string; items: FaqItem[] };

export type SupportTopic = "booking" | "payment" | "technical" | "records" | "doctor" | "other";

export type AppointmentStatus = "upcoming" | "completed" | "cancelled" | "no_show";

export type Appointment = {
  id: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  registrationNumber: string;
  /** IST calendar date, YYYY-MM-DD. */
  date: string;
  /** IST time, 24-hour HH:mm. */
  time: string;
  mode: ConsultMode;
  forWhom: string;
  status: AppointmentStatus;
  feePaise: number;
  reference: string;
  hasPrescription: boolean;
  reviewed: boolean;
  /** Last day a discounted follow-up can be booked, if one applies. */
  followUpUntil?: string;
  followUpFeePaise?: number;
  cancelledBy?: "patient" | "doctor";
  refund?: { status: "processed" | "pending" | "none"; amountPaise: number };
};

/** An appointment plus what the person may do with it right now, worked out for the mock clock. */
export type AppointmentView = Appointment & {
  minutesUntil: number;
  canJoin: boolean;
  /** Free to cancel or move: more than 2 hours away. */
  freeChange: boolean;
};

export type AppointmentsResult = {
  all: AppointmentView[];
  nextUp: AppointmentView | null;
};

export type RecordType = "injury" | "prescriptions" | "reports" | "xray" | "mri" | "ct" | "other";
export type RecordStatus = "uploading" | "scanning" | "ready" | "rejected";

export type HealthRecord = {
  id: string;
  title: string;
  type: RecordType;
  kind: "image" | "document";
  sizeBytes: number;
  /** IST calendar date, YYYY-MM-DD. */
  uploadedOn: string;
  status: RecordStatus;
  /** Why a rejected file was refused, in plain words. */
  rejectedReason?: string;
  note?: string;
  addedBy: "you" | "doctor";
  sharedWith?: { doctorId: string; doctorName: string; until: string };
};

export type ShareTarget = {
  doctorId: string;
  doctorName: string;
  specialty: string;
  reason: string;
};

export type PatientProfile = {
  name: string;
  /** Shown masked. Changing the number needs a new code. */
  phoneMasked: string;
  email: string;
  /** ISO date or empty. */
  dob: string;
  sex: "" | "female" | "male" | "other";
  language: string;
  emergency: { name: string; relation: string; phone: string };
};

export type MedicalHistory = {
  conditions: string[];
  allergies: string[];
  medicines: Array<{ id: string; name: string; dose: string }>;
  updatedOn: string;
};

export type VitalReading = {
  id: string;
  date: string;
  sys?: number;
  dia?: number;
  pulse?: number;
  spo2?: number;
  temp?: number;
  weight?: number;
  sugar?: number;
  note?: string;
};

export type ConsentItem = {
  id: string;
  title: string;
  description: string;
  /** Needed to give care. Withdrawing it means the account cannot be used for consultations. */
  required: boolean;
  granted: boolean;
  since: string;
};

export type SignInSession = {
  id: string;
  device: string;
  browser: string;
  place: string;
  lastActive: string;
  current: boolean;
};

export type ReferralInfo = {
  code: string;
  link: string;
  people: Array<{ id: string; initials: string; status: "invited" | "joined" | "booked" }>;
};

export type DoctorConsultStatus = "upcoming" | "completed" | "no_show" | "cancelled";

export type DoctorConsult = {
  id: string;
  /** IST calendar date and 24-hour time. */
  date: string;
  time: string;
  patientId: string;
  patientName: string;
  ageSex: string;
  reason: string;
  kind: "new" | "followup";
  mode: ConsultMode;
  status: DoctorConsultStatus;
  allergies: string[];
};

export type DoctorConsultView = DoctorConsult & { minutesUntil: number; canStart: boolean };

export type DoctorPatient = {
  id: string;
  name: string;
  ageSex: string;
  lastVisit: string;
  visits: number;
  kind: "new" | "followup";
  allergies: string[];
  conditions: string[];
  sharedFiles: number;
};

export type AvailabilityDay = {
  day: number;
  label: string;
  enabled: boolean;
  start: string;
  end: string;
};
export type TimeOff = { id: string; from: string; to: string; reason: string };

export type Payout = {
  id: string;
  period: string;
  consultations: number;
  grossPaise: number;
  feePaise: number;
  netPaise: number;
  status: "paid" | "processing" | "on_hold";
  paidOn?: string;
  note?: string;
};

export type EarningLine = {
  id: string;
  date: string;
  patient: string;
  mode: ConsultMode;
  grossPaise: number;
  netPaise: number;
  status: "paid" | "processing";
};

export type Medicine = {
  id: string;
  name: string;
  form: string;
  strengths: string[];
  /** Drug family tags, used to warn about allergies. */
  classes: string[];
  /** Cannot be prescribed on an online consultation. The exact list comes from the telemedicine rules, to be confirmed. */
  restricted?: boolean;
};

export type RxFrequency = { morning: boolean; afternoon: boolean; night: boolean; sos: boolean };

export type RxLine = {
  id: string;
  medicineId: string;
  name: string;
  strength: string;
  freq: RxFrequency;
  timing: "before" | "after" | "any";
  days: number;
  note: string;
};

export type ConsultContext = {
  consult: DoctorConsultView;
  patient: {
    name: string;
    ageSex: string;
    conditions: string[];
    medicines: string[];
    pastVisits: Array<{ date: string; summary: string }>;
    files: Array<{ id: string; title: string; type: string; sharedOn: string }>;
  };
  doctor: { name: string; qualifications: string; registrationNumber: string; council: string };
};

export type ApplicationStatus = "draft" | "submitted" | "in_review" | "changes_needed" | "approved";
export type DocState =
  "missing" | "uploading" | "scanning" | "uploaded" | "accepted" | "replace" | "rejected";

export type ApplicationDoc = {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  state: DocState;
  fileName?: string;
  /** Plain reason from the reviewer when a document needs replacing. */
  reason?: string;
};

export type Qualification = { id: string; degree: string; college: string; year: string };

export type DoctorApplication = {
  status: ApplicationStatus;
  details: {
    name: string;
    registrationNumber: string;
    council: string;
    registrationYear: string;
    specialty: string;
    experienceYears: string;
    languages: string[];
    feeRupees: string;
    bio: string;
    qualifications: Qualification[];
  };
  docs: ApplicationDoc[];
  events: Array<{ when: string; text: string }>;
};

export type AdminUser = {
  id: string;
  name: string;
  role: "patient" | "doctor" | "support" | "admin";
  phoneMasked: string;
  joined: string;
  status: "active" | "suspended" | "pending";
};
export type AdminDoctor = {
  id: string;
  name: string;
  specialty: string;
  registrationNumber: string;
  rating: number;
  consultations: number;
  joined: string;
  status: "live" | "paused" | "pending";
};
export type KycItem = {
  id: string;
  name: string;
  specialty: string;
  registrationNumber: string;
  council: string;
  submitted: string;
  status: "pending" | "changes_needed" | "approved" | "rejected";
  docs: Array<{ label: string; state: "ok" | "check" }>;
  qualifications: string[];
  note?: string;
};
export type AdminAppointment = {
  id: string;
  date: string;
  doctor: string;
  patient: string;
  type: ConsultMode;
  status: "completed" | "upcoming" | "cancelled" | "no_show";
  feePaise: number;
  payment: "paid" | "refunded" | "pending";
};
export type WeeklyRevenue = { week: string; video: number; audio: number; followup: number };
export type RefundRequest = {
  id: string;
  appointment: string;
  patient: string;
  amountPaise: number;
  reason: string;
  requested: string;
  status: "pending" | "approved" | "declined";
};
export type AuditEntry = {
  id: string;
  when: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  kind: "audit" | "phi";
};
export type DataRequest = {
  id: string;
  patient: string;
  type: "export" | "deletion" | "correction";
  received: string;
  due: string;
  status: "new" | "in_progress" | "done";
  legalHold?: boolean;
};
export type AttendanceRow = {
  id: string;
  doctor: string;
  scheduledHours: number;
  onlineHours: number;
  onTimePercent: number;
  noShows: number;
};
export type DailyCount = { date: string; consultations: number };
