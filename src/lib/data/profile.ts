import {
  mockConsents,
  mockHistory,
  mockProfile,
  mockReferral,
  mockSessions,
  mockVitals,
} from "@/mocks/profile";
import { getFamilyMembers } from "@/lib/data/booking";
import { MOCK_AUTH } from "@/lib/data/auth";
import * as patients from "@/lib/data/patients-api";
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

// ---- Family members (P2-09, P2-12): real calls, or the mock list while previewing ----

export type FamilyView = {
  id: string;
  name: string;
  /** Label shown to the person: Spouse, Parent, Child, Sibling, Other. */
  relation: string;
  dob: string;
  gender: string;
  /** Worked out by the server from the date of birth. */
  isMinor: boolean;
  age: number;
};

export type FamilyDraft = {
  id?: string;
  name: string;
  dob: string;
  gender: string;
  relation: string;
};
export type FamilySaveResult =
  | { status: "saved"; member: FamilyView }
  | { status: "fields"; errors: Record<string, string> }
  | { status: "error"; message: string };

const ageOf = (dob: string): number => {
  const born = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
};

const label = (relation: string) => relation.charAt(0).toUpperCase() + relation.slice(1);

export function toFamilyView(p: patients.PatientDto): FamilyView {
  return {
    id: p.id,
    name: p.fullName,
    relation: label(p.relation),
    dob: p.dob,
    gender: p.gender,
    isMinor: p.isMinor,
    age: ageOf(p.dob),
  };
}

let mockFamilyList: FamilyView[] | undefined;
const mockList = (): FamilyView[] =>
  (mockFamilyList ??= getFamilyMembers().map((m) => ({
    id: m.id,
    name: m.name,
    relation: m.relation,
    dob: `${new Date().getUTCFullYear() - m.age}-01-01`,
    gender: "undisclosed",
    isMinor: m.age < 18,
    age: m.age,
  })));

/** The account's family members: every profile except the person's own. */
export async function listFamily(): Promise<FamilyView[] | null> {
  if (MOCK_AUTH) return mockList();
  const all = await patients.list();
  return all ? all.filter((p) => p.relation !== "self").map(toFamilyView) : null;
}

export async function saveFamilyMember(draft: FamilyDraft): Promise<FamilySaveResult> {
  if (MOCK_AUTH) {
    await delay();
    const member: FamilyView = {
      id: draft.id ?? `fm-new-${mockList().length + 1}`,
      name: draft.name,
      relation: draft.relation,
      dob: draft.dob,
      gender: draft.gender,
      isMinor: ageOf(draft.dob) < 18,
      age: ageOf(draft.dob),
    };
    return { status: "saved", member };
  }
  const body = {
    fullName: draft.name,
    dob: draft.dob,
    gender: draft.gender,
    relation: draft.relation.toLowerCase(),
  };
  const result = draft.id ? await patients.update(draft.id, body) : await patients.create(body);
  if (result.status === "ok") return { status: "saved", member: toFamilyView(result.patient) };
  if (result.status === "fields") return { status: "fields", errors: result.errors };
  return { status: "error", message: result.message };
}

export async function removeFamilyMember(id: string): Promise<SaveResult> {
  if (MOCK_AUTH) {
    await delay(400);
    return { status: "saved" };
  }
  return (await patients.remove(id)) ? { status: "saved" } : { status: "error" };
}
