"use client";

import { useId, useState } from "react";
import { ShieldCheck } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Radio } from "@/components/ui/choice";
import { Dialog } from "@/components/ui/dialog";
import { formatRupees } from "@/lib/format";
import { payForBooking } from "@/lib/data/booking";
import { upiSchema } from "@/lib/schemas/booking";
import type { PaymentMethod, PaymentResult } from "@/lib/types";
import { MOCK_UPI } from "@/mocks/booking";
import { PrototypeHint } from "@/components/auth/notice";

type Props = {
  open: boolean;
  amountPaise: number;
  onClose: () => void;
  onResult: (result: PaymentResult) => void;
};

/**
 * Stand-in for Razorpay Checkout. The real one is hosted by Razorpay, so card and bank details are never typed into
 * our page. Here only a UPI id is asked for, to reach every outcome.
 */
export function CheckoutDialog({ open, amountPaise, onClose, onResult }: Props) {
  const uid = useId();
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [upi, setUpi] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function pay() {
    if (method === "upi") {
      const parsed = upiSchema.safeParse(upi);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message);
        return;
      }
    }
    setError(undefined);
    setBusy(true);
    const input: { method: PaymentMethod; upiId?: string } = { method };
    if (method === "upi") input.upiId = upi.trim();
    const result = await payForBooking(input);
    setBusy(false);
    onResult(result);
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      variant="sheet"
      title={`Pay ${formatRupees(amountPaise)}`}
      description="Secure payment. This is a practice screen: no real money moves."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void pay()} loading={busy} size="lg">
            {busy ? "Confirming payment" : `Pay ${formatRupees(amountPaise)}`}
          </Button>
        </>
      }
    >
      <fieldset className="grid gap-3" disabled={busy}>
        <legend className="mb-1 font-semibold">Payment method</legend>
        <Radio
          name="method"
          label="UPI"
          checked={method === "upi"}
          onChange={() => setMethod("upi")}
        />
        <Radio
          name="method"
          label="Card"
          checked={method === "card"}
          onChange={() => setMethod("card")}
        />
        <Radio
          name="method"
          label="Net banking"
          checked={method === "netbanking"}
          onChange={() => setMethod("netbanking")}
        />
      </fieldset>

      {method === "upi" ? (
        <Field
          inputId={`${uid}-upi`}
          label="UPI ID"
          hint="For example name@bank"
          error={error}
          required
        >
          {({ describedBy, invalid }) => (
            <Input
              id={`${uid}-upi`}
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
      ) : (
        <p className="text-ink-muted flex gap-2">
          <ShieldCheck aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
          You will enter your {method === "card" ? "card" : "bank"} details on Razorpay’s secure
          page. ViniCure never sees or stores them.
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {busy ? "Confirming your payment. Please do not close this window." : ""}
      </p>

      <PrototypeHint>
        <p>Any valid UPI id pays successfully. Special ids:</p>
        <p>
          {MOCK_UPI.declined}: declined, {MOCK_UPI.bankDown}: bank unavailable
        </p>
        <p>
          {MOCK_UPI.pending}: payment pending, {MOCK_UPI.taken}: slot taken by someone else
        </p>
      </PrototypeHint>
    </Dialog>
  );
}
