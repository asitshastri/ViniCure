import type {
  AdminAppointment,
  AdminDoctor,
  AdminUser,
  AttendanceRow,
  AuditEntry,
  DailyCount,
  DataRequest,
  KycItem,
  RefundRequest,
  WeeklyRevenue,
} from "@/lib/types";
import { mockDoctors } from "@/mocks/doctors";

// FAKE DATA for the UI-first phase (D-007). Names are invented. Admin screens never carry clinical text:
// no reasons for visit, notes, diagnoses or file contents.

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const first = [
  "Asha",
  "Ravi",
  "Meera",
  "Imran",
  "Kavya",
  "Arjun",
  "Neha",
  "Sunita",
  "Farhan",
  "Priya",
  "Rohan",
  "Ira",
  "Latha",
  "Sameer",
  "Divya",
  "Karthik",
  "Faisal",
  "Anita",
  "Mohan",
  "Pooja",
];
const last = ["Verma", "Shah", "Iyer", "Sheikh", "Mehta", "Nair", "Gupta", "Rao", "Ali", "Patel"];

export const mockAdminUsers: AdminUser[] = Array.from({ length: 28 }, (_, i) => {
  const role: AdminUser["role"] =
    i < 3 ? "support" : i < 5 ? "admin" : i < 12 ? "doctor" : "patient";
  const status: AdminUser["status"] =
    i % 11 === 7 ? "suspended" : i % 9 === 4 ? "pending" : "active";
  return {
    id: `u-${1000 + i}`,
    name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
    role,
    phoneMasked: `+91 9${(i * 7) % 10}••••••${String(10 + i).slice(-2)}`,
    joined: `2026-0${1 + (i % 9)}-${String(1 + ((i * 5) % 27)).padStart(2, "0")}`,
    status,
  };
});

export const mockAdminDoctors: AdminDoctor[] = mockDoctors.map((d, i) => ({
  id: d.id,
  name: d.name,
  specialty: d.specialty,
  registrationNumber: d.registrationNumber,
  rating: d.rating,
  consultations: 40 + ((i * 37) % 260),
  joined: `2026-0${1 + (i % 6)}-${String(3 + ((i * 4) % 24)).padStart(2, "0")}`,
  status: i === 11 ? "paused" : i === 13 ? "pending" : "live",
}));

export const mockKyc: KycItem[] = [
  {
    id: "k-1",
    name: "Dr. Rekha Menon",
    specialty: "Gynaecology",
    registrationNumber: "KL/40211/2012",
    council: "Travancore-Cochin Medical Council",
    submitted: "2026-10-02",
    status: "pending",
    docs: [
      { label: "Registration certificate", state: "check" },
      { label: "Degree certificate", state: "check" },
      { label: "Photo ID", state: "check" },
      { label: "Bank proof", state: "check" },
    ],
    qualifications: [
      "MBBS, Government Medical College Kozhikode, 2010",
      "MS (Obstetrics and Gynaecology), JIPMER, 2014",
    ],
  },
  {
    id: "k-2",
    name: "Dr. Vivek Joshi",
    specialty: "Orthopaedics",
    registrationNumber: "MH/88120/2009",
    council: "Maharashtra Medical Council",
    submitted: "2026-10-01",
    status: "pending",
    docs: [
      { label: "Registration certificate", state: "check" },
      { label: "Degree certificate", state: "check" },
      { label: "Photo ID", state: "check" },
      { label: "Bank proof", state: "check" },
    ],
    qualifications: ["MBBS, Grant Medical College, 2007", "MS (Orthopaedics), KEM Hospital, 2011"],
  },
  {
    id: "k-3",
    name: "Dr. Sana Qureshi",
    specialty: "Dermatology",
    registrationNumber: "DL/51877/2015",
    council: "Delhi Medical Council",
    submitted: "2026-09-30",
    status: "pending",
    docs: [
      { label: "Registration certificate", state: "check" },
      { label: "Degree certificate", state: "check" },
      { label: "Photo ID", state: "check" },
      { label: "Bank proof", state: "check" },
    ],
    qualifications: [
      "MBBS, Maulana Azad Medical College, 2013",
      "MD (Dermatology), AIIMS Delhi, 2017",
    ],
  },
  {
    id: "k-4",
    name: "Dr. Praveen Kumar",
    specialty: "General physician",
    registrationNumber: "TN/20456/2010",
    council: "Tamil Nadu Medical Council",
    submitted: "2026-09-27",
    status: "changes_needed",
    docs: [
      { label: "Registration certificate", state: "ok" },
      { label: "Degree certificate", state: "check" },
      { label: "Photo ID", state: "ok" },
      { label: "Bank proof", state: "check" },
    ],
    qualifications: ["MBBS, Madras Medical College, 2008"],
    note: "Degree page is blurry. Bank proof is in another person's name.",
  },
  {
    id: "k-5",
    name: "Dr. Alok Sinha",
    specialty: "Mental health",
    registrationNumber: "UP/33901/2011",
    council: "Uttar Pradesh Medical Council",
    submitted: "2026-09-22",
    status: "approved",
    docs: [
      { label: "Registration certificate", state: "ok" },
      { label: "Degree certificate", state: "ok" },
      { label: "Photo ID", state: "ok" },
      { label: "Bank proof", state: "ok" },
    ],
    qualifications: ["MBBS, KGMU, 2009", "MD (Psychiatry), PGIMER, 2013"],
  },
];

