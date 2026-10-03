import { CalendarCheck, CheckCircle, Prohibit, UserMinus } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/lib/types";

const map: Record<AppointmentStatus, { label: string; tone: BadgeTone; Icon: typeof CheckCircle }> =
  {
    upcoming: { label: "Upcoming", tone: "info", Icon: CalendarCheck },
    completed: { label: "Completed", tone: "success", Icon: CheckCircle },
    cancelled: { label: "Cancelled", tone: "danger", Icon: Prohibit },
    no_show: { label: "Missed", tone: "warning", Icon: UserMinus },
  };

/** Icon and word together, so the status never depends on colour. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, tone, Icon } = map[status];
  return (
    <Badge tone={tone} icon={<Icon weight="fill" className="size-3.5" />}>
      {label}
    </Badge>
  );
}
