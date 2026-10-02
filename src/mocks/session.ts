import type { MockSession, Role } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007). Replaced by the real session in P2.
export const mockSessions: Record<Role, MockSession> = {
  patient: {
    user: { name: "Asha Verma", subtitle: "Patient" },
    notifications: [
      {
        id: "n1",
        title: "Your consultation with Dr. Maya Rao starts tomorrow at 10:30",
        time: "1 hour ago",
        unread: true,
      },
      { id: "n2", title: "Prescription from Dr. Rao is ready", time: "Yesterday", unread: true },
      { id: "n3", title: "Payment of ₹499 received", time: "2 days ago", unread: false },
    ],
  },
  doctor: {
    user: { name: "Dr. Maya Rao", subtitle: "General Physician" },
    notifications: [
      {
        id: "n1",
        title: "New consultation booked for 10:30",
        time: "20 minutes ago",
        unread: true,
      },
      { id: "n2", title: "Rohan Shah shared 2 files", time: "2 hours ago", unread: true },
      { id: "n3", title: "Payout for last week was processed", time: "3 days ago", unread: false },
    ],
  },
  admin: {
    user: { name: "Neha Kapoor", subtitle: "Administrator" },
    notifications: [
      { id: "n1", title: "3 doctor applications waiting for review", time: "Today", unread: true },
      { id: "n2", title: "Refund request needs approval", time: "Today", unread: true },
    ],
  },
  support: {
    user: { name: "Imran Khan", subtitle: "Support" },
    notifications: [
      { id: "n1", title: "5 tickets waiting in the queue", time: "Now", unread: true },
    ],
  },
};
