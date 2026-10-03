import { redirect } from "next/navigation";

export default async function ConsultationIndex({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/consultation/${(await params).id}/lobby`);
}
