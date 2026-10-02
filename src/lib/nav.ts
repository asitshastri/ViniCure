import {
  Bell,
  CalendarBlank,
  ChartLineUp,
  ClipboardText,
  CurrencyInr,
  FolderOpen,
  Gift,
  Headset,
  Heartbeat,
  IdentificationCard,
  Lifebuoy,
  MagnifyingGlass,
  Notebook,
  ShieldCheck,
  SquaresFour,
  Stethoscope,
  UserCircle,
  Users,
  UsersThree,
  VideoCamera,
} from "@phosphor-icons/react/ssr";
import type { MessageKey } from "@/i18n/translate";
import type { Role } from "@/lib/types";

export type NavIcon = typeof SquaresFour;
export type NavItem = { label: string; href: string; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export type RoleNav = {
  groups: NavGroup[];
  /** Four items for the phone tab bar. A "More" button opens the full menu as the fifth. */
  tabs: NavItem[];
  account: NavItem[];
};

export const publicNav: Array<{ key: MessageKey; href: string }> = [
  { key: "nav.findDoctors", href: "/doctors" },
  { key: "nav.specialties", href: "/specialties" },
  { key: "nav.howItWorks", href: "/how-it-works" },
  { key: "nav.forDoctors", href: "/for-doctors" },
  { key: "nav.healthBlog", href: "/blog" },
];

const accountItems = (base: string): NavItem[] => [
  { label: "Settings", href: `${base}/settings`, icon: UserCircle },
  { label: "Help", href: "/support", icon: Lifebuoy },
];

const patient: RoleNav = {
  groups: [
    {
      label: "Care",
      items: [
        { label: "Dashboard", href: "/patient/dashboard", icon: SquaresFour },
        { label: "Appointments", href: "/patient/appointments", icon: CalendarBlank },
        { label: "Find doctors", href: "/doctors", icon: MagnifyingGlass },
      ],
    },
    {
      label: "My health",
      items: [
        { label: "Records", href: "/patient/records", icon: FolderOpen },
        { label: "Medical history", href: "/patient/medical-history", icon: Notebook },
        { label: "Vitals", href: "/patient/health", icon: Heartbeat },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Profile and family", href: "/patient/profile", icon: UserCircle },
        { label: "Refer a friend", href: "/patient/referral", icon: Gift },
      ],
    },
  ],
  tabs: [
    { label: "Home", href: "/patient/dashboard", icon: SquaresFour },
    { label: "Visits", href: "/patient/appointments", icon: CalendarBlank },
    { label: "Doctors", href: "/doctors", icon: MagnifyingGlass },
    { label: "Records", href: "/patient/records", icon: FolderOpen },
  ],
  account: accountItems("/patient"),
};

const doctor: RoleNav = {
  groups: [
    {
      label: "Practice",
      items: [
        { label: "Dashboard", href: "/doctor/dashboard", icon: SquaresFour },
        { label: "Consultations", href: "/doctor/consultations", icon: VideoCamera },
        { label: "Schedule", href: "/doctor/calendar", icon: CalendarBlank },
        { label: "Patients", href: "/doctor/patients", icon: Users },
      ],
    },
    {
      label: "Business",
      items: [
        { label: "Earnings", href: "/doctor/earnings", icon: CurrencyInr },
        { label: "Profile and verification", href: "/doctor/profile", icon: IdentificationCard },
      ],
    },
  ],
  tabs: [
    { label: "Home", href: "/doctor/dashboard", icon: SquaresFour },
    { label: "Calls", href: "/doctor/consultations", icon: VideoCamera },
    { label: "Schedule", href: "/doctor/calendar", icon: CalendarBlank },
    { label: "Patients", href: "/doctor/patients", icon: Users },
  ],
  account: accountItems("/doctor"),
};

const admin: RoleNav = {
  groups: [
    {
      label: "Overview",
      items: [{ label: "Dashboard", href: "/admin/dashboard", icon: ChartLineUp }],
    },
    {
      label: "People",
      items: [
        { label: "Users", href: "/admin/users", icon: UsersThree },
        { label: "Doctors", href: "/admin/doctors", icon: Stethoscope },
        { label: "KYC reviews", href: "/admin/kyc", icon: IdentificationCard },
        { label: "Attendance", href: "/admin/attendance", icon: ClipboardText },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Appointments", href: "/admin/appointments", icon: CalendarBlank },
        { label: "Revenue and refunds", href: "/admin/revenue", icon: CurrencyInr },
      ],
    },
    {
      label: "Compliance",
      items: [
        { label: "Data requests", href: "/admin/data-requests", icon: ShieldCheck },
        { label: "Audit logs", href: "/admin/logs", icon: Notebook },
      ],
    },
  ],
  tabs: [
    { label: "Home", href: "/admin/dashboard", icon: ChartLineUp },
    { label: "Users", href: "/admin/users", icon: UsersThree },
    { label: "Doctors", href: "/admin/doctors", icon: Stethoscope },
    { label: "Visits", href: "/admin/appointments", icon: CalendarBlank },
  ],
  account: accountItems("/admin"),
};

const support: RoleNav = {
  groups: [
    {
      label: "Support",
      items: [
        { label: "Ticket queue", href: "/staff/queue", icon: Headset },
        { label: "User lookup", href: "/staff/lookup", icon: MagnifyingGlass },
        { label: "Break-glass access", href: "/staff/break-glass", icon: ShieldCheck },
      ],
    },
  ],
  tabs: [
    { label: "Queue", href: "/staff/queue", icon: Headset },
    { label: "Lookup", href: "/staff/lookup", icon: MagnifyingGlass },
    { label: "Access", href: "/staff/break-glass", icon: ShieldCheck },
    { label: "Alerts", href: "/staff/alerts", icon: Bell },
  ],
  account: accountItems("/staff"),
};

const byRole: Record<Role, RoleNav> = { patient, doctor, admin, support };

export function navFor(role: Role): RoleNav {
  return byRole[role];
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
