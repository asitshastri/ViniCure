"use client";

import { useId, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { searchMedicines } from "@/lib/data/console";
import type { Medicine } from "@/lib/types";

/** Search box with a result list that works with the keyboard: arrows move, Enter adds, Escape closes. */
export function MedicineSearch({ onPick }: { onPick: (m: Medicine) => void }) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = searchMedicines(q);
  const show = open && q.trim().length >= 2;

  function choose(m: Medicine) {
    onPick(m);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={`${uid}-in`} className="mb-1 block text-sm font-medium">
        Add a medicine
      </label>
      <Input
        id={`${uid}-in`}
        role="combobox"
        aria-expanded={show}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          show && results[active] ? `${uid}-o-${results[active].id}` : undefined
        }
        value={q}
        autoComplete="off"
        placeholder="Type at least 2 letters, e.g. para"
        leading={<MagnifyingGlass className="size-5" />}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && show && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      <ul
        id={`${uid}-list`}
        role="listbox"
        aria-label="Matching medicines"
        className={cn(
          "border-line bg-surface shadow-pop absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border",
          !show && "hidden",
        )}
      >
        {results.map((m, i) => (
          <li
            key={m.id}
            id={`${uid}-o-${m.id}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(m);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2",
              i === active && "bg-primary-soft",
            )}
          >
            <span className="font-medium">{m.name}</span>
            <span className="text-ink-muted text-sm">
              {m.form}, {m.strengths.join(" / ")}
            </span>
          </li>
        ))}
        {show && results.length === 0 ? (
          <li role="presentation" className="text-ink-muted p-3 text-sm">
            No match. Try the generic name.
          </li>
        ) : null}
      </ul>
      <span role="status" className="sr-only">
        {show ? `${results.length} ${results.length === 1 ? "medicine" : "medicines"} found` : ""}
      </span>
    </div>
  );
}
