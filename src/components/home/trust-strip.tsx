import { Database, Lock, SealCheck, ShieldCheck } from "@phosphor-icons/react/ssr";

const items = [
  {
    icon: SealCheck,
    title: "Registration checked",
    text: "Every doctor’s council number is verified first",
  },
  { icon: Lock, title: "Encrypted records", text: "Only you and your doctor can open them" },
  { icon: Database, title: "Data stays in India", text: "Stored in Indian data centres" },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    text: "See who viewed your records, withdraw consent any time",
  },
];

export function TrustStrip() {
  return (
    <section aria-label="Why you can trust ViniCure" className="px-4 pt-8 sm:px-6">
      <ul className="border-line mx-auto grid max-w-6xl gap-x-8 gap-y-6 border-b pb-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon aria-hidden className="text-primary mt-0.5 size-7 shrink-0" />
            <div>
              <p className="text-ink font-semibold">{title}</p>
              <p className="text-ink-muted text-sm">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
