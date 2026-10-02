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
