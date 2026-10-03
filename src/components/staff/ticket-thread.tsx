"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { sendReply } from "@/lib/data/staff";
import type { Ticket } from "@/lib/types";

type Template = { id: string; label: string; text: string };

export function TicketThread({
  ticket,
  templates,
  agent,
}: {
  ticket: Ticket;
  templates: Template[];
  agent: string;
}) {
  const [messages, setMessages] = useState(ticket.messages);
  const [status, setStatus] = useState(ticket.status);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function send(solve: boolean) {
    if (text.trim().length < 5) {
      setError("Write your reply first.");
      return;
    }
    setBusy(true);
    await sendReply();
    setBusy(false);
    setMessages((m) => [...m, { from: "agent", name: agent, at: "Just now", text: text.trim() }]);
    setStatus(solve ? "solved" : "waiting");
    setText("");
    setError(undefined);
    toast({
      title: solve ? "Reply sent. Ticket solved" : "Reply sent",
      description: `${ticket.id}. Recorded in the audit log.`,
      tone: "success",
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <p className="text-ink-muted text-sm">
        Status:{" "}
        <strong className="text-ink">
          {status === "new"
            ? "New"
            : status === "open"
              ? "Open"
              : status === "waiting"
                ? "Waiting for them"
                : "Solved"}
        </strong>
      </p>
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.from === "agent"
                ? "bg-primary-tint border-line ml-auto w-full max-w-[85%] rounded-xl border p-4"
                : "border-line bg-surface w-full max-w-[85%] rounded-xl border p-4"
            }
          >
            <p className="mb-1 text-sm font-semibold">
              {m.name} <span className="text-ink-muted font-normal">{m.at}</span>
            </p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </li>
        ))}
      </ol>
      {status !== "solved" ? (
        <div className="border-line bg-surface grid gap-4 rounded-xl border p-4">
          <p className="text-ink-muted text-sm">
            Do not give medical advice. If the person describes an emergency, tell them to call 112.
          </p>
          <Field label="Insert a saved reply">
            {({ id }) => (
              <Select
                id={id}
                value=""
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  if (t) setText((cur) => (cur ? `${cur}\n\n${t.text}` : t.text));
                }}
                className="max-w-xs"
              >
                <option value="">Choose one</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Your reply" error={error} required>
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={4}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(undefined);
                }}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button loading={busy} onClick={() => void send(false)}>
              Send reply
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void send(true)}>
              Send and mark solved
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-ink-muted">
          This ticket is solved. The person can reopen it by replying.
        </p>
      )}
    </div>
  );
}
