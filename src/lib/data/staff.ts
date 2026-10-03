import { mockAdminAppointments, mockAdminUsers } from "@/mocks/admin";
import { mockBreakGlassRecords, mockTemplates, mockTickets } from "@/mocks/staff";
import { MOCK_NOW } from "@/mocks/doctors";
import { run } from "@/lib/data/admin";
import type { TableQuery } from "@/lib/schemas/admin";
import type { BreakGlassRecord, PatientLookup, Ticket } from "@/lib/types";

// The support pages get their data through this layer only. In P9 these become API calls. The server checks the
// support role, writes an audit entry for every read, and only returns a health record while a break-glass grant is
// active for that patient. The browser clock here is a stand-in for the server's grant expiry.

const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));
const priorityRank = { high: 0, normal: 1, low: 2 } as const;
const statusRank = { new: 0, open: 1, waiting: 2, solved: 3 } as const;

export const nowStamp = `${MOCK_NOW.date} ${MOCK_NOW.time}`;

export const queryTickets = (q: TableQuery) =>
  run<Ticket>(
    mockTickets,
    q,
    {
      due: (r) => (r.status === "solved" ? `9999 ${r.dueBy}` : r.dueBy),
      opened: (r) => r.opened,
      priority: (r) => priorityRank[r.priority],
      status: (r) => statusRank[r.status],
      topic: (r) => r.topic,
    },
    (r) => `${r.id} ${r.subject} ${r.requester}`,
    { priority: (r) => r.priority, status: (r) => r.status },
  );
export const getTicket = (id: string): Ticket | undefined => mockTickets.find((t) => t.id === id);
export const getTemplates = () => mockTemplates;

/** Minutes until the ticket is due. Negative means overdue. Solved tickets have no clock. */
export function minutesToDue(t: Ticket): number | null {
  if (t.status === "solved") return null;
  const parse = (s: string) => new Date(s.replace(" ", "T") + ":00+05:30").getTime();
  return Math.round((parse(t.dueBy) - parse(nowStamp)) / 60000);
}
export function formatDue(mins: number): string {
  const abs = Math.abs(mins);
  const text = abs >= 60 ? `${Math.round(abs / 60)} h` : `${abs} min`;
  return mins < 0 ? `Overdue by ${text}` : `Due in ${text}`;
}

export const getPatients = () => mockAdminUsers.filter((u) => u.role === "patient");

export function lookupPatients(q: string): PatientLookup[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  return getPatients()
    .filter((u) => `${u.name} ${u.id}`.toLowerCase().includes(needle))
    .slice(0, 8)
    .map((u) => {
      const label = `${u.name.split(" ")[0]} ${u.name.split(" ")[1]?.[0]}.`;
      return {
        id: u.id,
        name: u.name,
        phoneMasked: u.phoneMasked,
        joined: u.joined,
        status: u.status,
        bookings: mockAdminAppointments.filter((a) => a.patient === label).slice(0, 4),
      };
    });
}
export const getPatientName = (id: string) => getPatients().find((p) => p.id === id)?.name;

export type GrantResult = { status: "granted"; until: number } | { status: "reauth_failed" };

/** The prototype accepts any password except “wrong”. The grant starts now and ends after the chosen minutes. */
export async function requestBreakGlass(input: {
  patientId: string;
  minutes: number;
  password: string;
}): Promise<GrantResult> {
  await delay(700);
  if (input.password.toLowerCase() === "wrong") return { status: "reauth_failed" };
  return { status: "granted", until: Date.now() + input.minutes * 60_000 };
}

export function getBreakGlassRecord(patientId: string): BreakGlassRecord {
  return (
    mockBreakGlassRecords.find((r) => r.patientId === patientId) ?? {
      ...mockBreakGlassRecords[0]!,
      patientId,
    }
  );
}

export async function sendReply(): Promise<{ status: "sent" }> {
  await delay(500);
  return { status: "sent" };
}
