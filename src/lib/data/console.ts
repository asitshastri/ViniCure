import { getDoctorConsults } from "@/lib/data/doctor";
import { getDoctor } from "@/lib/data/doctors";
import { mockMedicines, mockPatientContext } from "@/mocks/console";
import type { ConsultContext, Medicine, RxLine } from "@/lib/types";

// Components get the consultation console data through this layer only. In P7 the server checks that this doctor is
// assigned to this patient, applies the allergy and restricted-medicine rules again, signs the prescription and
// stores it encrypted. The checks below are display helpers, never the safety net.

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

export function getConsultContext(id: string): ConsultContext | undefined {
  const consult = getDoctorConsults("joinable").find((c) => c.id === id);
  if (!consult) return undefined;
  const extra = mockPatientContext[consult.patientId] ?? {
    conditions: [],
    medicines: [],
    pastVisits: [],
    files: [],
  };
  const doc = getDoctor("d-1001");
  return {
    consult,
    patient: { name: consult.patientName, ageSex: consult.ageSex, ...extra },
    doctor: {
      name: doc?.name ?? "Dr. Maya Rao",
      qualifications: doc?.qualifications ?? "MBBS, MD (Medicine)",
      registrationNumber: doc?.registrationNumber ?? "KA/45678/2011",
      council: doc?.council ?? "Karnataka Medical Council",
    },
  };
}

export function searchMedicines(q: string): Medicine[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return mockMedicines.filter((m) => m.name.toLowerCase().includes(t)).slice(0, 8);
}

/** Allergies that clash with a medicine, by name or by drug family. */
export function allergyConflicts(m: Medicine, allergies: string[]): string[] {
  return allergies.filter((a) => {
    const t = a.toLowerCase();
    return (
      m.name.toLowerCase().includes(t) || m.classes.some((c) => t.includes(c) || c.includes(t))
    );
  });
}

export async function saveNotes(): Promise<{ status: "saved"; at: string }> {
  await delay(350);
  return { status: "saved", at: "just now" };
}

export type SendResult = { status: "sent"; reference: string } | { status: "error" };

export async function sendPrescription(lines: RxLine[]): Promise<SendResult> {
  await delay(900);
  return lines.length ? { status: "sent", reference: "RX-2026-009341" } : { status: "error" };
}

export function freqText(f: RxLine["freq"]): string {
  const parts = [f.morning && "morning", f.afternoon && "afternoon", f.night && "night"].filter(
    Boolean,
  ) as string[];
  const base = parts.length ? parts.join(", ") : "";
  return f.sos ? (base ? `${base}, and when needed` : "When needed (SOS)") : base || "As directed";
}
