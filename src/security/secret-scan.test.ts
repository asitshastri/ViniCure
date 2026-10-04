import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanFile } from "../../scripts/secret-scan.mjs";

// P0-11: the pre-commit secret scan. Fake secrets are built from pieces so this file itself
// does not look like one to the scanner or to gitleaks.
const aws = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const google = ["GOCSPX", "-", "abcdefghijklmnopqrstuvwxyz0123"].join("");
const key = ["-----BEGIN", " RSA PRIVATE KEY", "-----"].join("");
const gh = ["ghp", "_", "a".repeat(36)].join("");
const jwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
].join(".");

describe("scanFile", () => {
  it.each([
    ["AWS access key", `const id = "${aws}";`],
    ["Google OAuth client secret", `GOOGLE_CLIENT_SECRET=${google}`],
    ["private key block", `${key}\nMIIEow`],
    ["GitHub token", `token: ${gh}`],
    ["JSON web token", `Authorization: Bearer ${jwt}`],
    [
      "database URL with a password",
      [
        "DATABASE_URL=postgres",
        "://admin:",
        "S3cretPassw0rd",
        "@db.prod.example.com:5432/app",
      ].join(""),
    ],
    [
      "secret assigned in code",
      `const apiKey = "${["abcdefghijklmnopqrstuvwxyz", "123456"].join("")}";`,
    ],
  ])("catches a %s", (_name, text) => {
    expect(scanFile("src/config.ts", text).length).toBeGreaterThan(0);
  });

  it.each([
    ".env",
    ".env.local",
    ".env.production",
    "config/server.pem",
    "deploy/id_rsa",
    "terraform.tfstate",
    ".npmrc",
    "dump.rdb",
  ])("refuses the file %s", (file) => {
    expect(scanFile(file, "").length).toBeGreaterThan(0);
  });

  it("lets harmless things through", () => {
    expect(scanFile(".env.example", "DATABASE_URL=\nAUTH_SECRET=\n")).toEqual([]);
    expect(
      scanFile(
        "docker/README.md",
        "DATABASE_URL=postgres://app:dev-only-change-me@localhost:5432/vinicure",
      ),
    ).toEqual([]);
    expect(scanFile("src/a.ts", 'const password = "short";')).toEqual([]);
    expect(scanFile("src/a.ts", "const token = process.env.TOKEN;")).toEqual([]);
    expect(scanFile("src/a.ts", `const test = "${aws}"; // secret-scan:allow`)).toEqual([]);
    expect(scanFile("logo.png", "\u0000PNG binary")).toEqual([]);
  });

  it("names the file and the line", () => {
    const problems = scanFile("src/x.ts", `ok\nok\nconst id = "${aws}";`);
    expect(problems[0]).toMatch(/^src\/x\.ts:3: looks like a AWS access key id$/);
  });
});

// The real thing: a throwaway git repository with the hook scripts, a staged fake secret, and
// a commit that must be refused.
describe("pre-commit hook", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  function sandbox() {
    const dir = mkdtempSync(path.join(tmpdir(), "secret-scan-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    mkdirSync(path.join(dir, "scripts"));
    copyFileSync(
      path.join(root, "scripts/secret-scan.mjs"),
      path.join(dir, "scripts/secret-scan.mjs"),
    );
    return {
      dir,
      git,
      scan: () =>
        execFileSync("node", ["scripts/secret-scan.mjs"], {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
    };
  }

  it("blocks a commit that stages a secret and passes a clean one", () => {
    const s = sandbox();
    try {
      writeFileSync(path.join(s.dir, "ok.ts"), "export const a = 1;\n");
      s.git("add", "ok.ts");
      expect(() => s.scan()).not.toThrow();

      writeFileSync(path.join(s.dir, "leak.ts"), `export const k = "${aws}";\n`);
      s.git("add", "leak.ts");
      let failure: { status?: number; stderr?: string } = {};
      try {
        s.scan();
      } catch (e) {
        failure = e as { status?: number; stderr?: string };
      }
      expect(failure.status).toBe(1);
      expect(String(failure.stderr)).toContain("Commit blocked");
      expect(String(failure.stderr)).toContain("leak.ts:1");
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it("blocks a staged .env file even when it has no obvious secret in it", () => {
    const s = sandbox();
    try {
      writeFileSync(path.join(s.dir, ".env.local"), "LOG_LEVEL=info\n");
      s.git("add", "-f", ".env.local");
      expect(() => s.scan()).toThrow();
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it("scans what is staged, not what is on disk", () => {
    const s = sandbox();
    try {
      writeFileSync(path.join(s.dir, "a.ts"), "export const a = 1;\n");
      s.git("add", "a.ts");
      writeFileSync(path.join(s.dir, "a.ts"), `export const k = "${aws}";\n`); // not staged
      expect(() => s.scan()).not.toThrow();
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });
});
