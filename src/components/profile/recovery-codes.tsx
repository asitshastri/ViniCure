"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";

// Recovery codes (P2-18, D-019): ten single-use codes shown once. They are the way back in when
// a phone sign-in is limited and Google is not set up. Making a new set ends the old one.

export function RecoveryCodesPanel() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/me/recovery-codes", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { remaining: number }) : null))
      .then((v) => !cancelled && setRemaining(v ? v.remaining : null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/v1/me/recovery-codes", {
        method: "POST",
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => ({}))) as { codes?: string[]; code?: string };
      if (response.ok && body.codes) {
        setCodes(body.codes);
        setSaved(false);
        setRemaining(body.codes.length);
      } else if (body.code === "fresh_login_required") {
        setProblem("For your safety, sign in again with your mobile number, then try again.");
      } else {
        setProblem("We could not make new codes. Try again in a moment.");
      }
    } catch {
      setProblem("We could not make new codes. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">
        {remaining === null
          ? "Recovery codes let you confirm it is you on a new device."
          : remaining > 0
            ? `You have ${remaining} unused recovery code${remaining === 1 ? "" : "s"}.`
            : "You have no recovery codes yet."}
      </p>
      {codes ? (
        <div className="grid gap-3">
          <Notice tone="warning" title="Save these codes now">
            They are shown only once. Keep them somewhere private, not in your phone messages. Each
            works one time.
          </Notice>
          <ul
            data-testid="recovery-codes"
            className="border-line bg-canvas grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border p-4 font-mono sm:grid-cols-3"
          >
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I have saved my recovery codes</span>
          </label>
          <div>
            <Button variant="secondary" disabled={!saved} onClick={() => setCodes(null)}>
              Hide the codes
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" loading={busy} onClick={() => void generate()}>
            {remaining && remaining > 0
              ? "Make a new set (the old codes stop working)"
              : "Make recovery codes"}
          </Button>
        </div>
      )}
      {problem ? (
        <p role="alert" className="text-danger text-sm font-medium">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
