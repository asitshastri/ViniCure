import { Button } from "@/components/ui/button";
import { Notice } from "@/components/auth/notice";

type Props = { busy: boolean; failed?: boolean; label?: string; onRetryHint?: string };

/** Save button with an error message that explains what to do. Success is a toast, set by the form. */
export function SaveRow({ busy, failed = false, label = "Save changes" }: Props) {
  return (
    <div className="grid gap-3">
      {failed ? (
        <Notice tone="danger" title="Could not save">
          Nothing was changed. Check your connection and try again.
        </Notice>
      ) : null}
      <div>
        <Button type="submit" loading={busy}>
          {label}
        </Button>
      </div>
    </div>
  );
}
