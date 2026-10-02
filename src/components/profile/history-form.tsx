"use client";

import { useId, useState } from "react";
import { Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveSimple } from "@/lib/data/profile";
import { medicineForm } from "@/lib/schemas/profile";
import type { MedicalHistory } from "@/lib/types";
import { SaveRow } from "./save-row";
import { TagEditor } from "./tag-editor";

export function HistoryForm({ initial }: { initial: MedicalHistory }) {
  const uid = useId();
  const { toast } = useToast();
  const [conditions, setConditions] = useState(initial.conditions);
  const [allergies, setAllergies] = useState(initial.allergies);
  const [medicines, setMedicines] = useState(initial.medicines);
  const [med, setMed] = useState({ name: "", dose: "" });
  const [medErrors, setMedErrors] = useState<{ name?: string; dose?: string }>({});
  const [busy, setBusy] = useState(false);

  function addMedicine() {
    const parsed = medicineForm.safeParse(med);
    if (!parsed.success) {
      const next: { name?: string; dose?: string } = {};
      for (const i of parsed.error.issues) next[i.path[0] as "name" | "dose"] ??= i.message;
      return setMedErrors(next);
    }
    setMedErrors({});
    setMedicines((l) => [...l, { id: `m-${l.length + 1}-${parsed.data.name}`, ...parsed.data }]);
    setMed({ name: "", dose: "" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await saveSimple();
    setBusy(false);
    toast({
      tone: "success",
      title: "Medical history saved",
      description: "Your doctor sees it before your next consultation.",
    });
  }

  return (
    <form noValidate onSubmit={(e) => void save(e)} className="grid gap-8">
      <TagEditor
        label="Health conditions"
        hint="For example: Type 2 diabetes. Press Enter or choose Add."
        items={conditions}
        onChange={setConditions}
        emptyText="None added."
      />
      <TagEditor
        label="Allergies"
        hint="Medicines, food or anything else. For example: Penicillin."
        items={allergies}
        onChange={setAllergies}
        emptyText="No known allergies added."
      />

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">Medicines you take now</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field inputId={`${uid}-mn`} label="Medicine" error={medErrors.name}>
            {({ describedBy, invalid }) => (
              <Input
                id={`${uid}-mn`}
                value={med.name}
                onChange={(e) => setMed({ ...med, name: e.target.value })}
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field
            inputId={`${uid}-md`}
            label="Dose and timing"
            hint="For example: 500 mg, twice a day"
            error={medErrors.dose}
          >
            {({ describedBy, invalid }) => (
              <Input
                id={`${uid}-md`}
                value={med.dose}
                onChange={(e) => setMed({ ...med, dose: e.target.value })}
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Button type="button" variant="secondary" onClick={addMedicine}>
            Add medicine
          </Button>
        </div>
        {medicines.length ? (
          <ul className="divide-line border-line divide-y rounded-xl border">
            {medicines.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3">
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{m.name}</span>
                  {m.dose ? <span className="text-ink-muted">. {m.dose}</span> : null}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${m.name}`}
                  className="text-danger"
                  onClick={() => setMedicines((l) => l.filter((x) => x.id !== m.id))}
                >
                  <Trash aria-hidden className="size-4" /> Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted text-sm">No medicines added.</p>
        )}
      </fieldset>

      <p className="text-ink-muted text-sm">
        Last updated {initial.updatedOn}. Doctors see this only for consultations you book, and you
        can change it any time.
      </p>
      <SaveRow busy={busy} label="Save history" />
    </form>
  );
}
