import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input, Select } from "@/components/ui/field";
import { FEE_CAPS, DOCTOR_SORTS, SORT_LABELS, type DirectoryQuery } from "@/lib/schemas/doctors";
import type { Specialty } from "@/lib/types";
import { FilterPanel } from "./filter-panel";

type Props = {
  query: DirectoryQuery;
  specialties: Specialty[];
  languages: string[];
  activeCount: number;
};

function Labeled({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-ink mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A plain GET form: the URL holds all the state and it works without JavaScript. */
export function DirectoryFilters({ query, specialties, languages, activeCount }: Props) {
  return (
    <form
      action="/doctors"
      method="get"
      role="search"
      aria-label="Find doctors"
      className="grid gap-4"
    >
      <Labeled id="f-q" label="Doctor or symptom">
        <Input
          id="f-q"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          autoComplete="off"
          maxLength={80}
          placeholder="Fever, skin rash, Dr. Rao"
          leading={<MagnifyingGlass className="size-5" />}
        />
      </Labeled>
      <FilterPanel activeCount={activeCount}>
        <div className="grid gap-4">
          <Labeled id="f-specialty" label="Specialty">
            <Select id="f-specialty" name="specialty" defaultValue={query.specialty ?? ""}>
              <option value="">All specialties</option>
              {specialties.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled id="f-language" label="Language">
            <Select id="f-language" name="language" defaultValue={query.language ?? ""}>
              <option value="">Any language</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled id="f-fee" label="Fee up to">
            <Select
              id="f-fee"
              name="maxFee"
              defaultValue={query.maxFee ? String(query.maxFee) : ""}
            >
              <option value="">Any fee</option>
              {FEE_CAPS.map((c) => (
                <option key={c} value={c}>
                  ₹{c}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled id="f-sort" label="Sort by">
            <Select id="f-sort" name="sort" defaultValue={query.sort}>
              {DOCTOR_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </Select>
          </Labeled>
          <Checkbox
            id="f-today"
            name="today"
            value="1"
            defaultChecked={query.today}
            label="Available today"
          />
        </div>
      </FilterPanel>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="flex-1 lg:flex-none">
          Apply
        </Button>
        {activeCount > 0 || query.q ? (
          <Link
            href="/doctors"
            className="text-primary min-h-11 content-center font-semibold underline"
          >
            Clear all
          </Link>
        ) : null}
      </div>
    </form>
  );
}
