import { Section } from "./section";

const steps = [
  {
    title: "Choose a doctor",
    text: "Search by symptom, specialty or language. Every profile shows the registration number, fee and next free time.",
  },
  {
    title: "Book and pay",
    text: "Pick a time, say who the visit is for and add a short note or photo. Pay by UPI, card or net banking.",
  },
  {
    title: "Talk and get your prescription",
    text: "Join from your phone at the time. After the call, the prescription and any advice appear in your records.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="How it works"
      intro="Three steps, usually under ten minutes to your first call."
      tone="tint"
    >
      <ol className="grid gap-8 lg:grid-cols-3 lg:gap-10">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4 lg:flex-col">
            <span
              aria-hidden
              className="font-display bg-primary flex size-12 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-ink text-xl font-semibold">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="text-ink-muted mt-2 max-w-sm">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
