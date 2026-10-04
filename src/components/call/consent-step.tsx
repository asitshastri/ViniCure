"use client";

import { useEffect, useId, useState } from "react";
import { Notice } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { agreeToConsents, loadConsents, type ConsentText } from "@/lib/data/consultation-api";

const TITLES: Record<string, string> = {
  telemedicine: "Online consultation terms",
  video: "Video call terms",
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; texts: ConsentText[] }
  | { kind: "closed" }
  | { kind: "error" };

/**
 * The agreements the server asks for before a first video call (P6-05). The texts shown are the
 * ones the server sent, and only those can be agreed to: the record names the exact text.
 */
export function ConsentStep({
  appointmentId,
  onDone,
  onBack,
}: {
  appointmentId: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const uid = useId();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  type Loaded = Awaited<ReturnType<typeof loadConsents>>;
  function show(result: Loaded) {
    if (result.status === "ok") {
      // Nothing left to agree to: carry on.
      if (result.required.length === 0) return onDone();
      setAgreed({});
      return setState({ kind: "ready", texts: result.required });
    }
    setState({ kind: result.status === "unavailable" ? "closed" : "error" });
  }

  function load() {
    setState({ kind: "loading" });
    return loadConsents(appointmentId).then(show);
  }

  useEffect(() => {
    // Load once when this step opens.
    let alive = true;
    void loadConsents(appointmentId).then((result) => {
      if (alive) show(result);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  useEffect(() => {
    document.getElementById("stage-h")?.focus();
  }, [state.kind]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "ready") return;
    setBusy(true);
    setProblem(null);
    const result = await agreeToConsents(
      appointmentId,
      state.texts.map((t) => t.policyId),
    );
    setBusy(false);
    if (result.status === "ok") return onDone();
    if (result.status === "stale") {
      setProblem("The terms were just updated. Please read them again.");
      return void load();
    }
    setProblem("We could not save your agreement. Nothing was changed. Try again.");
  }

  if (state.kind === "loading") {
    return (
      <div role="status" className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 tabIndex={-1} id="stage-h" className="text-2xl font-semibold outline-none">
          One moment
        </h1>
        <p className="text-ink-muted mt-2">Getting the terms for your video consultation.</p>
      </div>
    );
  }
  if (state.kind === "closed" || state.kind === "error") {
    return (
      <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
        <h1 tabIndex={-1} id="stage-h" className="text-2xl font-semibold outline-none">
          {state.kind === "closed"
            ? "Video visits are not open yet"
            : "We could not load the terms"}
        </h1>
        <Notice
          tone="warning"
          title={state.kind === "closed" ? "Please check back soon" : "Try again"}
        >
          {state.kind === "closed"
            ? "The terms for video consultations are not published yet. Your booking is safe."
            : "Check your connection and try again."}
        </Notice>
        <div className="flex gap-3">
          {state.kind === "error" ? <Button onClick={() => void load()}>Try again</Button> : null}
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const all = state.texts.every((t) => agreed[t.policyId]);
  return (
    <form onSubmit={submit} className="mx-auto grid max-w-2xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <h1 tabIndex={-1} id="stage-h" className="text-3xl font-semibold outline-none">
          Before your video consultation
        </h1>
        <p className="text-ink-muted mt-2 text-lg">
          Please read and agree. You only do this once for each version of the terms, and you can
          withdraw your agreement at any time.
        </p>
      </div>
      {problem ? (
        <Notice tone="danger" title="Not saved">
          {problem}
        </Notice>
      ) : null}
      {state.texts.map((t) => (
        <section
          key={t.policyId}
          aria-labelledby={`${uid}-${t.policyId}`}
          className="border-line bg-surface shadow-card grid gap-3 rounded-xl border p-5"
        >
          <h2 id={`${uid}-${t.policyId}`} className="text-xl font-semibold">
            {TITLES[t.kind] ?? "Terms"}
          </h2>
          <div
            tabIndex={0}
            role="region"
            aria-label={`${TITLES[t.kind] ?? "Terms"}, full text`}
            className="border-line max-h-56 overflow-y-auto rounded-lg border p-3 text-base whitespace-pre-wrap"
          >
            {t.body}
          </div>
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              className="accent-primary mt-1 size-5"
              checked={agreed[t.policyId] === true}
              onChange={(e) => setAgreed((a) => ({ ...a, [t.policyId]: e.target.checked }))}
            />
            <span>I have read and I agree to the {(TITLES[t.kind] ?? "terms").toLowerCase()}.</span>
          </label>
        </section>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={!all} loading={busy}>
          Agree and continue
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
