"use client";

import { useRef, useState } from "react";
import { CheckCircle, Copy, ShareNetwork } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ReferralInfo } from "@/lib/types";

const statusMap: Record<
  ReferralInfo["people"][number]["status"],
  { label: string; tone: BadgeTone }
> = {
  invited: { label: "Invited", tone: "neutral" },
  joined: { label: "Joined", tone: "info" },
  booked: { label: "Booked a consultation", tone: "success" },
};

export function ReferralView({ info }: { info: ReferralInfo }) {
  const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.link);
    } catch {
      // Clipboard can be blocked. Select the text so the person can copy it by hand.
      ref.current?.select();
      toast({
        tone: "info",
        title: "Press copy on your keyboard",
        description: "We selected the link for you.",
      });
      return;
    }
    setCopied(true);
    toast({ tone: "success", title: "Link copied" });
    setTimeout(() => setCopied(false), 2500);
  }

  const share = `https://wa.me/?text=${encodeURIComponent(`I use ViniCure to talk to registered doctors from home. Join with my link: ${info.link}`)}`;
  return (
    <div className="grid max-w-3xl gap-8">
      <section aria-labelledby="code-h" className="bg-primary-tint rounded-2xl p-6">
        <h2 id="code-h" className="text-xl font-semibold">
          Your invite link
        </h2>
        <p className="text-ink-muted mt-1">
          Your code is <strong className="text-ink tabular-nums">{info.code}</strong>. Friends can
          enter it when they sign up.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="ref-link" className="sr-only">
              Your invite link
            </label>
            <Input
              id="ref-link"
              ref={ref}
              readOnly
              value={info.link}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <Button onClick={() => void copy()}>
            {copied ? (
              <CheckCircle aria-hidden weight="fill" className="size-5" />
            ) : (
              <Copy aria-hidden className="size-5" />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a
            href={share}
            target="_blank"
            rel="noopener noreferrer"
            className="border-line-strong bg-surface text-ink hover:bg-primary-tint inline-flex h-11 items-center gap-2 rounded-lg border px-5 font-semibold"
          >
            <ShareNetwork aria-hidden className="size-5" /> Share on WhatsApp
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </section>

      <section aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="text-ink-muted mt-3 grid list-decimal gap-2 pl-5">
          <li>Send your link to a friend or family member.</li>
          <li>They sign up with their own mobile number.</li>
          <li>
            When they book their first consultation, you both get a reward. [Reward and terms to be
            confirmed.]
          </li>
        </ol>
        <p className="text-ink-muted mt-3 text-sm">
          We never message your friends. Only you choose who gets the link.
        </p>
      </section>

      <section aria-labelledby="people-h">
        <h2 id="people-h" className="mb-3 text-xl font-semibold">
          People you invited
        </h2>
        {info.people.length ? (
          <ul className="divide-line border-line bg-surface divide-y rounded-xl border">
            {info.people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-full font-semibold"
                >
                  {p.initials}
                </span>
                <span className="flex-1">
                  <span className="sr-only">Person with initials </span>
                  {p.initials}
                </span>
                <Badge tone={statusMap[p.status].tone}>{statusMap[p.status].label}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
            Nobody yet. Share your link to get started.
          </p>
        )}
      </section>
    </div>
  );
}
