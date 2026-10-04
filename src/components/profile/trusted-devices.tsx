"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Browsers remembered for 30 days after a second method was proven (P2-18). Forgetting one makes
// its next phone sign-in limited again.

type Device = { id: string; label: string; lastSeenAt: string; expiresAt: string };

export function TrustedDevicesPanel() {
  const [items, setItems] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/me/devices", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("not ok");
        return ((await r.json()) as { items: Device[] }).items;
      })
      .then((v) => !cancelled && setItems(v))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function forget(id: string) {
    setBusy(id);
    const response = await fetch(`/api/v1/me/devices/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    setBusy(null);
    if (response.ok) setItems((l) => (l ?? []).filter((d) => d.id !== id));
  }

  if (failed)
    return (
      <p role="alert" className="text-danger">
        We could not load your devices.
      </p>
    );
  if (!items)
    return (
      <p role="status" className="text-ink-muted">
        Loading your devices.
      </p>
    );
  if (items.length === 0) {
    return (
      <p className="text-ink-muted">
        No devices are remembered. Each new sign-in will ask you to confirm it is you.
      </p>
    );
  }
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return (
    <ul className="divide-line border-line divide-y rounded-xl border">
      {items.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{d.label}</p>
            <p className="text-ink-muted text-sm">
              Last used {fmt(d.lastSeenAt)}. Remembered until {fmt(d.expiresAt)}.
            </p>
          </div>
          <Badge tone="info">Remembered</Badge>
          <Button
            variant="secondary"
            size="sm"
            loading={busy === d.id}
            aria-label={`Forget ${d.label}`}
            onClick={() => void forget(d.id)}
          >
            Forget
          </Button>
        </li>
      ))}
    </ul>
  );
}
