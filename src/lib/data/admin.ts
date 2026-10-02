import {
  mockAdminAppointments,
  mockAdminDoctors,
  mockAdminUsers,
  mockAttendance,
  mockAudit,
  mockDaily,
  mockDataRequests,
  mockKyc,
  mockPhi,
  mockRefunds,
  mockWeeklyRevenue,
} from "@/mocks/admin";
import type { TableQuery } from "@/lib/schemas/admin";
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

// The admin pages get their data through this layer only. In P9 these become API calls that sort, filter and page in
// SQL from the same allow-lists, check the admin's role, and write an audit entry for every action. The browser never
// sends a column name or filter that was not on the list.

const PAGE_SIZE = 10;
const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

export type Page<T> = { rows: T[]; total: number; page: number; pageCount: number };

function run<T>(
  rows: T[],
  q: TableQuery,
  get: Record<string, (r: T) => string | number>,
  search: (r: T) => string,
  pageSize = PAGE_SIZE,
): Page<T> {
  let list = rows.filter((r) =>
    Object.entries(q.filters).every(([k, v]) => String(get[k]?.(r)) === v),
  );
  const needle = q.q.toLowerCase();
  if (needle) list = list.filter((r) => search(r).toLowerCase().includes(needle));
  const g = get[q.sort];
  if (g) {
    list = [...list].sort((a, b) => {
      const x = g(a);
      const y = g(b);
      const c =
        typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return q.dir === "asc" ? c : -c;
    });
  }
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(q.page, pageCount);
  return { rows: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageCount };
}

export const queryUsers = (q: TableQuery) =>
  run<AdminUser>(
    mockAdminUsers,
    q,
    { name: (r) => r.name, role: (r) => r.role, joined: (r) => r.joined, status: (r) => r.status },
    (r) => r.name,
  );
export const queryDoctors = (q: TableQuery) =>
  run<AdminDoctor>(
    mockAdminDoctors,
    q,
    {
      name: (r) => r.name,
      specialty: (r) => r.specialty,
      rating: (r) => r.rating,
      consultations: (r) => r.consultations,
      joined: (r) => r.joined,
      status: (r) => r.status,
    },
    (r) => `${r.name} ${r.registrationNumber}`,
  );
export const queryAppointments = (q: TableQuery) =>
  run<AdminAppointment>(
    mockAdminAppointments,
    q,
    {
      date: (r) => r.date,
      doctor: (r) => r.doctor,
      type: (r) => r.type,
      status: (r) => r.status,
      fee: (r) => r.feePaise,
      payment: (r) => r.payment,
    },
    (r) => `${r.id} ${r.doctor} ${r.patient}`,
  );
export const queryAudit = (q: TableQuery, kind: "audit" | "phi") =>
  run<AuditEntry>(
    kind === "audit" ? mockAudit : mockPhi,
    q,
    { when: (r) => r.when, actor: (r) => r.actor, role: (r) => r.role, action: (r) => r.action },
    (r) => `${r.actor} ${r.action} ${r.target}`,
  );
export const queryAttendance = (q: TableQuery) =>
  run<AttendanceRow>(
    mockAttendance,
    q,
    {
      doctor: (r) => r.doctor,
      scheduled: (r) => r.scheduledHours,
      online: (r) => r.onlineHours,
      onTime: (r) => r.onTimePercent,
      noShows: (r) => r.noShows,
    },
    (r) => r.doctor,
  );
export const queryDataRequests = (q: TableQuery) =>
  run<DataRequest>(
    mockDataRequests,
    q,
    {
      received: (r) => r.received,
      due: (r) => r.due,
      type: (r) => r.type,
      status: (r) => r.status,
    },
    (r) => r.patient,
  );

export const getKyc = (): KycItem[] => mockKyc;
export const getRefunds = (): RefundRequest[] => mockRefunds;
export const getWeeklyRevenue = (): WeeklyRevenue[] => mockWeeklyRevenue;
export const getDaily = (): DailyCount[] => mockDaily;
export const getKpis = () => ({
  today: 47,
  activeDoctors: mockAdminDoctors.filter((d) => d.status === "live").length,
  weekRevenuePaise:
    (mockWeeklyRevenue.at(-1)?.video ?? 0) +
    (mockWeeklyRevenue.at(-1)?.audio ?? 0) +
    (mockWeeklyRevenue.at(-1)?.followup ?? 0),
  pendingKyc: mockKyc.filter((k) => k.status === "pending").length,
  pendingRefunds: mockRefunds.filter((r) => r.status === "pending").length,
  openRequests: mockDataRequests.filter((r) => r.status !== "done").length,
});

export type ActionResult = { status: "done" } | { status: "reauth_failed" };

/** Sensitive actions need a fresh sign-in. The prototype accepts any password except “wrong”. */
export async function decideKyc(): Promise<ActionResult> {
  await delay();
  return { status: "done" };
}

export async function decideRefund(input: {
  id: string;
  decision: "approve" | "decline";
  password: string;
}): Promise<ActionResult> {
  await delay();
  return input.password.toLowerCase() === "wrong"
    ? { status: "reauth_failed" }
    : { status: "done" };
}

export async function updateRequest(): Promise<ActionResult> {
  await delay(500);
  return { status: "done" };
}
