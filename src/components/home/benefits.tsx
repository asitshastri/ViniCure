import { Bell, FileText, FirstAid, UsersThree } from "@phosphor-icons/react/ssr";
import { Section } from "./section";

const benefits = [
  {
    icon: FileText,
    title: "All your records in one place",
    text: "Prescriptions, reports and photos, sorted by type and ready to share with a doctor.",
  },
  {
    icon: UsersThree,
    title: "Care for the whole family",
    text: "Add parents and children and book for each, without a second account.",
  },
  {
    icon: Bell,
    title: "Reminders that arrive",
    text: "Appointment and follow-up reminders by SMS or WhatsApp, in your language.",
  },
  {
    icon: FirstAid,
    title: "Follow-up without starting over",
    text: "Your doctor sees your last visit, so you do not repeat your story.",
  },
];

export function Benefits() {
  return (
    <Section
      id="benefits"
      title="Your health, organised"
      intro="Everything after the call is as simple as the call."
    >
      <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {benefits.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4">
            <span className="bg-primary-soft text-primary flex size-12 shrink-0 items-center justify-center rounded-full">
              <Icon aria-hidden className="size-6" />
            </span>
            <div>
              <h3 className="text-ink text-lg font-semibold">{title}</h3>
              <p className="text-ink-muted mt-1 max-w-md">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
