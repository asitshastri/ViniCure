import type { Metadata } from "next";
import { PrototypeHint } from "@/components/auth/notice";
import { RecordsView } from "@/components/records/records-view";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { WarningCircle } from "@phosphor-icons/react/ssr";
import { countByType, getShareTargets, listRecords } from "@/lib/data/records";
import { parseRecordQuery } from "@/lib/schemas/records";

export const metadata: Metadata = { title: "Health records" };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { type, q } = parseRecordQuery(raw);
  const failed = raw.state === "error";
  const empty = raw.state === "empty";

  return (
    <>
      <PageHeader
        title="Health records"
        description="Your reports, prescriptions and photos, kept private. Only you and the doctors you share them with can open them."
      />
      {failed ? (
        <EmptyState
          as="h2"
          icon={<WarningCircle />}
          title="We could not load your records"
          description="Your files are safe. Check your connection and try again."
          action={<ButtonLink href="/patient/records">Try again</ButtonLink>}
        />
      ) : (
        <RecordsView
          key={`${type}-${q}-${empty}`}
          initial={empty ? [] : listRecords({ type, q })}
          counts={empty ? { all: 0 } : countByType()}
          filter={type}
          q={q}
          targets={getShareTargets()}
        />
      )}
      <PrototypeHint>
        <p>
          Other states:{" "}
          <a className="underline" href="/patient/records?state=empty">
            no records
          </a>
          ,{" "}
          <a className="underline" href="/patient/records?state=error">
            load error
          </a>
          . The list shows a file that is uploading, one being scanned, and one that was rejected.
        </p>
      </PrototypeHint>
    </>
  );
}
