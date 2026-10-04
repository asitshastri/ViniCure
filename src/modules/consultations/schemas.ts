import { z } from "zod";

// Video consultations (P6-03, P6-04). Inputs are strict; outputs are allow-lists.

export const appointmentParams = z.object({ appointmentId: z.uuid() }).strict();

/** Everything the video SDK needs to join, for this person only. */
export type JoinView = {
  appointmentId: string;
  role: "patient" | "doctor";
  /** The provider's public app id (not a secret). */
  appId: string;
  /** The room name: random, and only given to the two people who may be in it. */
  channel: string;
  /** This person's own number in the room; the token works for this number only. */
  uid: number;
  token: string;
  expiresAt: string;
};

export type EndView = { status: "ended" | "abandoned" };

/** The minutes around the booked time in which the call can be joined. */
export type JoinWindow = { earlyMinutes: number; lateMinutes: number };

/** A token can still be renewed for this long after the join window closes (a call that runs over). */
export const MAX_OVERRUN_MINUTES = 120;

/** What the assigned doctor sees when opening a consultation: an allow-list, never a database row. */
export type ConsoleView = {
  appointmentId: string;
  status: "scheduled" | "in_progress";
  startAt: string;
  endAt: string;
  patient: {
    name: string;
    ageYears: number;
    sex: string;
    /** "self", or how the patient is related to the account holder who booked. */
    relation: string;
    isMinor: boolean;
    attendingAdult: { name: string; relation: string } | null;
  };
  /** What the patient wrote when booking. Clinical text: reading it is logged. */
  reason: string | null;
  doctor: {
    name: string;
    qualifications: string;
    registrationNo: string;
    council: string;
  };
};
