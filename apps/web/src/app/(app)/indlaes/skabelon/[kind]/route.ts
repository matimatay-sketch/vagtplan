import { getAppContext } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";
import { templateCsv } from "@/lib/domain/csv-import";
import { IMPORT_PERMISSION, isImportKind } from "@/lib/import/kinds";

/** A CSV template to fill in for one kind of import. */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const app = await getAppContext();
  if (!app) return new Response(null, { status: 401 });
  if (!isImportKind(kind)) return new Response(null, { status: 404 });
  if (!hasAny(app.permissions, [IMPORT_PERMISSION[kind]]))
    return new Response(null, { status: 403 });
  return new Response(templateCsv(kind), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="turnus_${kind}_skabelon.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
