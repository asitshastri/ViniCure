import { createHash } from "node:crypto";

// Seed data (P4-09). Safe to run again: every insert is keyed so a second run changes nothing.
//   reference data   the specialties list, needed everywhere (also production)
//   demo data        fake doctors with working hours, for development and staging only
// The command line (db/seed.mts) refuses demo data in production.

export type SeedDb = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export const SPECIALTIES: readonly (readonly [number, string])[] = [
  [1, "General medicine"],
  [2, "Paediatrics"],
  [3, "Dermatology"],
  [4, "Gynaecology"],
  [5, "Cardiology"],
  [6, "ENT"],
  [7, "Orthopaedics"],
  [8, "Psychiatry"],
  [9, "Ophthalmology"],
  [10, "Diabetology"],
  [11, "Pulmonology"],
  [12, "Gastroenterology"],
];

/** Clearly fake: the council says so, and the numbers cannot be real registrations. */
export const DEMO_COUNCIL = "Demo Council (test data)";

const FIRST = [
  "Aarav",
  "Meera",
  "Rohan",
  "Isha",
  "Kabir",
  "Ananya",
  "Vikram",
  "Neha",
  "Arjun",
  "Pooja",
  "Sanjay",
  "Divya",
];
const LAST = [
  "Shah",
  "Patel",
  "Iyer",
  "Rao",
  "Mehta",
  "Nair",
  "Desai",
  "Kulkarni",
  "Bose",
  "Verma",
];
const LANGS = [
  ["English", "Hindi"],
  ["English", "Gujarati"],
  ["Hindi", "Marathi"],
  ["English", "Tamil"],
  ["English", "Bengali", "Hindi"],
];
const DEGREES = ["MBBS", "MBBS, MD", "MBBS, DNB", "MBBS, MS", "MBBS, DM"];

export type DemoDoctor = {
  id: string;
  name: string;
  registrationNo: string;
  specialtyId: number;
  languages: string[];
  qualifications: string;
  feePaise: number;
};

/** The same ids every time, so a second run finds the rows it made. */
function stableUuid(key: string): string {
  const h = createHash("sha256").update(`vinicure-demo:${key}`).digest("hex").split("");
  h[12] = "7";
  h[16] = "89ab"[parseInt(h[16] as string, 16) % 4] as string;
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export function demoDoctors(count = 24): DemoDoctor[] {
  return Array.from({ length: count }, (_, i) => {
    const registrationNo = `DEMO-${String(10001 + i)}`;
    return {
      id: stableUuid(registrationNo),
      name: `Dr ${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
      registrationNo,
      specialtyId: (SPECIALTIES[i % SPECIALTIES.length] as readonly [number, string])[0],
      languages: LANGS[i % LANGS.length] as string[],
      qualifications: `${DEGREES[i % DEGREES.length]} (demo)`,
      // ₹200 to ₹1,000 in steps of ₹100.
      feePaise: (2 + (i % 9)) * 10_000,
    };
  });
}

export async function seedReference(db: SeedDb): Promise<void> {
  for (const [id, name] of SPECIALTIES) {
    await db.query(
      "INSERT INTO specialties (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
      [id, name],
    );
  }
}

export async function seedDemo(db: SeedDb, count = 24): Promise<number> {
  let created = 0;
  for (const d of demoDoctors(count)) {
    const { rows } = await db.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
         languages, consultation_fee_paise, kyc_status, status, applicant_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', 'active', $8)
       ON CONFLICT DO NOTHING RETURNING id`,
      [
        d.id,
        d.name,
        d.registrationNo,
        DEMO_COUNCIL,
        d.qualifications,
        d.languages,
        d.feePaise,
        `${d.registrationNo.toLowerCase()}@no-email.invalid`,
      ],
    );
    if (rows.length === 1) created++;
    await db.query(
      "INSERT INTO doctor_specialties (doctor_id, specialty_id, is_primary) VALUES ($1, $2, true) ON CONFLICT DO NOTHING",
      [d.id, d.specialtyId],
    );
    // Monday to Saturday, a morning and an evening session (India time). 0 is Sunday.
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      for (const [from, to] of [
        ["09:00", "13:00"],
        ["16:00", "19:00"],
      ] as const) {
        await db.query(
          `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
           VALUES ($1, $2, $3, $4, $5, 30, '2026-01-01') ON CONFLICT DO NOTHING`,
          [stableUuid(`${d.registrationNo}:${weekday}:${from}`), d.id, weekday, from, to],
        );
      }
    }
  }
  return created;
}

/**
 * DRAFT consent texts for development and staging only (P6-05). They say plainly that they are
 * placeholders and are not legal wording; the real texts come from legal (P9-10) and are loaded
 * as new versions. Safe to run again: a version is stored once.
 */
export const DEMO_CONSENT_VERSION = "draft-placeholder-1";
export async function seedDemoConsents(db: SeedDb): Promise<number> {
  const texts: Record<string, string> = {
    telemedicine:
      "DRAFT PLACEHOLDER, NOT LEGAL TEXT. I understand this is an online consultation with a registered doctor, that it is not for emergencies, and that the doctor may advise me to see a doctor in person.",
    video:
      "DRAFT PLACEHOLDER, NOT LEGAL TEXT. I agree to a video call with my doctor. The call is not recorded unless both of us agree.",
    recording:
      "DRAFT PLACEHOLDER, NOT LEGAL TEXT. I agree that this one consultation may be recorded, in audio and video, and kept for a limited time. I can take my agreement back at any time and the recording stops.",
  };
  let added = 0;
  for (const [kind, body] of Object.entries(texts)) {
    const { rows } = await db.query(
      `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
       VALUES ($1, $2, $3, 'en', $4, $5, '2026-01-01') ON CONFLICT DO NOTHING RETURNING id`,
      [
        stableUuid(`consent:${kind}:${DEMO_CONSENT_VERSION}`),
        kind,
        DEMO_CONSENT_VERSION,
        body,
        createHash("sha256").update(body).digest("hex"),
      ],
    );
    added += rows.length;
  }
  return added;
}
