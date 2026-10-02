import { CheckCircle, CloudArrowUp, ShieldCheck, WarningOctagon } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { RecordStatus } from "@/lib/types";

const map: Record<RecordStatus, { label: string; tone: BadgeTone; Icon: typeof CheckCircle }> = {
  uploading: { label: "Uploading", tone: "info", Icon: CloudArrowUp },
  scanning: { label: "Checking for viruses", tone: "warning", Icon: ShieldCheck },
  ready: { label: "Ready", tone: "success", Icon: CheckCircle },
  rejected: { label: "Not saved", tone: "danger", Icon: WarningOctagon },
};

export function StatusChip({ status }: { status: RecordStatus }) {
  const { label, tone, Icon } = map[status];
  return (
    <Badge tone={tone} icon={<Icon weight="fill" className="size-3.5" />}>
      {label}
    </Badge>
  );
}