const names = mockAdminUsers.filter((u) => u.role === "patient").map((u) => u.name);
export const mockAdminAppointments: AdminAppointment[] = Array.from({ length: 34 }, (_, i) => {
  const status: AdminAppointment["status"] =
    i % 8 === 3 ? "cancelled" : i % 11 === 5 ? "no_show" : i < 5 ? "upcoming" : "completed";
  const type: AdminAppointment["type"] = i % 5 === 1 ? "audio" : i % 7 === 2 ? "followup" : "video";
  const fee = type === "audio" ? 32400 : type === "followup" ? 25000 : 49900 + (i % 3) * 10000;
  return {
    id: `VC-2026-${String(4300 - i * 3).padStart(6, "0")}`,
    date: i < 5 ? addDays("2026-10-02", 1 + (i % 3)) : addDays("2026-10-02", -(i - 4)),
    doctor: mockDoctors[i % mockDoctors.length]!.name,
    patient: `${(names[i % names.length] ?? "Patient").split(" ")[0]} ${(names[i % names.length] ?? "P X").split(" ")[1]?.[0]}.`,
    type,
    status,
    feePaise: fee,
    payment: status === "cancelled" ? (i % 2 ? "refunded" : "pending") : "paid",
  };
});

export const mockWeeklyRevenue: WeeklyRevenue[] = [
  { week: "10 Aug", video: 612000, audio: 148000, followup: 91000 },
  { week: "17 Aug", video: 688000, audio: 162000, followup: 104000 },
  { week: "24 Aug", video: 701000, audio: 171000, followup: 99000 },
  { week: "31 Aug", video: 744000, audio: 158000, followup: 118000 },
  { week: "7 Sep", video: 802000, audio: 176000, followup: 126000 },
  { week: "14 Sep", video: 861000, audio: 189000, followup: 141000 },
  { week: "21 Sep", video: 934000, audio: 203000, followup: 152000 },
  { week: "28 Sep", video: 971000, audio: 214000, followup: 163000 },
];

