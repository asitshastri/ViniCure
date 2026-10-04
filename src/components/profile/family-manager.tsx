"use client";

import { useEffect, useId, useState } from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  listFamily,
  removeFamilyMember,
  saveFamilyMember,
  type FamilyView,
} from "@/lib/data/profile";
import { fieldErrors } from "@/lib/schemas/auth";
import { FAMILY_RELATIONS, FAMILY_SEX, familyMemberForm } from "@/lib/schemas/profile";

type Draft = { id: string; name: string; dob: string; gender: string; relation: string };
const blank: Draft = { id: "", name: "", dob: "", gender: "", relation: "" };
const SEX_LABEL: Record<string, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  undisclosed: "Prefer not to say",
};

export function FamilyManager() {
  const uid = useId();
  const { toast } = useToast();
  const [members, setMembers] = useState<FamilyView[]>([]);
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<FamilyView | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const ids = {
    name: `${uid}-fname`,
    dob: `${uid}-fdob`,
    gender: `${uid}-fsex`,
    relation: `${uid}-frel`,
  };
  const formId = `${uid}-family`;
  const editing = draft?.id !== "" && draft !== null;

  useEffect(() => {
    let cancelled = false;
    void listFamily().then((list) => {
      if (cancelled) return;
      if (list) setMembers(list);
      setLoaded(list ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const parsed = familyMemberForm.safeParse(draft);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setSaveError(null);
    setBusy(true);
    const result = await saveFamilyMember({
      ...parsed.data,
      ...(draft.id ? { id: draft.id } : {}),
    });
    setBusy(false);
    if (result.status === "fields") {
      setErrors(result.errors);
      setAttempt((a) => a + 1);
      return;
    }
    if (result.status === "error") {
      setSaveError(result.message);
      return;
    }
    const saved = result.member;
    setMembers((l) => (draft.id ? l.map((m) => (m.id === draft.id ? saved : m)) : [...l, saved]));
    toast({
      tone: "success",
      title: draft.id ? "Family member updated" : "Family member added",
      description: saved.name,
    });
    setDraft(null);
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const result = await removeFamilyMember(removing.id);
    setBusy(false);
    if (result.status === "error") {
      toast({ tone: "danger", title: "Could not remove", description: "Try again in a moment." });
      return;
    }
    setMembers((l) => l.filter((m) => m.id !== removing.id));
    toast({ tone: "success", title: "Removed", description: removing.name });
    setRemoving(null);
  }

  return (
    <div className="grid gap-4">
      {loaded === "loading" ? (
        <p role="status" className="text-ink-muted">
          Loading your family members.
        </p>
      ) : loaded === "failed" ? (
        <p role="alert" className="text-danger">
          We could not load your family members. Refresh the page to try again.
        </p>
      ) : members.length ? (
        <ul className="divide-line border-line divide-y rounded-xl border">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}</p>
                <p className="text-ink-muted text-sm">
                  {m.relation}, {m.age} years, born {m.dob}
                </p>
              </div>
              {m.isMinor ? <Badge tone="info">Child. You manage this profile</Badge> : null}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Edit ${m.name}`}
                onClick={() =>
                  setDraft({
                    id: m.id,
                    name: m.name,
                    dob: m.dob,
                    gender: m.gender,
                    relation: m.relation,
                  })
                }
              >
                <PencilSimple aria-hidden className="size-4" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                aria-label={`Remove ${m.name}`}
                onClick={() => setRemoving(m)}
              >
                <Trash aria-hidden className="size-4" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
          No family members yet. Add a parent or child to book consultations for them.
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            setErrors({});
            setSaveError(null);
            setDraft({ ...blank });
          }}
        >
          <Plus aria-hidden className="size-5" /> Add a family member
        </Button>
      </div>

      <Dialog
        open={Boolean(draft)}
        onClose={() => !busy && setDraft(null)}
        dismissible={!busy}
        variant="sheet"
        title={editing ? "Edit family member" : "Add a family member"}
        description="They do not need their own account. You book and manage care for them."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={busy}>
              {editing ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        {draft ? (
          <form id={formId} noValidate onSubmit={(e) => void save(e)} className="grid gap-4">
            <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
            {saveError ? (
              <p role="alert" className="text-danger text-sm font-medium">
                {saveError}
              </p>
            ) : null}
            <Field inputId={ids.name} label="Full name" error={errors.name} required>
              {({ describedBy, invalid }) => (
                <Input
                  id={ids.name}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Field inputId={ids.dob} label="Date of birth" error={errors.dob} required>
              {({ describedBy, invalid }) => (
                <Input
                  id={ids.dob}
                  type="date"
                  value={draft.dob}
                  onChange={(e) => setDraft({ ...draft, dob: e.target.value })}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Field inputId={ids.gender} label="Sex" error={errors.gender} required>
              {({ describedBy, invalid }) => (
                <Select
                  id={ids.gender}
                  value={draft.gender}
                  onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                >
                  <option value="">Choose</option>
                  {FAMILY_SEX.map((g) => (
                    <option key={g} value={g}>
                      {SEX_LABEL[g]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field inputId={ids.relation} label="Relation to you" error={errors.relation} required>
              {({ describedBy, invalid }) => (
                <Select
                  id={ids.relation}
                  value={draft.relation}
                  onChange={(e) => setDraft({ ...draft, relation: e.target.value })}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                >
                  <option value="">Choose</option>
                  {FAMILY_RELATIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              )}
            </Field>
          </form>
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(removing)}
        onClose={() => !busy && setRemoving(null)}
        dismissible={!busy}
        title={`Remove ${removing?.name ?? ""}?`}
        description="Their appointments stay in your history. Their records are kept until you delete them from your health records."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={busy}>
              Keep
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
