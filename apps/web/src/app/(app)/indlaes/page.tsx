import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ImportPanel } from "@/components/import/import-panel";
import { requireContext } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";
import { IMPORT_KINDS } from "@/lib/domain/csv-import";
import { IMPORT_PERMISSION, isImportKind } from "@/lib/import/kinds";
import { cn } from "@/lib/utils";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Indlæs fra fil" };

export default async function ImportPage({ searchParams }: PageProps<"/indlaes">) {
  const ctx = await requireContext(Object.values(IMPORT_PERMISSION));
  const t = da.importCsv;
  const allowed = IMPORT_KINDS.filter((k) => hasAny(ctx.permissions, [IMPORT_PERMISSION[k]]));
  const asked = (await searchParams).type;
  const kind = isImportKind(asked) && allowed.includes(asked) ? asked : allowed[0]!;
  return (
    <>
      <PageHeader title={t.title} help={t.help} />
      <nav aria-label={t.title} className="mb-6 flex flex-wrap gap-2">
        {allowed.map((k) => (
          <Link
            key={k}
            href={`/indlaes?type=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors pointer-coarse:min-h-11",
              k === kind
                ? "border-primary bg-secondary text-primary"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.kinds[k]}
          </Link>
        ))}
      </nav>
      {/* A new panel per kind, so a chosen file never carries over. */}
      <ImportPanel key={kind} kind={kind} />
    </>
  );
}
