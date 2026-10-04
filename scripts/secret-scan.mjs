#!/usr/bin/env node
// Pre-commit secret scan (P0-11). Reads the files git is about to commit (the staged content,
// not the working copy) and refuses the commit when one looks like it holds a secret or is a
// file that must never be committed. CI runs gitleaks over the whole history as the second
// net; this one stops the mistake before it leaves the machine.
//
//   node scripts/secret-scan.mjs            scan the staged files
//   node scripts/secret-scan.mjs --stdin    read one "path\0content" pair from stdin (tests)
//
// To allow a known-safe line (a test value), end it with: // secret-scan:allow

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const FORBIDDEN_FILES = [
  /(^|\/)\.env($|\.)(?!example$)/, // .env, .env.local, .env.production ... but not .env.example
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)credentials(\.json)?$/i,
  /\.tfstate(\.backup)?$/,
  /(^|\/)dump\.rdb$/,
];

export const SECRET_PATTERNS = [
  { name: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: "AWS secret access key",
    re: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}\b/i,
  },
  {
    name: "private key block",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  { name: "Google OAuth client secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: "GitHub token",
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: "Stripe or Razorpay live key",
    re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b|\brzp_live_[A-Za-z0-9]{10,}\b/,
  },
  {
    name: "JSON web token",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: "database URL with a password",
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:(?!dev-only-change-me\b)[^\s@/]{6,}@(?!localhost\b|127\.0\.0\.1\b|postgres\b|valkey\b)[^\s/]+/i,
  },
  {
    name: "secret assigned in code or config",
    re: /\b(?:api[_-]?key|secret|passwd|password|token)\b["']?\s*[:=]\s*["'][A-Za-z0-9/+=_-]{24,}["']/i,
  },
];

const ALLOW = /secret-scan:allow/;

/** Problems in one file: its path, or lines in its text. */
export function scanFile(path, text) {
  const problems = [];
  if (FORBIDDEN_FILES.some((re) => re.test(path))) {
    problems.push(`${path}: this kind of file must never be committed`);
  }
  if (typeof text !== "string" || text.includes("\u0000")) return problems; // binary
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (ALLOW.test(line) || line.length > 4000) return;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) problems.push(`${path}:${index + 1}: looks like a ${name}`);
    }
  });
  return problems;
}

function staged() {
  const names = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    {
      encoding: "utf8",
    },
  )
    .split("\u0000")
    .filter(Boolean);
  return names.map((name) => {
    let text = "";
    try {
      text = execFileSync("git", ["show", `:${name}`], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch {
      /* unreadable: treated as empty */
    }
    return { name, text };
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const problems = staged().flatMap(({ name, text }) => scanFile(name, text));
  if (problems.length > 0) {
    console.error("\nCommit blocked: possible secrets found.\n");
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nRemove the secret (and rotate it if it was ever real). If a line is a harmless test value,\nend it with: // secret-scan:allow\n",
    );
    process.exit(1);
  }
}
