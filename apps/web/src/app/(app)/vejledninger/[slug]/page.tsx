import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireContext } from "@/lib/auth";
import { guideBySlug, guidesFor } from "@/lib/guides/guides";
import { da } from "@/lib/i18n/da";

export async function generateMetadata({
  params,
}: PageProps<"/vejledninger/[slug]">): Promise<Metadata> {
  return { title: guideBySlug((await params).slug)?.title ?? da.guides.title };
}

export default async function GuidePage({ params }: PageProps<"/vejledninger/[slug]">) {
  const ctx = await requireContext();
  const guide = guideBySlug((await params).slug);
  if (!guide || !guidesFor(ctx.permissions).includes(guide)) notFound();
  const t = da.guides;
  return (
    <article className="mx-auto max-w-3xl" data-testid="guide">
      <Link
        href="/vejledninger"
        className="mb-4 inline-flex min-h-9 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.back}
      </Link>
      <PageHeader
        title={guide.title}
        lead={guide.lead}
        actions={
          <Button variant="outline" asChild>
            <a href={`/vejledninger/${guide.slug}/pdf`} download>
              <FileDown /> {t.pdf}
            </a>
          </Button>
        }
      />
      <nav aria-label={t.contents} className="mb-8 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">{t.contents}</h2>
        <ol className="grid list-decimal gap-1 pl-5 text-sm sm:grid-cols-2">
          {guide.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary underline-offset-4 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="grid gap-10">
        {guide.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-20" aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`} className="mb-3 text-xl font-semibold">
              {i + 1}. {s.title}
            </h2>
            <div className="grid gap-3 leading-relaxed">
              {s.text.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.steps ? (
                <ol className="grid list-decimal gap-1.5 pl-6 marker:font-semibold marker:text-primary">
                  {s.steps.map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {s.tip ? (
                <p className="flex gap-2 rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">
                  <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {s.tip}
                </p>
              ) : null}
              {s.image ? (
                <figure className="mt-2">
                  <Image
                    src={`/vejledninger/${s.image}`}
                    alt={s.imageAlt ?? ""}
                    width={1200}
                    height={900}
                    className="mx-auto h-auto max-h-[32rem] w-auto rounded-lg border shadow-sm"
                  />
                  <figcaption className="mt-2 text-center text-sm text-muted-foreground">
                    {s.imageAlt}
                  </figcaption>
                </figure>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
