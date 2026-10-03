"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CellSignalSlash, WifiSlash, X } from "@phosphor-icons/react/ssr";
import { useToast } from "@/components/ui/toast";

type Conn = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
};
const connection = (): Conn | undefined =>
  (navigator as Navigator & { connection?: Conn }).connection;

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}
function subscribeSlow(fn: () => void) {
  const c = connection();
  c?.addEventListener("change", fn);
  return () => c?.removeEventListener("change", fn);
}
const isSlow = () => {
  const c = connection();
  return Boolean(c && (c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.saveData));
};

const box =
  "fixed inset-x-4 bottom-24 z-[70] flex items-start gap-3 rounded-xl border p-4 shadow-pop lg:inset-x-auto lg:bottom-6 lg:left-6 lg:max-w-sm";

export function OfflineNotice() {
  return (
    <div role="status" className={`${box} border-warning bg-warning-soft text-warning`}>
      <WifiSlash aria-hidden weight="fill" className="mt-0.5 size-6 shrink-0" />
      <p>
        <strong>You are offline.</strong> What you have typed stays on this page. It saves when your
        connection is back.
      </p>
    </div>
  );
}

export function SlowNotice({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div role="status" className={`${box} border-info bg-info-soft text-info`}>
      <CellSignalSlash aria-hidden weight="fill" className="mt-0.5 size-6 shrink-0" />
      <p className="flex-1">
        <strong>Your connection is slow.</strong> Pages may take longer. A video call will switch to
        audio if it has to.
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
        >
          <X aria-hidden className="size-5" />
        </button>
      ) : null}
    </div>
  );
}

/** Watches the browser's own connection signals. Mounted once in the root layout. */
export function ConnectionStatus() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const slow = useSyncExternalStore(subscribeSlow, isSlow, () => false);
  const [dismissed, setDismissed] = useState(false);
  const { toast } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast({ title: "Back online", description: "Your changes can save again.", tone: "success" });
    }
  }, [online, toast]);

  if (!online) return <OfflineNotice />;
  if (slow && !dismissed) return <SlowNotice onDismiss={() => setDismissed(true)} />;
  return null;
}