export const mockRefunds: RefundRequest[] = [
  {
    id: "rf-1",
    appointment: "VC-2026-004281",
    patient: "Meera V.",
    amountPaise: 49900,
    reason: "Doctor did not join",
    requested: "2026-10-02",
    status: "pending",
  },
  {
    id: "rf-2",
    appointment: "VC-2026-004240",
    patient: "Imran S.",
    amountPaise: 32400,
    reason: "Call quality too poor to continue",
    requested: "2026-10-01",
    status: "pending",
  },
  {
    id: "rf-3",
    appointment: "VC-2026-004199",
    patient: "Kavya I.",
    amountPaise: 59900,
    reason: "Charged twice",
    requested: "2026-09-29",
    status: "approved",
  },
  {
    id: "rf-4",
    appointment: "VC-2026-004170",
    patient: "Arjun M.",
    amountPaise: 49900,
    reason: "Changed mind after the call",
    requested: "2026-09-28",
    status: "declined",
  },
];

const actors = [
  ["Neha Kapoor", "admin"],
  ["Imran Khan", "support"],
  ["Dr. Maya Rao", "doctor"],
  ["Dr. Arjun Nair", "doctor"],
  ["System", "system"],
] as const;
const auditActions = [
  "Approved doctor application",
  "Changed a user's status",
  "Approved a refund",
  "Exported a report",
  "Signed in",
  "Changed a setting",
  "Declined a refund",
  "Started a data export",
];
const phiActions = [
  "Opened patient summary",
  "Opened a shared file",
  "Wrote a prescription",
  "Opened break-glass access",
  "Downloaded a file",
];

export const mockAudit: AuditEntry[] = Array.from({ length: 30 }, (_, i) => ({
  id: `a-${i}`,
  when: `2026-10-0${Math.max(1, 2 - Math.floor(i / 15))} ${String(9 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
  actor: actors[i % 4]![0],
  role: actors[i % 4]![1],
  action: auditActions[i % auditActions.length]!,
  target: `${i % 3 === 0 ? "user" : i % 3 === 1 ? "appointment" : "setting"} ${1000 + i * 7}`,
  kind: "audit",
}));
export const mockPhi: AuditEntry[] = Array.from({ length: 24 }, (_, i) => ({
  id: `p-${i}`,
  when: `2026-10-0${Math.max(1, 2 - Math.floor(i / 12))} ${String(8 + (i % 13)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}`,
  actor: i % 6 === 5 ? "Imran Khan" : actors[2 + (i % 2)]![0],
  role: i % 6 === 5 ? "support" : "doctor",
  action: i % 6 === 5 ? "Opened break-glass access" : phiActions[i % 4]!,
  target: `patient ${(names[i % names.length] ?? "A B").split(" ")[0]} ${(names[i % names.length] ?? "A B").split(" ")[1]?.[0]}. (p-${200 + i})`,
  kind: "phi",
}));

export const mockDataRequests: DataRequest[] = [
  {
    id: "dr-1",
    patient: "Meera V.",
    type: "export",
    received: "2026-10-02",
    due: "2026-10-09",
    status: "new",
  },
  {
    id: "dr-2",
    patient: "Rahul D.",
    type: "deletion",
    received: "2026-10-01",
    due: "2026-10-31",
    status: "in_progress",
    legalHold: true,
  },
  {
    id: "dr-3",
    patient: "Priya S.",
    type: "correction",
    received: "2026-09-29",
    due: "2026-10-06",
    status: "in_progress",
  },
  {
    id: "dr-4",
    patient: "Sunita M.",
    type: "export",
    received: "2026-09-20",
    due: "2026-09-27",
    status: "done",
  },
  {
    id: "dr-5",
    patient: "Karthik R.",
    type: "deletion",
    received: "2026-09-18",
    due: "2026-10-18",
    status: "new",
  },
];

export const mockAttendance: AttendanceRow[] = mockDoctors.map((d, i) => ({
  id: d.id,
  doctor: d.name,
  scheduledHours: 20 + (i % 5) * 4,
  onlineHours: 16 + ((i * 3) % 12),
  onTimePercent: 78 + ((i * 7) % 22),
  noShows: (i * 5) % 4,
}));

export const mockDaily: DailyCount[] = [38, 42, 41, 47, 52, 49, 31, 36, 44, 51, 55, 58, 53, 47].map(
  (c, i) => ({ date: addDays("2026-09-19", i), consultations: c }),
);
