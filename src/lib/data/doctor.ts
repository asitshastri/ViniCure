import {
  mockAvailability,
  mockDoctorConsults,
  mockDoctorPatients,
  mockEarningLines,
  mockPayouts,
  mockTimeOff,
} from "@/mocks/doctor";
import { MOCK_NOW } from "@/mocks/doctors";
import type {
  AvailabilityDay,
  DoctorConsultView,
  DoctorPatient,
  EarningLine,
  Payout,
  TimeOff,
} from "@/lib/types";

// Components get doctor data through this layer only. In P4 and P5 these call the doctor APIs; the server decides
// which patients a doctor may see (only those assigned to them) and what they earn.

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

export type DoctorScenario = "default" | "away" | "joinable" | "empty";
export const START_OPENS_MINUTES = 10;

const toMinutes = (date: string, time: string) =>
  Math.round(new Date(`${date}T${time}:00Z`).getTime() / 60000);

export function getDoctorConsults(scenario: DoctorScenario = "default"): DoctorConsultView[] {
  if (scenario === "empty") return [];
  const now = toMinutes(MOCK_NOW.date, scenario === "joinable" ? "17:25" : MOCK_NOW.time);
  return mockDoctorConsults.map((c) => {
    const minutesUntil = toMinutes(c.date, c.time) - now;
    return {
      ...c,
      minutesUntil,
      canStart:
        c.status === "upcoming" && minutesUntil <= START_OPENS_MINUTES && minutesUntil > -30,
    };
  });
}

export const getTodayDate = () => MOCK_NOW.date;
export const getDoctorPatients = (): DoctorPatient[] => mockDoctorPatients;
export const getAvailability = (): AvailabilityDay[] => mockAvailability;
export const getTimeOff = (): TimeOff[] => mockTimeOff;
export const getPayouts = (): Payout[] => mockPayouts;
export const getEarningLines = (): EarningLine[] => mockEarningLines;

export type SaveResult = { status: "saved" } | { status: "error" };

export async function setAvailable(): Promise<SaveResult> {
  await delay(350);
  return { status: "saved" };
}

export async function saveAvailability(): Promise<SaveResult> {
  await delay();
  return { status: "saved" };
}

export async function saveTimeOff(): Promise<SaveResult> {
  await delay(400);
  return { status: "saved" };
}

export function formatClock(time: string): string {
  const [h = "0", m = "00"] = time.split(":");
  const hour = Number(h);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour < 12 ? "am" : "pm"}`;
}
