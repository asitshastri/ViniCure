"use client";

import { useId, useState } from "react";
import {
  DeviceMobile,
  Desktop,
  DeviceTablet,
  DownloadSimple,
  Trash,
} from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  cancelAccountDeletion,
  requestAccountDeletion,
  requestDataExport,
  setConsent,
  signOutSession,
} from "@/lib/data/profile";
import { formatSlotDay } from "@/lib/data/doctors";
import { deleteConfirm } from "@/lib/schemas/profile";
import type { ConsentItem, SignInSession } from "@/lib/types";

export function ConsentPanel({ initial }: { initial: ConsentItem[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [withdrawing, setWithdrawing] = useState<ConsentItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function apply(c: ConsentItem, granted: boolean) {
    setBusy(c.id);
    await setConsent();
    setBusy(null);
    setItems((l) => l.map((x) => (x.id === c.id ? { ...x, granted, since: "2026-10-02" } : x)));
    toast({
      tone: granted ? "success" : "info",
      title: granted ? "Consent given" : "Consent withdrawn",
      description: c.title,
    });
  }

  return (
    <>
      <ul className="divide-line border-line divide-y rounded-xl border">
        {items.map((c) => (
          <li key={c.id} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {c.title}
                {c.required ? <Badge tone="info">Needed for care</Badge> : null}
              </p>
              <p className="text-ink-muted mt-1 max-w-prose text-sm">{c.description}</p>
              <p className="text-ink-muted mt-1 text-sm">
                {c.granted ? "Given" : "Withdrawn"} on {formatSlotDay(c.since)}.
              </p>
            </div>
            <Switch
              label={`${c.title}: ${c.granted ? "on" : "off"}`}
              checked={c.granted}
              disabled={busy === c.id}
              onCheckedChange={(next) =>
                !next && c.required ? setWithdrawing(c) : void apply(c, next)
              }
            />
          </li>
        ))}
      </ul>
      <Dialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        title="Withdraw consent for care?"
        description="Without it, doctors cannot see your details and you cannot book consultations. Your past records stay in your account. You can give consent again at any time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setWithdrawing(null)}>
              Keep consent
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (withdrawing) void apply(withdrawing, false);
                setWithdrawing(null);
              }}
            >
              Withdraw
            </Button>
          </>
        }
      />
    </>
  );
}

const deviceIcon = { Phone: DeviceMobile, Laptop: Desktop, Tablet: DeviceTablet } as const;

export function SessionsPanel({ initial }: { initial: SignInSession[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const others = items.filter((s) => !s.current);

  async function signOut(ids: string[], label: string) {
    setBusy(ids.join(","));
    await signOutSession();
    setBusy(null);
    setItems((l) => l.filter((s) => !ids.includes(s.id)));
    toast({ tone: "success", title: "Signed out", description: label });
  }

  return (
    <div className="grid gap-4">
      <ul className="divide-line border-line divide-y rounded-xl border">
        {items.map((s) => {
          const Icon = deviceIcon[s.device as keyof typeof deviceIcon] ?? Desktop;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <Icon aria-hidden className="text-primary size-7 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.browser}</p>
                <p className="text-ink-muted text-sm">
                  {s.place}. Last active: {s.lastActive}.
                </p>
              </div>
              {s.current ? (
                <Badge tone="success">This device</Badge>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === s.id}
                  aria-label={`Sign out ${s.browser}`}
                  onClick={() => void signOut([s.id], s.browser)}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length ? (
        <div>
          <Button
            variant="secondary"
            loading={busy === others.map((s) => s.id).join(",")}
            onClick={() =>
              void signOut(
                others.map((s) => s.id),
                "All other devices",
              )
            }
          >
            Sign out of all other devices
          </Button>
        </div>
      ) : (
        <p className="text-ink-muted text-sm">No other devices are signed in.</p>
      )}
      <p className="text-ink-muted text-sm">
        Don’t recognise a device? Sign it out and tell us on the support page. Places are
        approximate.
      </p>
    </div>
  );
}

export function DataPanel() {
  const uid = useId();
  const { toast } = useToast();
  const [exportState, setExportState] = useState<"none" | "busy" | "preparing">("none");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [phraseError, setPhraseError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [scheduled, setScheduled] = useState<string | null>(null);

  async function exportData() {
    setExportState("busy");
    await requestDataExport();
    setExportState("preparing");
    toast({ tone: "success", title: "Export requested" });
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    const parsed = deleteConfirm.safeParse({ phrase });
    if (!parsed.success) return setPhraseError(parsed.error.issues[0]?.message);
    setPhraseError(undefined);
    setBusy(true);
    const r = await requestAccountDeletion();
    setBusy(false);
    setScheduled(r.effectiveOn);
    setDeleteOpen(false);
    setPhrase("");
  }

  async function undo() {
    setBusy(true);
    await cancelAccountDeletion();
    setBusy(false);
    setScheduled(null);
    toast({
      tone: "success",
      title: "Deletion cancelled",
      description: "Your account stays as it is.",
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h3 className="text-lg font-semibold">Download my data</h3>
        <p className="text-ink-muted max-w-prose">
          Get a copy of your profile, history, appointments and records in a file you can keep.
        </p>
        {exportState === "preparing" ? (
          <Notice tone="info" title="We are preparing your file">
            We will message you and show a download link here when it is ready. [Time to be
            confirmed.]
          </Notice>
        ) : (
          <div>
            <Button
              variant="secondary"
              loading={exportState === "busy"}
              onClick={() => void exportData()}
            >
              <DownloadSimple aria-hidden className="size-5" />
              Request my data
            </Button>
          </div>
        )}
      </div>

      <div className="border-line grid gap-2 border-t pt-6">
        <h3 className="text-lg font-semibold">Delete my account</h3>
        <p className="text-ink-muted max-w-prose">
          This removes your profile and records after a waiting period. Some medical records must be
          kept by law. We tell you which, and for how long. [Retention rules pending legal review.]
        </p>
        {scheduled ? (
          <Notice tone="warning" title={`Deletion scheduled for ${formatSlotDay(scheduled)}`}>
            You can change your mind until then.
            <div className="mt-3">
              <Button variant="secondary" loading={busy} onClick={() => void undo()}>
                Cancel deletion
              </Button>
            </div>
          </Notice>
        ) : (
          <div>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash aria-hidden className="size-5" />
              Delete my account
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        dismissible={!busy}
        variant="sheet"
        title="Delete your account?"
        description="Please read this first."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Keep my account
            </Button>
            <Button type="submit" form={`${uid}-del`} variant="danger" loading={busy}>
              Schedule deletion
            </Button>
          </>
        }
      >
        <form
          id={`${uid}-del`}
          noValidate
          onSubmit={(e) => void confirmDelete(e)}
          className="grid gap-4"
        >
          <ul className="text-ink-muted list-disc pl-5">
            <li>Upcoming appointments are cancelled and refunded as per the policy.</li>
            <li>Doctors lose access to everything you shared.</li>
            <li>
              Your account is hidden at once and erased after 30 days. Records we must keep stay
              locked and unused.
            </li>
          </ul>
          <Field inputId={`${uid}-ph`} label="Type DELETE to confirm" error={phraseError} required>
            {({ describedBy, invalid }) => (
              <Input
                id={`${uid}-ph`}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
