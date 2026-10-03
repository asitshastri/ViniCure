"use client";

import { useId, useState } from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react/ssr";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveSimple } from "@/lib/data/profile";
import { fieldErrors } from "@/lib/schemas/auth";
import { RELATIONS, newPersonSchema } from "@/lib/schemas/booking";
import type { FamilyMember } from "@/lib/types";

type Draft = { id: string; name: string; age: string; relation: string };
const blank: Draft = { id: "", name: "", age: "", relation: "" };

export function FamilyManager({ initial }: { initial: FamilyMember[] }) {
  const uid = useId();
  const { toast } = useToast();
  const [members, setMembers] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const ids = { name: `${uid}-fname`, age: `${uid}-fage`, relation: `${uid}-frel` };
  const formId = `${uid}-family`;
  const editing = draft?.id !== "" && draft !== null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const parsed = newPersonSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    await saveSimple();
    setBusy(false);
    const p = parsed.data;
    if (draft.id)
      setMembers((l) =>
        l.map((m) =>
          m.id === draft.id ? { ...m, name: p.name, age: p.age, relation: p.relation } : m,
        ),
      );
    else
      setMembers((l) => [
        ...l,
        { id: `fm-new-${l.length + 1}`, name: p.name, age: p.age, relation: p.relation },
      ]);
    toast({
      tone: "success",
      title: draft.id ? "Family member updated" : "Family member added",
      description: p.name,
    });
    setDraft(null);
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    await saveSimple();
    setBusy(false);
    setMembers((l) => l.filter((m) => m.id !== removing.id));
    toast({ tone: "success", title: "Removed", description: removing.name });
    setRemoving(null);
  }

  return (
    <div className="grid gap-4">
      {members.length ? (
        <ul className="divide-line border-line divide-y rounded-xl border">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}</p>
                <p className="text-ink-muted text-sm">
                  {m.relation}, {m.age} years
                </p>
              </div>
              {m.age < 18 ? <Badge tone="info">Child. You manage this profile</Badge> : null}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Edit ${m.name}`}
                onClick={() =>
                  setDraft({ id: m.id, name: m.name, age: String(m.age), relation: m.relation })
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
            <Field inputId={ids.age} label="Age in years" error={errors.age} required>
              {({ describedBy, invalid }) => (
                <Input
                  id={ids.age}
                  value={draft.age}
                  onChange={(e) => setDraft({ ...draft, age: e.target.value })}
                  inputMode="numeric"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
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
                  {[
                    ...RELATIONS,
                    ...(draft.relation && !(RELATIONS as readonly string[]).includes(draft.relation)
                      ? [draft.relation]
                      : []),
                  ].map((r) => (
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
