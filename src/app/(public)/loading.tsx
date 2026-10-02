import { LoadingView } from "@/components/states/loading-view";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <LoadingView label="Loading this page" />
    </div>
  );
}
