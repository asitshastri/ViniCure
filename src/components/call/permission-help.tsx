import { Accordion, AccordionItem } from "@/components/ui/accordion";

/** Plain steps for the most common browsers. Shown only when a device is blocked or missing. */
export function PermissionHelp({ kind }: { kind: "blocked" | "missing" }) {
  return (
    <section aria-labelledby="help-h" className="bg-warning-soft rounded-xl p-5">
      <h2 id="help-h" className="text-warning text-xl font-semibold">
        {kind === "blocked"
          ? "Your camera or microphone is blocked"
          : "We could not find a microphone"}
      </h2>
      <p className="mt-1">
        {kind === "blocked"
          ? "ViniCure can only use them if you allow it. We never record without your agreement."
          : "Plug in a headset or check that no other app is using it, then press Check again."}
      </p>
      {kind === "blocked" ? (
        <Accordion className="mt-4">
          <AccordionItem question="Chrome on Android" group="perm">
            Tap the lock icon next to the address, choose Permissions, then allow Camera and
            Microphone. Reload the page.
          </AccordionItem>
          <AccordionItem question="Safari on iPhone" group="perm">
            Open Settings, then Safari, then Camera and Microphone, and choose Allow for this site.
            Come back and press Check again.
          </AccordionItem>
          <AccordionItem question="Chrome or Edge on a computer" group="perm">
            Click the lock or camera icon at the left of the address bar, switch Camera and
            Microphone to Allow, then reload.
          </AccordionItem>
        </Accordion>
      ) : null}
      <p className="mt-3 text-sm">
        Still stuck? Your doctor can speak to you by phone call. Contact support from the help link.
      </p>
    </section>
  );
}
