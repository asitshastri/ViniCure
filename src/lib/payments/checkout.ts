// The Razorpay checkout widget (P5-04). The widget is Razorpay's own script and window, so card
// and bank details are typed into their page and never reach ours. We pass the order, the public
// key id and the amount shown; we pass no name, phone or email of the patient (the widget asks).

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type WidgetResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type WidgetOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  theme: { color: string };
  handler: (response: WidgetResponse) => void;
  modal: { ondismiss: () => void };
};
type WidgetInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    callback: (response: { error?: { code?: string } }) => void,
  ) => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: WidgetOptions) => WidgetInstance;
  }
}

let loading: Promise<void> | undefined;

/** Loads the widget script once. Fails if it cannot be fetched (offline, blocked). */
export function loadCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("checkout script failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type CheckoutResult =
  | { kind: "paid"; orderId: string; gatewayPaymentId: string; signature: string }
  | { kind: "dismissed" }
  | { kind: "failed"; code: string }
  | { kind: "unavailable" };

/** Opens the widget and resolves once, with whatever the person did. */
export async function openCheckout(input: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  description: string;
}): Promise<CheckoutResult> {
  try {
    await loadCheckoutScript();
  } catch {
    return { kind: "unavailable" };
  }
  const Widget = window.Razorpay;
  if (!Widget) return { kind: "unavailable" };
  return new Promise<CheckoutResult>((resolve) => {
    let done = false;
    // A failed attempt does not end checkout (the widget lets the person try again), so a failure
    // is reported only if the person then closes the widget without paying.
    let failure: string | undefined;
    const finish = (result: CheckoutResult) => {
      if (done) return;
      done = true;
      resolve(result);
    };
    const widget = new Widget({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amountPaise,
      currency: "INR",
      name: "ViniCure",
      description: input.description,
      theme: { color: "#146C6C" },
      handler: (r) =>
        finish({
          kind: "paid",
          orderId: r.razorpay_order_id,
          gatewayPaymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
        }),
      modal: {
        ondismiss: () =>
          finish(failure ? { kind: "failed", code: failure } : { kind: "dismissed" }),
      },
    });
    widget.on("payment.failed", (r) => {
      failure = r.error?.code ?? "failed";
    });
    widget.open();
  });
}
