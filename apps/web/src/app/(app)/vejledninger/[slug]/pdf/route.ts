import { getAppContext } from "@/lib/auth";
import { guideBySlug, guidesFor } from "@/lib/guides/guides";
import { renderGuidePdf } from "@/lib/guides/pdf";
import { todayIn } from "@/lib/domain/civil-date";
import { formatDate } from "@/lib/format";

/** A guide as a PDF, for users who may see it. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const app = await getAppContext();
  if (!app) return new Response(null, { status: 401 });
  const guide = guideBySlug(slug);
  if (!guide || !guidesFor(app.permissions).includes(guide))
    return new Response(null, { status: 404 });
  const pdf = await renderGuidePdf(guide, formatDate(todayIn(app.organization.timezone)));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="turnus-vejledning-${guide.slug}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
