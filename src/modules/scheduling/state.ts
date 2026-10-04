// The appointment state machine (P4-06): one table of allowed moves. The service asks it before
// any change, and the repository applies a move only if the row is still in the state the move
// was decided on, so two requests cannot both win.
//
//   held         --pay-->      scheduled        (payments, P5)
//   held         --timeout-->  expired          (release job, P4-07)
//   held         --release-->  cancelled_by_patient
//   scheduled    --start-->    in_progress      (video, P6)
//   scheduled    --cancel-->   cancelled_by_patient | cancelled_by_doctor | cancelled_by_admin
//   scheduled    --missed-->   no_show
//   in_progress  --end-->      completed
// Completed, cancelled, expired and no_show are final.

export const STATUSES = [
  "held",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled_by_patient",
  "cancelled_by_doctor",
  "cancelled_by_admin",
  "expired",
  "no_show",
] as const;
export type Status = (typeof STATUSES)[number];

const MOVES: Record<Status, readonly Status[]> = {
  held: ["scheduled", "expired", "cancelled_by_patient"],
  scheduled: [
    "in_progress",
    "cancelled_by_patient",
    "cancelled_by_doctor",
    "cancelled_by_admin",
    "no_show",
  ],
  in_progress: ["completed"],
  completed: [],
  cancelled_by_patient: [],
  cancelled_by_doctor: [],
  cancelled_by_admin: [],
  expired: [],
  no_show: [],
};

export const canMove = (from: string, to: string): boolean =>
  (MOVES[from as Status] ?? []).includes(to as Status);

export const isFinal = (status: string): boolean => (MOVES[status as Status] ?? []).length === 0;

/** Who is cancelling decides the final status. */
export type Canceller = "patient" | "doctor" | "admin";
export const cancelStatusFor = (who: Canceller): Status =>
  ({ patient: "cancelled_by_patient", doctor: "cancelled_by_doctor", admin: "cancelled_by_admin" })[
    who
  ] as Status;

/** Cancel reasons are a fixed list, never free text, so no health detail lands in the history. */
export const CANCEL_REASONS = [
  "changed_mind",
  "schedule_conflict",
  "doctor_unavailable",
  "booked_by_mistake",
  "other",
] as const;

/** NOT VERIFIED (TODO.md, Questions): how many times one booking may be moved. */
export const MAX_RESCHEDULES = 2;
