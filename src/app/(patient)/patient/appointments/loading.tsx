import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading appointments" className="grid gap-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-8 w-48" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 w-full rounded-xl" />
      ))}
      <span className="sr-only">Loading your appointments</span>
    </div>
  );
}
