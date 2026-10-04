import type { Metadata } from "next";
import { AvailabilityEditor } from "@/components/doctor/availability-editor";
import { HoursEditor } from "@/components/doctor/hours-editor";
import { TimeOffManager } from "@/components/doctor/time-off";
import { TimeOffReal } from "@/components/doctor/time-off-real";
import { SectionCard } from "@/components/profile/section-card";
import { PageHeader } from "@/components/shell/page-header";
import {
  formatClock,
  getAvailability,
  getDoctorConsults,
  getTimeOff,
  getTodayDate,
} from "@/lib/data/doctor";
import { loadRealSchedule } from "@/lib/data/schedule-real";
import { isRealDirectory } from "@/lib/data/directory-real";
import { formatSlotDay } from "@/lib/data/doctors";

export const metadata: Metadata = { title: "Schedule" };

export default async function CalendarPage() {
  // The doctor's real bookings, hours and time off when the database is configured.
  const real = isRealDirectory() ? await loadRealSchedule() : null;
  const today = getTodayDate();
  const booked = real
    ? real.booked
    : getDoctorConsults()
        .filter((c) => c.status === "upcoming" && c.date >= today)
        .map((c) => ({
          id: c.id,
          date: c.date,
          time: c.time,
          patientName: c.patientName,
          reason: c.reason,
        }));
  const dates = [...new Set(booked.map((c) => c.date))].sort();
  const availability = getAvailability();

  return (
    <>
      <PageHeader
        title="Schedule"
        description="See what is booked, and set the hours patients can book you."
      />
      <div className="grid max-w-3xl gap-6">
        <SectionCard
          id="booked"
          title="Booked this week"
          description="Times are in Indian Standard Time."
        >
          {dates.length ? (
            <div className="grid gap-5">
              {dates.map((d) => (
                <div key={d}>
                  <h3 className="text-lg font-semibold">{formatSlotDay(d)}</h3>
                  <ul className="mt-2 grid gap-2">
                    {booked
                      .filter((c) => c.date === d)
                      .map((c) => (
                        <li
                          key={c.id}
                          className="bg-primary-tint flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-2"
                        >
                          <span className="w-20 font-semibold tabular-nums">
                            {formatClock(c.time)}
                          </span>
                          <span>{c.patientName}</span>
                          {c.reason ? (
                            <span className="text-ink-muted text-sm">{c.reason}</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ink-muted">Nothing booked yet.</p>
          )}
        </SectionCard>
        <SectionCard
          id="hours"
          title="Your weekly hours"
          description="Patients can book only inside these hours. Changes apply to new bookings."
        >
          {real ? (
            <HoursEditor initial={real.rules} />
          ) : (
            <AvailabilityEditor initial={availability} />
          )}
        </SectionCard>
        <SectionCard
          id="time-off"
          title="Time off"
          description="Block days when you cannot see patients."
        >
          {real ? (
            <TimeOffReal initial={real.timeOff} />
          ) : (
            <TimeOffManager initial={getTimeOff()} />
          )}
        </SectionCard>
      </div>
    </>
  );
}
