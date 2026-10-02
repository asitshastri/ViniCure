import {
  mockConsents,
  mockHistory,
  mockProfile,
  mockReferral,
  mockSessions,
  mockVitals,
} from "@/mocks/profile";
import { getFamilyMembers } from "@/lib/data/booking";
import type {
  ConsentItem,
  FamilyMember,
  MedicalHistory,
  PatientProfile,
  ReferralInfo,
  SignInSession,
  VitalReading,
} from "@/lib/types";

// Components call these only. In P2 and P7 they call the profile, history and privacy APIs. Every save is validated again
// on the server, and the server decides who may read or change which profile.

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

export type SaveResult = { status: "saved" } | { status: "error" };

export const getProfile = (): PatientProfile => mockProfile;
export const getHistory = (): MedicalHistory => mockHistory;
export const getVitals = (): VitalReading[] => mockVitals;
export const getConsents = (): ConsentItem[] => mockConsents;
export const getSessions = (): SignInSession[] => mockSessions;
export const getReferral = (): ReferralInfo => mockReferral;
export const getFamily = (): FamilyMember[] => getFamilyMembers();

/** Prototype rule: a name of “Simulate Error” shows a failed save. */
export async function saveProfile(input: { name: string }): Promise<SaveResult> {
  await delay();
  return input.name.trim().toLowerCase() === "simulate error"
    ? { status: "error" }
    : { status: "saved" };
}

export async function saveSimple(): Promise<SaveResult> {
  await delay();
  return { status: "saved" };
}

export async function setConsent(): Promise<SaveResult> {
  await delay(400);
  return { status: "saved" };
}

export async function signOutSession(): Promise<SaveResult> {
  await delay(400);
  return { status: "saved" };
}

export type ExportStatus = "none" | "preparing" | "ready";

export async function requestDataExport(): Promise<{ status: "preparing" }> {
  await delay(600);
  return { status: "preparing" };
}

export async function requestAccountDeletion(): Promise<{
  status: "scheduled";
  effectiveOn: string;
}> {
  await delay(700);
  return { status: "scheduled", effectiveOn: "2026-11-01" };
}

export async function cancelAccountDeletion(): Promise<SaveResult> {
  await delay(400);
  return { status: "saved" };
}
