import { headers } from "next/headers";
import type { RealProfile } from "@/components/booking/booking-flow";
import { ageFromDob } from "@/lib/age";
import { actorFromHeaders } from "@/modules/identity";
import { getPatients } from "@/modules/patients";

/** The signed-in patient's own profiles, for choosing who a booking is for. Empty when limited. */
export async function loadBookingProfiles(): Promise<RealProfile[]> {
  const actor = await actorFromHeaders(await headers());
  if (!actor || actor.limited) return [];
  return (await getPatients().list(actor)).map((p) => ({
    id: p.id,
    name: p.fullName,
    relation: p.relation,
    isMinor: p.isMinor,
    age: ageFromDob(p.dob),
  }));
}
