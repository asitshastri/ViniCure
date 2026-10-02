"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarBlank,
  FileText,
  Heartbeat,
  MagnifyingGlass,
  ShieldCheck,
  Stethoscope,
  VideoCamera,
} from "@phosphor-icons/react/ssr";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, StatTile } from "@/components/ui/card";
import { Checkbox, Radio, Switch } from "@/components/ui/choice";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { OtpInput } from "@/components/ui/otp-input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { TBody, THead, Table, Td, Th, Tr, type SortState } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

const swatches: Array<[string, string, string]> = [
  ["primary", "bg-primary", "text-white"],
  ["primary-hover", "bg-primary-hover", "text-white"],
  ["primary-soft", "bg-primary-soft", "text-ink"],
  ["primary-tint", "bg-primary-tint", "text-ink"],
  ["canvas", "bg-canvas", "text-ink"],
  ["surface", "bg-surface", "text-ink"],
  ["ink", "bg-ink", "text-white"],
  ["ink-muted", "bg-ink-muted", "text-white"],
  ["ink-faint", "bg-ink-faint", "text-white"],
  ["line", "bg-line", "text-ink"],
  ["line-strong", "bg-line-strong", "text-ink"],
  ["dock", "bg-dock", "text-white"],
  ["info", "bg-info", "text-white"],
  ["success", "bg-success", "text-white"],
  ["warning", "bg-warning", "text-white"],
  ["danger", "bg-danger", "text-white"],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line flex flex-col gap-4 border-t pt-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const rows = [
  { id: "A-1042", name: "Asha Verma", slot: "10:30", status: "Confirmed" },
  { id: "A-1043", name: "Rohan Shah", slot: "11:15", status: "Waiting" },
  { id: "A-1044", name: "Kavya Iyer", slot: "12:00", status: "Pending" },
];

export function DesignDemo() {
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [available, setAvailable] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(3);
  const [sort, setSort] = useState<SortState>("asc");

  const sorted = [...rows].sort((a, b) =>
    sort === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Badge tone="warning">Developer preview, not shown in production</Badge>
        <h1 className="text-4xl font-semibold">ViniCure design system</h1>
        <p className="text-ink-muted max-w-2xl">
          Every shared component and its states. Tab through this page: every control must show a
          focus ring.
        </p>
      </header>

      <Section title="Logo">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-line bg-surface flex items-center justify-center rounded-xl border p-6">
            <Logo className="h-14" />
          </div>
          <div className="bg-dock flex items-center justify-center rounded-xl p-6">
            <Logo variant="light" className="h-14" />
          </div>
        </div>
      </Section>

      <Section title="Colors">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {swatches.map(([name, bg, text]) => (
            <div
              key={name}
              className={`${bg} ${text} border-line flex h-20 items-end rounded-lg border p-2 text-xs font-semibold`}
            >
              {name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="font-display text-5xl font-semibold">Care that comes to you</p>
          <p className="font-display text-3xl font-semibold">Talk to a verified doctor</p>
          <p className="font-display text-xl font-semibold">Book in under two minutes</p>
          <p className="text-base">
            Body text at 16 pixels. Fee ₹499, slot 10:30 IST. Numbers in tables line up.
          </p>
          <p className="text-ink-muted text-sm">Secondary text at 14 pixels.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Book consultation</Button>
          <Button variant="secondary">View profile</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">End call</Button>
          <span className="bg-dock on-dark rounded-lg p-2">
            <Button variant="dock">Mute</Button>
          </span>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" variant="secondary" aria-label="Search">
            <MagnifyingGlass aria-hidden className="size-5" />
          </Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Phone number" hint="We will send a one-time password." required>
            {(p) => (
              <Input
                id={p.id}
                aria-describedby={p.describedBy}
                aria-invalid={p.invalid || undefined}
                required={p.required}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
              />
            )}
          </Field>
          <Field label="Email" error="Enter an email address like name@example.com.">
            {(p) => (
              <Input
                id={p.id}
                aria-describedby={p.describedBy}
                aria-invalid={p.invalid || undefined}
                type="email"
                defaultValue="asha@"
              />
            )}
          </Field>
          <Field label="Search doctors">
            {(p) => (
              <Input
                id={p.id}
                type="search"
                leading={<MagnifyingGlass className="size-5" />}
                placeholder="Specialty or name"
              />
            )}
          </Field>
          <Field label="Language">
            {(p) => (
              <Select id={p.id} defaultValue="en">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="gu">ગુજરાતી</option>
              </Select>
            )}
          </Field>
          <Field label="What is the problem?" className="md:col-span-2">
            {(p) => <Textarea id={p.id} placeholder="Describe your symptoms" />}
          </Field>
          <div className="flex flex-col gap-3">
            <Checkbox
              label="I agree to the consent for video consultation"
              description="You can withdraw consent at any time."
            />
            <Checkbox label="Disabled option" disabled />
          </div>
          <div className="flex flex-col gap-3">
            <Radio name="mode" label="Video consultation" defaultChecked />
            <Radio name="mode" label="Audio only" />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={available}
              onCheckedChange={setAvailable}
              label="Accepting consultations"
            />
            <span>{available ? "You are available" : "You are away"}</span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Enter the 6 digit OTP</p>
            <OtpInput
              value={otp}
              onChange={setOtp}
              onComplete={() => toast({ title: "OTP entered", tone: "success" })}
            />
          </div>
        </div>
      </Section>

      <Section title="Cards, stats, badges, avatars">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<VideoCamera className="size-5" />}
            label="Consultations today"
            value="6"
            change="+12%"
            note="vs last week"
          />
          <StatTile
            icon={<FileText className="size-5" />}
            label="Follow-ups pending"
            value="3"
            change="-1"
            direction="down"
            good
          />
          <StatTile
            icon={<Heartbeat className="size-5" />}
            label="Active cases"
            value="7"
            change="+2"
            direction="up"
            good={false}
          />
          <StatTile
            icon={<CalendarBlank className="size-5" />}
            label="Next slot"
            value="10:30"
            note="IST"
          />
        </div>
        <Card className="flex flex-wrap items-center gap-4">
          <Avatar name="Dr. Maya Rao" size="lg" />
          <div className="flex flex-col">
            <CardTitle>Dr. Maya Rao</CardTitle>
            <p className="text-ink-muted text-sm">
              General Physician · Reg. no. XXXX-000000 (sample)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success" icon={<ShieldCheck weight="fill" className="size-3.5" />}>
              Verified
            </Badge>
            <Badge tone="primary">Hindi, English</Badge>
            <Badge tone="info">Follow-up</Badge>
            <Badge tone="warning">Waiting</Badge>
            <Badge tone="danger">Allergy: penicillin</Badge>
            <Badge>Draft</Badge>
          </div>
        </Card>
      </Section>

      <Section title="Tabs and accordion">
        <Tabs
          label="Records"
          items={[
            { id: "all", label: "All", count: 8, panel: <p>All files appear here.</p> },
            { id: "reports", label: "Reports", panel: <p>Blood tests and scans.</p> },
            { id: "rx", label: "Prescriptions", panel: <p>Issued prescriptions.</p> },
          ]}
        />
        <Accordion>
          <AccordionItem group="faq" question="Is my consultation private?" defaultOpen>
            Yes. Calls and records are encrypted, and only you and your doctor can see them.
          </AccordionItem>
          <AccordionItem group="faq" question="Can I get a prescription?">
            Your doctor can issue one during the consultation when it is medically appropriate.
          </AccordionItem>
        </Accordion>
      </Section>

      <Section title="Dialog, sheet, toast, tooltip">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Appointment confirmed",
                description: "Tomorrow, 10:30 IST",
                tone: "success",
              })
            }
          >
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Payment failed",
                description: "No money was taken. Try again.",
                tone: "danger",
              })
            }
          >
            Error toast
          </Button>
          <Tooltip content="Your video is end-to-end protected in transit">
            {(describedBy) => (
              <Button variant="ghost" aria-describedby={describedBy}>
                Why is this secure?
              </Button>
            )}
          </Tooltip>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Cancel this appointment?"
          description="Your slot will be released. You will get a refund if the rules allow it."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Keep appointment
              </Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)}>
                Cancel appointment
              </Button>
            </>
          }
        />
        <Dialog
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          variant="sheet"
          title="Quick prescription"
          description="Choose a dose, how often and when to take it."
          footer={<Button onClick={() => setSheetOpen(false)}>Save and send</Button>}
        >
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">Paracetamol 650</Badge>
            <Badge>Twice daily</Badge>
            <Badge>After food</Badge>
          </div>
        </Dialog>
      </Section>

      <Section title="Table, pagination, empty, loading, stepper">
        <Table>
          <THead>
            <tr>
              <Th>ID</Th>
              <Th sort={sort} onSort={() => setSort(sort === "asc" ? "desc" : "asc")}>
                Patient
              </Th>
              <Th>Slot (IST)</Th>
              <Th>Status</Th>
            </tr>
          </THead>
          <TBody>
            {sorted.map((r) => (
              <Tr key={r.id}>
                <Td>{r.id}</Td>
                <Td>{r.name}</Td>
                <Td>{r.slot}</Td>
                <Td>
                  <Badge
                    tone={
                      r.status === "Confirmed"
                        ? "success"
                        : r.status === "Waiting"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {r.status}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageCount={12} onPageChange={setPage} />
        <EmptyState
          icon={<Stethoscope />}
          title="No appointments yet"
          description="When you book a consultation, it will show up here."
          action={<Button>Find a doctor</Button>}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-6 w-1/2" />
            <SkeletonText lines={3} />
          </Card>
          <Card className="flex items-center">
            <Stepper steps={["Doctor", "Slot", "Details", "Pay"]} current={2} className="w-full" />
          </Card>
        </div>
      </Section>
    </main>
  );
}
