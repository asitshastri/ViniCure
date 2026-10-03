import { getConfig } from "./config";

export const FEATURE_FLAGS = ["ai_triage", "recording", "referrals"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

const FLAG_TO_KEY = {
  ai_triage: "FEATURE_AI_TRIAGE",
  recording: "FEATURE_RECORDING",
  referrals: "FEATURE_REFERRALS",
} as const satisfies Record<FeatureFlag, string>;

/** True only when the flag is explicitly switched on. Every flag is off by default. */
export function isEnabled(flag: FeatureFlag, config = getConfig()): boolean {
  return config[FLAG_TO_KEY[flag]] === true;
}
