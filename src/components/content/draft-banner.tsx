import { Warning } from "@phosphor-icons/react/ssr";

/** Shown on every page whose text is a placeholder. Remove only when P9-10 lands reviewed text. */
export function DraftBanner() {
  return (
    <div
      role="note"
      className="bg-warning-soft text-warning border-warning/30 flex gap-3 rounded-xl border p-4"
    >
      <Warning aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
      <p>
        <strong>Draft, pending legal review.</strong> This text is a placeholder and is not legal
        advice. Parts in square brackets are still to be supplied.
      </p>
    </div>
  );
}
